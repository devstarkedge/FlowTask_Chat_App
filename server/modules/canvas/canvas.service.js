import canvasRepository from "./canvas.repository.js";
import channelRepository from "../channels/channel.repository.js";
import CanvasBlock from "./canvasBlock.model.js";
import CanvasComment from "./canvasComment.model.js";
import CanvasHistory from "./canvasHistory.model.js";
import ChatUser from "../users/ChatUser.model.js";
import Message from "../messages/Message.model.js";
import { emitToChannel, emitToUser } from "../../sockets/socketManager.js";
import logger from "../../utils/logger.js";
import { MESSAGE_CONTENT_TYPES, SOCKET_EVENTS } from "../../config/constants.js";
import { messageSocketPayload } from "../../utils/socketPayload.js";
import {
  ValidationError,
  NotFoundError,
} from "../../middleware/errorHandler.js";
import { MENTION_TYPES } from "../../config/constants.js";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import crypto from "crypto";

class CanvasService {
  async getTemplates() {
    try {
      const filePath = path.join(__dirname, "templates.data.json");
      const data = await fs.promises.readFile(filePath, "utf8");
      return JSON.parse(data);
    } catch (err) {
      logger.error("Error reading templates", { error: err.message || err.toString() });
      return [];
    }
  }

  normalizeContent(content) {
    if (!content || typeof content !== "object") {
      return { type: "doc", content: [{ type: "paragraph" }] };
    }

    if (content.type !== "doc") {
      return { type: "doc", content: [{ type: "paragraph" }] };
    }

    return {
      ...content,
      content: Array.isArray(content.content) && content.content.length > 0
        ? content.content
        : [{ type: "paragraph" }],
    };
  }

  buildBlocksFromContent(canvasId, content, context = {}) {
    const doc = this.normalizeContent(content);
    const nodeTypeToBlockType = (node) => {
      if (node.type === "heading") return `heading-${node.attrs?.level || 1}`;
      if (node.type === "bulletList") return "bullet-list";
      if (node.type === "orderedList") return "ordered-list";
      if (node.type === "taskList") return "checklist";
      if (node.type === "codeBlock") return "code-block";
      if (node.type === "blockquote") return "quote";
      if (node.type === "horizontalRule") return "divider";
      if (node.type === "table") return "table";
      if (node.type === "image") return "image";
      return "paragraph";
    };

    return doc.content.map((node, index) => ({
      canvasId,
      workspaceId: context.workspaceId,
      channelId: context.channelId,
      createdBy: context.userId,
      updatedBy: context.userId,
      type: nodeTypeToBlockType(node),
      content: node,
      metadata: {
        source: "tiptap",
        schemaVersion: 1,
      },
      order: index,
      version: 1,
    }));
  }
  // ── Helper to build template blocks
  buildTemplateBlocks(canvasId, type, context = {}) {
    const defaultBlocks = {
      blank: [
        { type: "paragraph", content: "Start writing here...", order: 0 }
      ],
      notes: [
        { type: "heading-1", content: "Notes", order: 0 },
        { type: "paragraph", content: "Write down your key points...", order: 1 }
      ],
      meeting: [
        { type: "heading-1", content: "Meeting Notes", order: 0 },
        { type: "heading-2", content: "📋 Agenda", order: 1 },
        { type: "paragraph", content: "1. Introduce new team goals\n2. Align timelines", order: 2 },
        { type: "heading-2", content: "📝 Notes", order: 3 },
        { type: "paragraph", content: "", order: 4 },
        { type: "heading-2", content: "✅ Action Items", order: 5 },
        { type: "checklist", content: { text: "Review project milestones", checked: false }, order: 6 },
        { type: "checklist", content: { text: "Schedule client sync", checked: false }, order: 7 }
      ],
      sprint: [
        { type: "heading-1", content: "Sprint Planning", order: 0 },
        { type: "heading-2", content: "🎯 Sprint Goal", order: 1 },
        { type: "paragraph", content: "Deliver core features with 100% sync reliability.", order: 2 },
        { type: "heading-2", content: "📦 Stories", order: 3 },
        { type: "checklist", content: { text: "Define MongoDB schema mapping", checked: true }, order: 4 },
        { type: "checklist", content: { text: "Implement drag-and-drop order updates", checked: false }, order: 5 }
      ],
      okr: [
        { type: "heading-1", content: "OKR Tracker", order: 0 },
        { type: "heading-2", content: "🎯 Objectives", order: 1 },
        { type: "paragraph", content: "O1: Enhance developer experience and collaboration.", order: 2 },
        { type: "heading-2", content: "📊 Key Results", order: 3 },
        { type: "checklist", content: { text: "KR1: Reduce socket latency by 30%", checked: false }, order: 4 }
      ],
      docs: [
        { type: "heading-1", content: "Project Brief", order: 0 },
        { type: "heading-2", content: "🎯 Goal", order: 1 },
        { type: "paragraph", content: "Specify client specifications.", order: 2 },
        { type: "heading-2", content: "📌 Scope", order: 3 },
        { type: "paragraph", content: "", order: 4 }
      ],
      retro: [
        { type: "heading-1", content: "Retrospective", order: 0 },
        { type: "heading-2", content: "✅ What went well", order: 1 },
        { type: "paragraph", content: "Great communication and faster setup.", order: 2 },
        { type: "heading-2", content: "🔧 What to improve", order: 3 },
        { type: "paragraph", content: "", order: 4 }
      ],
    };

    const blocks = defaultBlocks[type] || defaultBlocks.blank;
    return blocks.map((b) => ({
      ...b,
      canvasId,
      workspaceId: context.workspaceId,
      channelId: context.channelId,
      createdBy: context.userId,
      updatedBy: context.userId,
      version: 1,
    }));
  }

  // ── Helper to log activity inside chat
  async logActivity(workspaceId, channelId, userId, text, eventType, canvasId, canvasTitle, blockId = null) {
    try {
      const user = await ChatUser.findById(userId).lean();
      if (!user) return;

      const message = await Message.create({
        workspaceId,
        channelId,
        authorId: userId,
        senderSnapshot: {
          name: user.name,
          avatar: user.avatar || null,
        },
        content: text,
        contentType: MESSAGE_CONTENT_TYPES.ACTIVITY,
        activityMeta: {
          eventType,
          canvasId: canvasId.toString(),
          canvasTitle,
          blockId: blockId ? blockId.toString() : null,
          actorName: user.name,
          actorAvatar: user.avatar || null,
        },
      });

      // Broadcast new message in real-time
      emitToChannel(
        channelId.toString(),
        SOCKET_EVENTS.MESSAGE_CREATE,
        { message: messageSocketPayload(message) },
        workspaceId
      );
    } catch (err) {
      logger.error("[CANVAS SERVICE] Failed to write canvas activity message", { error: err.message });
    }
  }

  // ── Helper to create history snapshot
  async createHistorySnapshot(canvasId, userId) {
    try {
      const canvas = await canvasRepository.update(canvasId, {}); // dummy fetch
      if (!canvas) return;

      // Check if there is already a recent snapshot within last 2 minutes to prevent spamming
      const recentSnapshot = await CanvasHistory.findOne({ canvasId }).sort({ timestamp: -1 });
      if (recentSnapshot && Date.now() - new Date(recentSnapshot.timestamp).getTime() < 120000) {
        return;
      }

      const blocks = await CanvasBlock.find({ canvasId }).sort({ order: 1 }).lean();
      await CanvasHistory.create({
        canvasId,
        workspaceId: canvas.workspaceId,
        channelId: canvas.channelId,
        snapshot: {
          title: canvas.title,
          cover: canvas.cover || null,
          content: canvas.content || null,
          blocks: blocks.map((b) => ({
            type: b.type,
            content: b.content,
            metadata: b.metadata || {},
            order: b.order,
            columnId: b.columnId,
            colIndex: b.colIndex,
            position: b.position || null,
            version: b.version || 1,
          })),
        },
        editorId: userId,
        timestamp: new Date(),
      });
    } catch (err) {
      logger.error("[CANVAS SERVICE] History snapshot failed", { error: err.message });
    }
  }

  // ── Get Canvas metadata (does not auto-create; returns existing or null)
  async getCanvas(channelId, workspaceId) {
    if (!workspaceId) {
      throw new ValidationError("workspaceId is required");
    }

    const channel = await channelRepository.findById(channelId, { workspaceId });
    if (!channel) {
      throw new NotFoundError("Channel not found");
    }

    // Attempt to find an existing canvas for this channel. IMPORTANT: Do
    // NOT auto-create a default/blank canvas here — canvas creation must be
    // explicitly initiated by a user action or via an incoming shared canvas
    // from a collaborator. Returning null is expected when no canvas exists.
    const canvas = await canvasRepository.findByChannel(channelId, workspaceId);
    return canvas;
  }

  // ── Get Canvas by ID with Blocks & Comments
  async getCanvasById(canvasId, workspaceId, userId) {
    if (!workspaceId) {
      throw new ValidationError("workspaceId is required");
    }

    const canvas = await canvasRepository.findById(canvasId, workspaceId);
    if (!canvas) {
      throw new NotFoundError("Canvas not found");
    }

    // Track view count (non-blocking)
    if (userId) {
      this.incrementViewCount(canvasId, userId).catch(() => {});
    }

    const blocks = await CanvasBlock.find({ canvasId }).sort({ order: 1 });
    const comments = await CanvasComment.find({ canvasId, resolved: false }).populate({
      path: "authorId",
      select: "name avatar",
    });

    return {
      canvas,
      blocks,
      comments,
    };
  }

  // ── Create Canvas with Blocks
  async createCanvas(data, userId, workspaceId) {
    if (!workspaceId) {
      throw new ValidationError("workspaceId is required");
    }
    if (!data.channelId) {
      throw new ValidationError("channelId is required");
    }

    const channel = await channelRepository.findById(data.channelId, { workspaceId });
    if (!channel) {
      throw new NotFoundError("Channel not found");
    }

    const title = data.title || `${channel.name} Canvas`;
    const type = data.type || "notes";
    const content = this.normalizeContent(data.content);

    const canvas = await canvasRepository.create({
      workspaceId,
      channelId: data.channelId,
      title,
      type,
      content,
      cover: data.cover || null,
      createdBy: userId,
      updatedBy: userId,
      lastEditedBy: userId,
    });

    const blockContext = {
      workspaceId,
      channelId: data.channelId,
      userId,
    };
    const templateBlocks = data.content
      ? this.buildBlocksFromContent(canvas._id, content, blockContext)
      : this.buildTemplateBlocks(canvas._id, type, blockContext);
    await CanvasBlock.insertMany(templateBlocks);

    // Write activity message
    await this.logActivity(
      workspaceId,
      data.channelId,
      userId,
      `created the Canvas "${title}"`,
      "CANVAS_CREATED",
      canvas._id,
      title
    );

    logger.info("[CANVAS] Canvas created with blocks", {
      canvasId: canvas._id,
      channelId: data.channelId,
      workspaceId,
    });

    return canvas;
  }

  // ── Update Canvas details (Title/Cover)
  async updateCanvas(canvasId, updates, userId, workspaceId) {
    if (!workspaceId) {
      throw new ValidationError("workspaceId is required");
    }

    const canvas = await canvasRepository.findById(canvasId, workspaceId);
    if (!canvas) {
      throw new NotFoundError("Canvas not found");
    }

    // Save history snapshot before modifying
    await this.createHistorySnapshot(canvasId, userId);

    const allowedUpdates = {};
    if (updates.title !== undefined) allowedUpdates.title = updates.title;
    if (updates.type !== undefined) allowedUpdates.type = updates.type;
    if (updates.cover !== undefined) allowedUpdates.cover = updates.cover;
    if (updates.content !== undefined) allowedUpdates.content = this.normalizeContent(updates.content);

    allowedUpdates.updatedBy = userId;
    allowedUpdates.lastEditedBy = userId;
    allowedUpdates.updatedAt = new Date();

    const updatedCanvas = await canvasRepository.update(canvasId, allowedUpdates);

    // Broadcast canvas update
    emitToChannel(
      canvas.channelId.toString(),
      "canvas:updated",
      {
        canvasId: updatedCanvas._id,
        channelId: canvas.channelId,
        updates: {
          title: updatedCanvas.title,
          type: updatedCanvas.type,
          cover: updatedCanvas.cover,
          content: updatedCanvas.content,
          updatedAt: updatedCanvas.updatedAt,
          lastEditedBy: userId,
          updatedBy: userId,
        },
      },
      workspaceId
    );

    // Also update tab title via broadcast if title changed
    if (updates.title && updates.title !== canvas.title) {
      emitToChannel(
        canvas.channelId.toString(),
        "canvas:title:updated",
        { canvasId, title: updates.title },
        workspaceId
      );
    }

    // Write update activity message
    if (updates.title && updates.title !== canvas.title) {
      await this.logActivity(
        workspaceId,
        canvas.channelId,
        userId,
        `renamed Canvas to "${updates.title}"`,
        "CANVAS_UPDATED",
        canvas._id,
        updates.title
      );
    }

    // Detect mention nodes inside updated content JSON and run notification engine
    try {
      const mentions = [];
      const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'mention' && node.attrs) {
          mentions.push({ targetId: node.attrs.id, name: node.attrs.label, type: node.attrs.mentionType === 'channel' ? MENTION_TYPES.CHANNEL : MENTION_TYPES.USER });
        }
        if (Array.isArray(node.content)) {
          node.content.forEach(walk);
        }
      };

      if (allowedUpdates.content && Array.isArray(allowedUpdates.content.content)) {
        allowedUpdates.content.content.forEach(walk);
      }

      if (mentions.length > 0) {
        const sender = await ChatUser.findById(userId).lean();
        const senderSnapshot = sender ? { name: sender.name, avatar: sender.avatar || null } : { name: 'Unknown', avatar: null };
        const fakeMessage = {
          _id: updatedCanvas._id,
          authorId: userId,
          content: `Updated Canvas: ${updatedCanvas.title || canvas.title || ''}`,
          senderSnapshot,
          workspaceId,
        };

        const channel = await channelRepository.findById(canvas.channelId, { workspaceId });
        if (channel) {
          import('../../services/notificationEngine.js').then(({ default: notificationEngine }) => {
            notificationEngine.processMessage(fakeMessage, channel, { mentions }).catch(() => {});
          }).catch(() => {});
        }
      }
    } catch (err) {
      // non-fatal
      logger.warn('[CANVAS] mention detection failed', { error: err.message });
    }

    logger.info("[CANVAS] Canvas updated", { canvasId, workspaceId });
    return updatedCanvas;
  }

  // ── Delete Canvas and all dependencies
  async deleteCanvas(canvasId, userId, workspaceId) {
    if (!workspaceId) {
      throw new ValidationError("workspaceId is required");
    }

    const canvas = await canvasRepository.findById(canvasId, workspaceId);
    if (!canvas) {
      throw new NotFoundError("Canvas not found");
    }

    const channelId = canvas.channelId.toString();

    await canvasRepository.delete(canvasId);
    await CanvasBlock.deleteMany({ canvasId });
    await CanvasComment.deleteMany({ canvasId });
    await CanvasHistory.deleteMany({ canvasId });

    // Remove this canvas from the channel's canvasTabs
    try {
      await channelRepository.update(
        channelId,
        {
          $pull: { canvasTabs: { canvasId: canvas._id } },
        },
        workspaceId
      );
    } catch (err) {
      logger.warn('[CANVAS] Failed to remove canvas from channel tabs', {
        canvasId,
        channelId,
        error: err.message,
      });
    }

    // Broadcast deletion to ALL channel members (not just canvas room)
    emitToChannel(
      channelId,
      "canvas:deleted",
      {
        canvasId,
        channelId,
      },
      workspaceId
    );

    // Log deletion activity
    await this.logActivity(
      workspaceId,
      channelId,
      userId,
      `deleted the Canvas "${canvas.title}"`,
      "CANVAS_DELETED",
      canvas._id,
      canvas.title
    );

    logger.info("[CANVAS] Canvas deleted successfully", { canvasId, workspaceId });

    return { success: true };
  }

  // ── Duplicate Canvas
  async duplicateCanvas(canvasId, userId, workspaceId) {
    if (!workspaceId) {
      throw new ValidationError("workspaceId is required");
    }

    const src = await canvasRepository.findById(canvasId, workspaceId);
    if (!src) {
      throw new NotFoundError("Source Canvas not found");
    }

    const title = `Copy of ${src.title}`;
    const dup = await canvasRepository.create({
      workspaceId,
      channelId: src.channelId,
      title,
      type: src.type,
      content: this.normalizeContent(src.content),
      cover: src.cover || null,
      createdBy: userId,
      updatedBy: userId,
      lastEditedBy: userId,
    });

    const srcBlocks = await CanvasBlock.find({ canvasId }).sort({ order: 1 }).lean();
    const dupBlocks = srcBlocks.map((b) => ({
      canvasId: dup._id,
      workspaceId,
      channelId: src.channelId,
      type: b.type,
      content: b.content,
      metadata: b.metadata || {},
      order: b.order,
      columnId: b.columnId,
      colIndex: b.colIndex,
      reactions: [],
      createdBy: userId,
      updatedBy: userId,
      position: b.position || { x: 0, y: 0, width: null, height: null },
      version: 1,
    }));

    if (dupBlocks.length > 0) {
      await CanvasBlock.insertMany(dupBlocks);
    }

    await this.logActivity(
      workspaceId,
      src.channelId,
      userId,
      `duplicated Canvas "${src.title}" as "${title}"`,
      "CANVAS_CREATED",
      dup._id,
      title
    );

    return dup;
  }

  // ── Get Canvas Version Snapshots
  async getCanvasHistory(canvasId, workspaceId) {
    if (!workspaceId) {
      throw new ValidationError("workspaceId is required");
    }
    return CanvasHistory.find({ canvasId, workspaceId })
      .populate("editorId", "name avatar")
      .sort({ timestamp: -1 });
  }

  // ── Restore Canvas snapshot version
  async restoreCanvasVersion(canvasId, historyId, userId, workspaceId) {
    if (!workspaceId) {
      throw new ValidationError("workspaceId is required");
    }

    const Canvas = (await import("./canvas.model.js")).default;
    const canvas = await Canvas.findOne({ _id: canvasId, workspaceId });
    if (!canvas) {
      throw new NotFoundError("Canvas not found");
    }

    const version = await CanvasHistory.findById(historyId);
    if (!version) {
      throw new NotFoundError("Version snapshot not found");
    }

    // Save current state to history as a snapshot before restoring
    await this.createHistorySnapshot(canvasId, userId);

    // Delete current blocks
    await CanvasBlock.deleteMany({ canvasId });

    // Update metadata from snapshot
    canvas.title = version.snapshot.title || canvas.title;
    canvas.cover = version.snapshot.cover || null;
    canvas.content = this.normalizeContent(version.snapshot.content);
    canvas.updatedBy = userId;
    canvas.lastEditedBy = userId;
    await canvas.save();

    // Insert blocks from snapshot
    const restoredBlocks = version.snapshot.blocks.map((b) => ({
      canvasId,
      workspaceId,
      channelId: canvas.channelId,
      type: b.type,
      content: b.content,
      metadata: b.metadata || {},
      order: b.order,
      columnId: b.columnId,
      colIndex: b.colIndex,
      createdBy: userId,
      updatedBy: userId,
      position: b.position || { x: 0, y: 0, width: null, height: null },
      version: (b.version || 0) + 1,
    }));

    if (restoredBlocks.length > 0) {
      await CanvasBlock.insertMany(restoredBlocks);
    }

    // Broadcast reload event to all room sockets
    emitToChannel(
      canvas.channelId.toString(),
      "canvas:restored",
      {
        canvasId,
        channelId: canvas.channelId,
        title: canvas.title,
        cover: canvas.cover,
        content: canvas.content,
      },
      workspaceId
    );

    // Write activity message
    await this.logActivity(
      workspaceId,
      canvas.channelId,
      userId,
      `restored "${canvas.title}" to a previous version`,
      "CANVAS_UPDATED",
      canvas._id,
      canvas.title
    );

    return { success: true };
  }

  // ── Get All canvases in channel
  async getChannelCanvases(channelId, workspaceId) {
    if (!workspaceId) {
      throw new ValidationError("workspaceId is required");
    }

    const channel = await channelRepository.findById(channelId, { workspaceId });
    if (!channel) {
      throw new NotFoundError("Channel not found");
    }

    return canvasRepository.findAllByChannel(channelId, workspaceId);
  }

  // ── Get all canvases accessible to the user across the workspace
  async getMyCanvases(userId, workspaceId) {
    if (!workspaceId) {
      throw new ValidationError("workspaceId is required");
    }

    const userIdStr = userId.toString();
    const Canvas = (await import("./canvas.model.js")).default;

    // Find canvases where user is the creator
    const canvases = await Canvas.find({
      workspaceId,
      createdBy: userId,
    })
      .populate("createdBy updatedBy lastEditedBy", "name avatar")
      .sort({ updatedAt: -1 })
      .lean();

    return canvases;
  }

  // ── Toggle Save for Later
  async toggleSaveForLater(canvasId, userId, workspaceId) {
    const Canvas = (await import("./canvas.model.js")).default;
    const canvas = await Canvas.findOne({ _id: canvasId, workspaceId });
    if (!canvas) {
      throw new NotFoundError("Canvas not found");
    }

    const userIdStr = userId.toString();
    const alreadySaved = canvas.savedForLaterBy?.some(id => id.toString() === userIdStr);
    const SavedMessage = (await import("../messages/SavedMessage.model.js")).default;

    if (alreadySaved) {
      canvas.savedForLaterBy = canvas.savedForLaterBy.filter(id => id.toString() !== userIdStr);
      try {
        await SavedMessage.deleteMany({
          userId,
          workspaceId,
          type: 'standalone',
          $or: [
            { canvasRef: canvasId },
            { canvasRef: canvasId.toString() }
          ]
        });
        emitToUser(
          userId,
          "savedMessage:removed",
          { messageId: canvasId, canvasId },
          workspaceId
        );
      } catch (err) {
        console.error("Failed to delete standalone canvas reminder on unsave:", err);
      }
    } else {
      if (!canvas.savedForLaterBy) canvas.savedForLaterBy = [];
      canvas.savedForLaterBy.push(userId);
      canvas.savedForLaterStatus = "in_progress";
      try {
        const savedMsg = await SavedMessage.create({
          userId,
          workspaceId,
          channelId: canvas.channelId,
          type: 'standalone',
          title: canvas.title || 'Untitled Canvas',
          canvasRef: canvas._id,
          scope: 'canvas',
          status: 'in_progress',
        });
        const populated = await SavedMessage.findById(savedMsg._id)
          .populate('channelId', 'name type')
          .lean();
        emitToUser(
          userId,
          "savedMessage:added",
          { savedMessage: populated || savedMsg },
          workspaceId
        );
      } catch (err) {
        console.error("Failed to create standalone canvas entry in SavedMessage:", err);
      }
    }
    await canvas.save();

    // Broadcast save-later event to the user's other devices with full canvas payload
    const saved = !alreadySaved;
    emitToUser(
      userId,
      saved ? "canvas:saved:later" : "canvas:unsaved:later",
      { canvasId, userId, saved, canvas },
      workspaceId
    );

    return { saved, canvas };
  }

  // ── Update Saved Status
  async updateSavedStatus(canvasId, userId, status, workspaceId) {
    const Canvas = (await import("./canvas.model.js")).default;
    const canvas = await Canvas.findOne({ _id: canvasId, workspaceId });
    if (!canvas) {
      throw new NotFoundError("Canvas not found");
    }

    const userIdStr = userId.toString();
    const isSaved = canvas.savedForLaterBy?.some(id => id.toString() === userIdStr);
    if (!isSaved) {
      throw new ValidationError("Canvas is not saved for later");
    }

    canvas.savedForLaterStatus = status;
    await canvas.save();

    try {
      const SavedMessage = (await import("../messages/SavedMessage.model.js")).default;
      const updated = await SavedMessage.findOneAndUpdate(
        {
          userId,
          workspaceId,
          type: 'standalone',
          $or: [{ canvasRef: canvasId }, { canvasRef: canvasId.toString() }]
        },
        { status },
        { new: true }
      );
      if (updated) {
        emitToUser(
          userId,
          "savedMessage:statusUpdated",
          { messageId: updated._id, canvasId, status },
          workspaceId
        );
      }
    } catch (err) {
      console.error("Failed to sync saved status with SavedMessage:", err);
    }

    return canvas;
  }

  // ── Get Saved Canvases
  async getSavedCanvases(userId, workspaceId, status, channelId = null) {
    const query = {
      workspaceId,
      savedForLaterBy: userId,
    };
    if (status) {
      query.savedForLaterStatus = status;
    }
    if (channelId && channelId !== "null" && channelId !== "all") {
      query.channelId = channelId;
    }
    const Canvas = (await import("./canvas.model.js")).default;
    const SavedMessage = (await import("../messages/SavedMessage.model.js")).default;

    const canvases = await Canvas.find(query)
      .populate("createdBy", "name avatar")
      .sort({ updatedAt: -1 })
      .lean();

    // Attach user-specific SavedMessage status if available
    const savedMessages = await SavedMessage.find({
      userId,
      workspaceId,
      type: 'standalone',
      canvasRef: { $in: canvases.map(c => c._id) }
    }).lean();

    const statusMap = new Map();
    savedMessages.forEach(sm => {
      if (sm.canvasRef) {
        statusMap.set(sm.canvasRef.toString(), sm.status);
      }
    });

    return canvases.map(c => ({
      ...c,
      savedForLaterStatus: statusMap.get(c._id.toString()) || c.savedForLaterStatus || 'in_progress',
    }));
  }

  // ── Increment View Count
  async incrementViewCount(canvasId, userId) {
    try {
      const Canvas = (await import("./canvas.model.js")).default;
      const canvas = await Canvas.findById(canvasId);
      if (!canvas) return;

      const userIdStr = userId.toString();
      const alreadyViewed = canvas.viewedBy?.some(id => id.toString() === userIdStr);
      if (!alreadyViewed) {
        if (!canvas.viewedBy) canvas.viewedBy = [];
        canvas.viewedBy.push(userId);
        canvas.viewCount = (canvas.viewCount || 0) + 1;
        await canvas.save();
      }
    } catch (err) {
      logger.warn('[CANVAS] incrementViewCount failed', { error: err.message });
    }
  }

  // ── Toggle Public Share
  async togglePublicShare(canvasId, userId, workspaceId) {
    if (!workspaceId) throw new ValidationError("workspaceId is required");
    const Canvas = (await import("./canvas.model.js")).default;
    const canvas = await Canvas.findOne({ _id: canvasId, workspaceId });
    if (!canvas) throw new NotFoundError("Canvas not found");

    if (!canvas.sharing) {
      canvas.sharing = { isPublic: false, publicToken: null };
    }

    // Toggle logic
    if (canvas.sharing.isPublic) {
      canvas.sharing.isPublic = false;
      canvas.sharing.publicToken = null;
    } else {
      canvas.sharing.isPublic = true;
      // generate a unique random token
      canvas.sharing.publicToken = crypto.randomBytes(16).toString("hex");
    }

    await canvas.save();

    // Broadcast canvas update
    emitToChannel(
      canvas.channelId.toString(),
      "canvas:updated",
      {
        canvasId: canvas._id,
        channelId: canvas.channelId,
        updates: {
          sharing: canvas.sharing,
          updatedAt: canvas.updatedAt,
          lastEditedBy: userId,
          updatedBy: userId,
        },
      },
      workspaceId
    );

    return canvas;
  }

  // ── Get Public Canvas
  async getPublicCanvas(token) {
    if (!token) throw new ValidationError("token is required");
    const Canvas = (await import("./canvas.model.js")).default;
    const canvas = await Canvas.findOne({ "sharing.publicToken": token, "sharing.isPublic": true });
    if (!canvas) throw new NotFoundError("Canvas not found or not public");

    const blocks = await CanvasBlock.find({ canvasId: canvas._id }).sort({ order: 1 });
    // Don't return comments for public canvas for now (simpler)
    
    return {
      canvas,
      blocks,
      comments: [],
    };
  }
}

export default new CanvasService();