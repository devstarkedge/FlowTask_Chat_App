import Canvas from "./canvas.model.js";
import CanvasBlock from "./canvasBlock.model.js";
import CanvasComment from "./canvasComment.model.js";
import canvasService from "./canvas.service.js";
import redisClient from "../../utils/redisClient.js";
import logger from "../../utils/logger.js";
import channelRepository from "../channels/channel.repository.js";
import { emitToUser } from "../../sockets/socketManager.js";

// Helper to construct Redis presence keys
const getPresenceKey = (canvasId) => `canvas:presence:${canvasId}`;

export default function registerCanvasSocket(io, socket) {
  const user = socket.chatUser;
  if (!user) return;

  const userId = user._id.toString();
  const userName = user.name;
  const userAvatar = user.avatar || null;
  const workspaceId = socket.workspaceId;

  // Track canvases joined by this specific socket session for auto-cleanup on disconnect
  const joinedCanvases = new Set();

  const getSocketCanvas = async (canvasId) => {
    if (!canvasId || !workspaceId) return null;
    return Canvas.findOne({ _id: canvasId, workspaceId }).lean();
  };

  // ── Join Canvas Presence
  socket.on("canvas:join", async ({ canvasId }) => {
    try {
      if (!canvasId) return;
      const canvas = await getSocketCanvas(canvasId);
      if (!canvas) {
        socket.emit("error", { message: "Canvas not found" });
        return;
      }
      const room = `canvas:${canvasId}`;
      socket.join(room);
      joinedCanvases.add(canvasId);

      const presenceKey = getPresenceKey(canvasId);
      const memberInfo = JSON.stringify({
        userId,
        name: userName,
        avatar: userAvatar,
        joinedAt: Date.now(),
      });

      // Cache user details in Redis hash
      await redisClient.hset(presenceKey, userId, memberInfo);

      // Fetch all active members in the canvas
      const allMembersRaw = await redisClient.hgetall(presenceKey);
      const activeUsers = Object.values(allMembersRaw).map((raw) => {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      }).filter(Boolean);

      // Notify the joining user with the complete user list
      socket.emit("canvas:presence:list", { canvasId, users: activeUsers });

      // Broadcast the new joining user to everyone else
      socket.to(room).emit("canvas:presence:join", {
        canvasId,
        user: { userId, name: userName, avatar: userAvatar },
      });

      logger.info("[CANVAS SOCKET] User joined canvas room", { canvasId, userId });
    } catch (error) {
      logger.error("[CANVAS SOCKET] Error in canvas:join", { error: error.message, userId });
    }
  });

  // ── Leave Canvas Presence
  socket.on("canvas:leave", async ({ canvasId }) => {
    try {
      if (!canvasId) return;
      const room = `canvas:${canvasId}`;
      joinedCanvases.delete(canvasId);
      socket.leave(room);

      const presenceKey = getPresenceKey(canvasId);
      await redisClient.hdel(presenceKey, userId);

      // Broadcast user departure
      socket.to(room).emit("canvas:presence:leave", { canvasId, userId });

      logger.info("[CANVAS SOCKET] User left canvas room", { canvasId, userId });
    } catch (error) {
      logger.error("[CANVAS SOCKET] Error in canvas:leave", { error: error.message, userId });
    }
  });

  // ── Channel-level Canvas Tabs (shared across clients)
  const getChannelTabsKey = (workspaceId, channelId) => `canvas:tabs:${workspaceId}:${channelId}`;

  // Client requests the current tabs for a channel
  socket.on("canvas:tabs:request", async ({ channelId }) => {
    try {
      if (!channelId || !workspaceId) return;
      // Prefer persisted DB state (authoritative)
      try {
        const channel = await channelRepository.findById(channelId, { workspaceId });
        if (channel && Array.isArray(channel.canvasTabs) && channel.canvasTabs.length > 0) {
          const tabs = channel.canvasTabs.map((t) => ({ _id: t.canvasId ? String(t.canvasId) : null, title: t.title || "" })).filter((x) => x._id);
          socket.emit("canvas:tabs:state", { channelId, tabs });
          return;
        }
      } catch (err) {
        logger.debug('[CANVAS SOCKET] canvas:tabs:request DB lookup failed', { error: err.message });
      }

      // Fallback to Redis cache
      const key = getChannelTabsKey(workspaceId, channelId);
      const raw = await redisClient.get(key);
      const tabs = raw ? JSON.parse(raw) : [];
      socket.emit("canvas:tabs:state", { channelId, tabs });
    } catch (err) {
      logger.error('[CANVAS SOCKET] canvas:tabs:request error', { error: err.message });
    }
  });

  // Client updates the tabs for a channel — persist and broadcast
  socket.on("canvas:tabs:update", async ({ channelId, tabs }) => {
    try {
      if (!channelId || !workspaceId) return;
      // Normalize incoming minimal metadata
      const normalized = Array.isArray(tabs) ? tabs.map((t) => ({ _id: String(t._id), title: t.title || "" })) : [];

      // Persist authoritative list to DB (channel.canvasTabs)
      try {
        const dbTabs = normalized.map((t) => ({ canvasId: t._id, title: t.title, createdBy: user._id, createdAt: new Date() }));
        await channelRepository.update(channelId, { canvasTabs: dbTabs }, workspaceId);
      } catch (err) {
        logger.error('[CANVAS SOCKET] Failed to persist canvas tabs to DB', { error: err.message, channelId, userId });
      }

      // Update Redis cache for fast reads
      try {
        const key = getChannelTabsKey(workspaceId, channelId);
        await redisClient.set(key, JSON.stringify(normalized));
      } catch (err) {
        logger.debug('[CANVAS SOCKET] Failed to update Redis cache for canvas tabs', { error: err.message });
      }

      // Broadcast to all sockets in the channel room
      const channelRoom = `ws:${workspaceId}:channel:${channelId}`;
      io.to(channelRoom).emit("canvas:tabs:updated", { channelId, tabs: normalized });
    } catch (err) {
      logger.error('[CANVAS SOCKET] canvas:tabs:update error', { error: err.message });
    }
  });

  // ── Cursor Position Sync (Low latency broadcast)
  socket.on("canvas:cursor", ({ canvasId, blockId, x, y }) => {
    if (!canvasId) return;
    socket.to(`canvas:${canvasId}`).emit("canvas:cursor:update", {
      userId,
      name: userName,
      blockId,
      x,
      y,
    });
  });

  // ── Typing Indicator Sync
  socket.on("canvas:typing", ({ canvasId, blockId, isTyping }) => {
    if (!canvasId) return;
    socket.to(`canvas:${canvasId}`).emit("canvas:typing:update", {
      userId,
      name: userName,
      blockId,
      isTyping,
    });
  });

  // ── Block Creation
  socket.on("canvas:block:create", async ({ canvasId, blockData }) => {
    try {
      if (!canvasId || !blockData) return;
      const canvas = await getSocketCanvas(canvasId);
      if (!canvas) return;

      const newBlock = await CanvasBlock.create({
        canvasId,
        workspaceId,
        channelId: canvas.channelId,
        type: blockData.type || "paragraph",
        content: blockData.content || "",
        metadata: blockData.metadata || {},
        order: blockData.order || 0,
        columnId: blockData.columnId || null,
        colIndex: blockData.colIndex || null,
        position: blockData.position || { x: 0, y: 0, width: null, height: null },
        createdBy: user._id,
        updatedBy: user._id,
        version: 1,
      });

      // Update Canvas lastEditedBy metadata
      await Canvas.findByIdAndUpdate(canvasId, { updatedBy: user._id, lastEditedBy: user._id });

      // Broadcast block creation to everyone in the room
      io.to(`canvas:${canvasId}`).emit("canvas:block:created", newBlock);
    } catch (error) {
      logger.error("[CANVAS SOCKET] Error in canvas:block:create", { error: error.message });
      socket.emit("error", { message: "Failed to create block" });
    }
  });

  // ── Block Update
  socket.on("canvas:block:update", async ({ canvasId, blockId, content, type }) => {
    try {
      if (!canvasId || !blockId) return;
      const canvas = await getSocketCanvas(canvasId);
      if (!canvas) return;

      const updateData = {};
      if (content !== undefined) updateData.content = content;
      if (type !== undefined) updateData.type = type;
      updateData.updatedBy = user._id;
      updateData.$inc = { version: 1 };

      const { $inc, ...setData } = updateData;
      const updatedBlock = await CanvasBlock.findOneAndUpdate(
        { _id: blockId, canvasId },
        { $set: setData, $inc },
        { new: true }
      );

      if (updatedBlock) {
        await Canvas.findByIdAndUpdate(canvasId, { updatedBy: user._id, lastEditedBy: user._id });

        // Broadcast to other users to prevent double cursor resets
        socket.to(`canvas:${canvasId}`).emit("canvas:block:updated", {
          blockId,
          content: updatedBlock.content,
          type: updatedBlock.type,
          lastEditedBy: userId,
        });
      }
    } catch (error) {
      logger.error("[CANVAS SOCKET] Error in canvas:block:update", { error: error.message });
    }
  });

  // ── Block Deletion
  socket.on("canvas:block:delete", async ({ canvasId, blockId }) => {
    try {
      if (!canvasId || !blockId) return;
      const canvas = await getSocketCanvas(canvasId);
      if (!canvas) return;

      await CanvasBlock.findOneAndDelete({ _id: blockId, canvasId });
      await CanvasComment.deleteMany({ blockId });
      await Canvas.findByIdAndUpdate(canvasId, { updatedBy: user._id, lastEditedBy: user._id });

      io.to(`canvas:${canvasId}`).emit("canvas:block:deleted", { blockId });
    } catch (error) {
      logger.error("[CANVAS SOCKET] Error in canvas:block:delete", { error: error.message });
      socket.emit("error", { message: "Failed to delete block" });
    }
  });

  // ── Block Reordering (Drag and Drop synchronization)
  socket.on("canvas:block:reorder", async ({ canvasId, blockIdsOrder }) => {
    try {
      if (!canvasId || !Array.isArray(blockIdsOrder)) return;
      const canvas = await getSocketCanvas(canvasId);
      if (!canvas) return;

      // Update block order fields in database (Bulk write for scalability)
      const bulkOps = blockIdsOrder.map((id, index) => ({
        updateOne: {
          filter: { _id: id, canvasId },
          update: { $set: { order: index, updatedBy: user._id }, $inc: { version: 1 } },
        },
      }));

      if (bulkOps.length > 0) {
        await CanvasBlock.bulkWrite(bulkOps);
      }

      await Canvas.findByIdAndUpdate(canvasId, { updatedBy: user._id, lastEditedBy: user._id });

      // Broadcast new ordering to other users
      socket.to(`canvas:${canvasId}`).emit("canvas:block:reordered", { blockIdsOrder });
    } catch (error) {
      logger.error("[CANVAS SOCKET] Error in canvas:block:reorder", { error: error.message });
    }
  });

  // ── Toggle Reaction on Block
  socket.on("canvas:reaction:toggle", async ({ canvasId, blockId, emoji }) => {
    try {
      if (!canvasId || !blockId || !emoji) return;
      const canvas = await getSocketCanvas(canvasId);
      if (!canvas) return;

      const block = await CanvasBlock.findOne({ _id: blockId, canvasId });
      if (!block) return;

      // Initialize reactions array if missing
      if (!block.reactions) block.reactions = [];

      const reactionIndex = block.reactions.findIndex((r) => r.emoji === emoji);
      let updatedReactions = [...block.reactions];

      if (reactionIndex > -1) {
        const users = updatedReactions[reactionIndex].userIds.map((id) => id.toString());
        const userIndex = users.indexOf(userId);

        if (userIndex > -1) {
          // Remove reaction if user already reacted
          updatedReactions[reactionIndex].userIds.splice(userIndex, 1);
          if (updatedReactions[reactionIndex].userIds.length === 0) {
            updatedReactions.splice(reactionIndex, 1);
          }
        } else {
          // Add user to reaction list
          updatedReactions[reactionIndex].userIds.push(user._id);
        }
      } else {
        // Add new emoji reaction
        updatedReactions.push({
          emoji,
          userIds: [user._id],
        });
      }

      block.reactions = updatedReactions;
      await block.save();

      // Retrieve full author info for reactions to display in UI
      const updatedBlock = await CanvasBlock.findOne({ _id: blockId, canvasId }).populate({
        path: "reactions.userIds",
        select: "name avatar",
      });

      io.to(`canvas:${canvasId}`).emit("canvas:reaction:updated", {
        blockId,
        reactions: updatedBlock.reactions,
      });
    } catch (error) {
      logger.error("[CANVAS SOCKET] Error in canvas:reaction:toggle", { error: error.message });
    }
  });

  // ── Create Comment on Block
  socket.on("canvas:comment:create", async ({ canvasId, blockId, content, textRange }) => {
    try {
      if (!canvasId || !blockId || !content) return;
      const canvas = await getSocketCanvas(canvasId);
      if (!canvas) return;

      const commentData = {
        canvasId,
        workspaceId,
        channelId: canvas.channelId,
        blockId,
        authorId: userId,
        content,
      };

      // Store text-range anchoring data if provided
      if (textRange) {
        commentData.textRange = {
          startOffset: textRange.startOffset ?? null,
          endOffset: textRange.endOffset ?? null,
          selectedText: textRange.selectedText ?? null,
          blockType: textRange.blockType ?? null,
        };
      }

      const newComment = await CanvasComment.create(commentData);

      const populated = await CanvasComment.findById(newComment._id).populate({
        path: "authorId",
        select: "name avatar",
      });

      // Write activity message to channel
      if (canvas) {
        await canvasService.logActivity(
          canvas.workspaceId,
          canvas.channelId,
          userId,
          `commented on a block in "${canvas.title}"`,
          "CANVAS_COMMENTED",
          canvasId,
          canvas.title,
          blockId
        );
      }

      io.to(`canvas:${canvasId}`).emit("canvas:comment:created", populated);
    } catch (error) {
      logger.error("[CANVAS SOCKET] Error in canvas:comment:create", { error: error.message });
      socket.emit("error", { message: "Failed to create comment" });
    }
  });

  // ── Reply to Comment
  socket.on("canvas:comment:reply", async ({ canvasId, commentId, content }) => {
    try {
      if (!canvasId || !commentId || !content) return;
      const canvas = await getSocketCanvas(canvasId);
      if (!canvas) return;

      const comment = await CanvasComment.findOne({ _id: commentId, canvasId });
      if (!comment) return;

      comment.replies.push({
        authorId: userId,
        content,
        createdAt: new Date(),
      });

      await comment.save();

      const populated = await CanvasComment.findById(commentId)
        .populate({
          path: "authorId",
          select: "name avatar",
        })
        .populate({
          path: "replies.authorId",
          select: "name avatar",
        });

      io.to(`canvas:${canvasId}`).emit("canvas:comment:replied", populated);
    } catch (error) {
      logger.error("[CANVAS SOCKET] Error in canvas:comment:reply", { error: error.message });
      socket.emit("error", { message: "Failed to add reply" });
    }
  });

  // ── Resolve Comment
  socket.on("canvas:comment:resolve", async ({ canvasId, commentId }) => {
    try {
      if (!canvasId || !commentId) return;
      const canvas = await getSocketCanvas(canvasId);
      if (!canvas) return;

      const comment = await CanvasComment.findOneAndUpdate(
        { _id: commentId, canvasId },
        { resolved: true, resolvedBy: userId, resolvedAt: new Date() },
        { new: true }
      );

      if (comment) {
        io.to(`canvas:${canvasId}`).emit("canvas:comment:resolved", { commentId, resolvedBy: userId });
      }
    } catch (error) {
      logger.error("[CANVAS SOCKET] Error in canvas:comment:resolve", { error: error.message });
      socket.emit("error", { message: "Failed to resolve comment" });
    }
  });

  // ── Share Canvas with User (notify recipient in real-time)
  socket.on("canvas:share:request", async ({ canvasId, targetUserIds, roles }) => {
    try {
      if (!canvasId || !Array.isArray(targetUserIds) || targetUserIds.length === 0) return;
      const canvas = await getSocketCanvas(canvasId);
      if (!canvas) return;

      // Update canvas permissions to include target users
      try {
        await Canvas.findByIdAndUpdate(canvasId, {
          $addToSet: {
            "permissions.users": {
              $each: targetUserIds.map((uid) => ({
                userId: uid,
                role: roles?.[uid] || "viewer",
                grantedAt: new Date(),
                grantedBy: user._id,
              })),
            },
          },
          $addToSet: {
            "permissions.allowedUserIds": { $each: targetUserIds },
          },
        });
      } catch (err) {
        logger.warn("[CANVAS SOCKET] Failed to persist share permissions", { error: err.message });
      }

      // Notify each target user that a canvas was shared with them
      targetUserIds.forEach((targetUserId) => {
        emitToUser(
          targetUserId,
          "canvas:shared",
          {
            canvasId,
            channelId: canvas.channelId,
            channelName: canvas.channelId,
            title: canvas.title,
            sharedBy: { userId, name: userName, avatar: userAvatar },
            role: roles?.[targetUserId] || "viewer",
            workspaceId,
          },
          workspaceId
        );

        // Also broadcast to the channel room so the shared user sees it in the canvas list
        const channelRoom = `ws:${workspaceId}:channel:${canvas.channelId}`;
        io.to(channelRoom).emit("canvas:tabs:updated", {
          channelId: canvas.channelId,
          tabs: [], // Signal to refresh
        });
      });

      logger.info("[CANVAS SOCKET] Canvas shared notification sent", {
        canvasId,
        targetUserIds,
        sharedBy: userId,
      });
    } catch (error) {
      logger.error("[CANVAS SOCKET] Error in canvas:share:request", { error: error.message });
    }
  });

  // ── Title Update (real-time sync to all canvas room members)
  socket.on("canvas:title:update", async ({ canvasId, title }) => {
    try {
      if (!canvasId || !title) return;
      const canvas = await getSocketCanvas(canvasId);
      if (!canvas) return;

      // Persist the title change
      await Canvas.findByIdAndUpdate(canvasId, {
        title,
        updatedBy: user._id,
        lastEditedBy: user._id,
      });

      // Broadcast to all sockets in the canvas room (including sender)
      io.to(`canvas:${canvasId}`).emit("canvas:title:updated", {
        canvasId,
        title,
        updatedBy: userId,
      });

      logger.debug("[CANVAS SOCKET] Canvas title updated", { canvasId, title, userId });
    } catch (error) {
      logger.error("[CANVAS SOCKET] Error in canvas:title:update", { error: error.message });
    }
  });

  // ── Save For Later — notify user's other devices
  socket.on("canvas:save-later:sync", async ({ canvasId, saved }) => {
    try {
      if (!canvasId) return;
      // Emit to the user's other socket connections
      socket.broadcast.emit(saved ? "canvas:saved:later" : "canvas:unsaved:later", {
        canvasId,
        userId,
      });
    } catch (error) {
      logger.error("[CANVAS SOCKET] Error in canvas:save-later:sync", { error: error.message });
    }
  });

  // ── Auto-cleanup of presence on Socket Disconnect
  socket.on("disconnect", async () => {
    try {
      for (const canvasId of joinedCanvases) {
        const room = `canvas:${canvasId}`;
        const presenceKey = getPresenceKey(canvasId);

        await redisClient.hdel(presenceKey, userId);

        // Broadcast presence exit
        socket.to(room).emit("canvas:presence:leave", { canvasId, userId });
      }
      joinedCanvases.clear();
    } catch (error) {
      logger.error("[CANVAS SOCKET] Error cleaning up presence on disconnect", { error: error.message });
    }
  });
}
