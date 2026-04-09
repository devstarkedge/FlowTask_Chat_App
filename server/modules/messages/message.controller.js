import messageService from "./message.service.js";
import fileUploadService from "../../services/fileUpload.service.js";
import asyncHandler from "../../middleware/asyncHandler.js";
import mongoose from "mongoose";
import SavedMessage from "./SavedMessage.model.js";
import ScheduledMessage from "./ScheduledMessage.model.js";
import FileReference from "../files/FileReference.model.js";
import FileAsset from "../files/FileAsset.model.js";
import Channel from "../channels/Channel.model.js";
import botService from "../bot/bot.service.js";
import channelRepository from "../channels/channel.repository.js";
import { enqueueScheduledMessage } from '../../services/scheduledMessages.service.js';


/**
 * Message Controller — REST endpoints for messages.
 */

/**
 * GET /api/chat/channels/:channelId/messages
 * Get messages for a channel (cursor-based pagination).
 */
export const getMessages = asyncHandler(async (req, res) => {
  const result = await messageService.getChannelMessages(
    req.params.channelId,
    req.query,
    req.workspaceId,
  );

  res.json({ success: true, data: result });
});

/**
 * GET /api/chat/channels/:channelId/messages/around/:messageId
 * Get a context window around a specific message.
 */
export const getMessagesAround = asyncHandler(async (req, res) => {
  const result = await messageService.getMessagesAround(
    req.params.channelId,
    req.params.messageId,
    req.query,
    req.workspaceId,
  );

  res.json({ success: true, data: result });
});

/**
 * POST /api/chat/channels/:channelId/messages
 * Send a message to a channel.
 */
export const sendMessage = asyncHandler(async (req, res) => {
  const {
    content,
    htmlContent,
    contentType,
    attachments,
    fileReferences,
    flowTaskRef,
    threadId,
    tempId,
    mentions,
  } = req.body;

  const channelId = req.params.channelId;
  const userId = req.user._id;
  const workspaceId = req.workspaceId;

  console.log("Received message:", userId, content, channelId, workspaceId);
  // 1 Save user message
  const message = await messageService.sendMessage({
    channelId,
    authorId: userId,
    content,
    htmlContent,
    contentType,
    attachments,
    fileReferences,
    flowTaskRef,
    threadId,
    tempId,
    workspaceId,
    mentions,
  });

  console.log("Message saved:", message);
  // 2 Get channel (IMPORTANT: workspaceId pass karo)
  const channel = await channelRepository.findById(channelId, {
    workspaceId,
  });

  // 3 AI response (NON-BLOCKING )
  if (channel?.isAI && content) {
    botService
      .processAIMessage(content, {
        userId,
        channelId,
        workspaceId,
      })
      .catch((err) => {
        console.error("AI error:", err.message);
      });
  }

  // 4 Return response immediately (fast UI)
  res.status(201).json({
    success: true,
    data: { message },
  });
});

/**
 * GET /api/chat/messages/:id
 * Get a single message.
 */
export const getMessage = asyncHandler(async (req, res) => {
  const message = await messageService.getMessageById(
    req.params.id,
    req.workspaceId,
  );
  res.json({ success: true, data: { message } });
});

/**
 * PUT /api/chat/messages/:id
 * Edit a message.
 */
export const editMessage = asyncHandler(async (req, res) => {
  const message = await messageService.editMessage(
    req.params.id,
    req.user._id,
    req.body.content,
    req.workspaceId,
  );
  res.json({ success: true, data: { message } });
});

/**
 * DELETE /api/chat/messages/:id
 * Soft-delete a message.
 */
export const deleteMessage = asyncHandler(async (req, res) => {
  await messageService.deleteMessage(
    req.params.id,
    req.user._id,
    req.user.isAdmin(),
    req.workspaceId,
  );
  res.json({ success: true, data: { messageId: req.params.id } });
});

/**
 * POST /api/chat/messages/:id/reactions
 * Add a reaction to a message.
 */
export const addReaction = asyncHandler(async (req, res) => {
  const message = await messageService.addReaction(
    req.params.id,
    req.user._id,
    req.body.emoji,
    req.workspaceId,
  );
  res.json({ success: true, data: { message } });
});

/**
 * DELETE /api/chat/messages/:id/reactions/:emoji
 * Remove a reaction from a message.
 */
export const removeReaction = asyncHandler(async (req, res) => {
  const message = await messageService.removeReaction(
    req.params.id,
    req.user._id,
    req.params.emoji,
    req.workspaceId,
  );
  res.json({ success: true, data: { message } });
});

/**
 * POST /api/chat/messages/:id/pin
 * Pin a message.
 */
export const pinMessage = asyncHandler(async (req, res) => {
  const message = await messageService.pinMessage(
    req.params.id,
    req.user._id,
    req.workspaceId,
  );
  res.json({ success: true, data: { message } });
});

/**
 * DELETE /api/chat/messages/:id/pin
 * Unpin a message.
 */
export const unpinMessage = asyncHandler(async (req, res) => {
  const message = await messageService.unpinMessage(
    req.params.id,
    req.user._id,
    req.workspaceId,
  );
  res.json({ success: true, data: { message } });
});

/**
 * GET /api/chat/channels/:channelId/pins
 * Get pinned messages for a channel.
 */
export const getPinnedMessages = asyncHandler(async (req, res) => {
  const messages = await messageService.getPinnedMessages(
    req.params.channelId,
    req.workspaceId,
  );
  res.json({ success: true, data: { messages } });
});

/**
 * GET /api/chat/messages/search?q=...&channelId=...
 * Search messages.
 */
export const searchMessages = asyncHandler(async (req, res) => {
  const messages = await messageService.searchMessages(
    req.query.q,
    req.user._id,
    req.query.channelId,
    req.query,
    req.workspaceId,
  );
  res.json({ success: true, data: { messages } });
});

/**
 * POST /api/chat/channels/:channelId/seen
 * Mark all DM messages in a channel as seen by the current user.
 * REST fallback for when socket is unavailable.
 */
export const markDMSeen = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const userId = req.user._id;

  await messageService.markDMMessagesAsSeen(channelId, userId, req.workspaceId);

  res.json({ success: true, data: { channelId, status: "seen" } });
});

/**
 * POST /api/chat/channels/:channelId/upload
 * Upload files to a channel. Returns file metadata for attaching to messages.
 */
export const uploadFiles = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res
      .status(400)
      .json({ success: false, error: { message: "No files provided" } });
  }

  const uploads = [];

  for (const file of req.files) {
    const asset = await fileUploadService.queueUpload(
      file,
      req.user._id,
      req.workspaceId,
    );

    uploads.push({
      _id: asset._id, // This is now a FileAsset _id
      fileName: asset.originalName,
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      url: asset.secureUrl || "/placeholder-loading",
      thumbnailUrl: asset.thumbnailUrl,
      status: asset.status,
      source: "chat_upload", // Keeping source for legacy frontend if needed
    });
  }

  res.status(201).json({ success: true, data: { files: uploads } });
});

/**
 * GET /api/chat/channels/:channelId/files
 * List files shared in the current chat context (channel or DM).
 */
export const getChannelFiles = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const workspaceId = req.workspaceId;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
  const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);

  const refs = await FileReference.find({
    workspaceId,
    channelId,
    contextType: { $in: ["channel", "dm"] },
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("fileId")
    .populate("referencedBy", "name avatar")
    .populate("messageId", "createdAt")
    .lean();

  const items = refs
    .filter((ref) => ref.fileId && ref.fileId.status !== "deleted")
    .map((ref) => ({
      _id: ref.fileId._id,
      referenceId: ref._id,
      messageId: ref.messageId?._id || null,
      channelId: ref.channelId,
      contextType: ref.contextType,
      fileName: ref.fileId.originalName,
      originalName: ref.fileId.originalName,
      mimeType: ref.fileId.mimeType,
      fileSize: ref.fileId.fileSize,
      url: ref.fileId.secureUrl,
      thumbnailUrl: ref.fileId.thumbnailUrl,
      uploadedBy: ref.referencedBy
        ? {
            _id: ref.referencedBy._id,
            name: ref.referencedBy.name,
            avatar: ref.referencedBy.avatar || null,
          }
        : null,
      uploadedAt: ref.createdAt,
    }));

  res.json({
    success: true,
    data: {
      items,
      hasMore: refs.length === limit,
      pagination: { limit, skip },
    },
  });
});

/**
 * GET /api/chat/messages/files
 * List files visible to the current user across workspace channels/DMs.
 */
export const getWorkspaceFiles = asyncHandler(async (req, res) => {
  const workspaceId = req.workspaceId;
  const userId = req.user._id;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
  const legacySkip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
  const cursor = (req.query.cursor || "").toString().trim();
  const q = (req.query.q || "").trim();
  const kind = (req.query.kind || "all").toLowerCase();

  const decodeCursor = (value) => {
    if (!value) return null;
    try {
      const decoded = Buffer.from(value, "base64url").toString("utf8");
      const [createdAtRaw, idRaw] = decoded.split("::");
      const createdAt = new Date(createdAtRaw);
      if (
        Number.isNaN(createdAt.getTime()) ||
        !mongoose.Types.ObjectId.isValid(idRaw)
      ) {
        return null;
      }
      return {
        createdAt,
        id: new mongoose.Types.ObjectId(idRaw),
      };
    } catch {
      return null;
    }
  };

  const encodeCursor = (ref) => {
    if (!ref?._id || !ref?.createdAt) return null;
    const raw = `${new Date(ref.createdAt).toISOString()}::${ref._id.toString()}`;
    return Buffer.from(raw, "utf8").toString("base64url");
  };

  const cursorRef = decodeCursor(cursor);
  if (cursor && !cursorRef) {
    return res.status(400).json({
      success: false,
      error: { message: "Invalid cursor" },
    });
  }

  const channels = await Channel.find({
    workspaceId,
    isArchived: false,
    "members.userId": userId,
  })
    .select("_id")
    .lean();

  if (channels.length === 0) {
    return res.json({
      success: true,
      data: {
        items: [],
        hasMore: false,
        pagination: { limit, cursor: null, nextCursor: null },
      },
    });
  }

  const channelIds = channels.map((c) => c._id);
  const fileMatch = {
    status: { $ne: "deleted" },
  };

  if (q) {
    fileMatch.originalName = {
      $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      $options: "i",
    };
  }

  const matchesKind = (mimeType = "") => {
    if (kind === "image") return mimeType.startsWith("image/");
    if (kind === "video") return mimeType.startsWith("video/");
    if (kind === "file")
      return !mimeType.startsWith("image/") && !mimeType.startsWith("video/");
    return true;
  };

  const collected = [];
  const batchSize = Math.min(Math.max(limit * 2, 25), 200);
  let offset = !cursorRef ? legacySkip : 0;
  let seek = cursorRef;
  let reachedEnd = false;

  while (collected.length < limit + 1 && !reachedEnd) {
    const query = {
      workspaceId,
      channelId: { $in: channelIds },
      contextType: { $in: ["channel", "dm", "thread"] },
    };

    if (seek) {
      query.$or = [
        { createdAt: { $lt: seek.createdAt } },
        { createdAt: seek.createdAt, _id: { $lt: seek.id } },
      ];
    }

    const refs = await FileReference.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip(offset)
      .limit(batchSize)
      .populate({ path: "fileId", match: fileMatch })
      .populate("referencedBy", "name avatar")
      .populate("messageId", "createdAt")
      .populate("channelId", "name type")
      .lean();

    offset = 0;

    if (refs.length === 0) {
      reachedEnd = true;
      break;
    }

    const lastRef = refs[refs.length - 1];
    if (lastRef) {
      seek = {
        createdAt: new Date(lastRef.createdAt),
        id: new mongoose.Types.ObjectId(lastRef._id),
      };
    }

    for (const ref of refs) {
      if (!ref.fileId || !matchesKind(ref.fileId.mimeType)) continue;
      collected.push(ref);
      if (collected.length >= limit + 1) break;
    }

    if (refs.length < batchSize) {
      reachedEnd = true;
    }
  }

  const hasMore = collected.length > limit;
  const visibleRefs = collected.slice(0, limit);
  const items = visibleRefs.map((ref) => ({
    _id: ref.fileId._id,
    referenceId: ref._id,
    messageId: ref.messageId?._id || null,
    channelId: ref.channelId?._id || ref.channelId,
    channel: ref.channelId
      ? {
          _id: ref.channelId._id,
          name: ref.channelId.name,
          type: ref.channelId.type,
        }
      : null,
    contextType: ref.contextType,
    fileName: ref.fileId.originalName,
    originalName: ref.fileId.originalName,
    mimeType: ref.fileId.mimeType,
    fileSize: ref.fileId.fileSize,
    url: ref.fileId.secureUrl,
    thumbnailUrl: ref.fileId.thumbnailUrl,
    uploadedBy: ref.referencedBy
      ? {
          _id: ref.referencedBy._id,
          name: ref.referencedBy.name,
          avatar: ref.referencedBy.avatar || null,
        }
      : null,
    uploadedAt: ref.createdAt,
  }));

  const nextCursor =
    hasMore && visibleRefs.length > 0
      ? encodeCursor(visibleRefs[visibleRefs.length - 1])
      : null;

  res.json({
    success: true,
    data: {
      items,
      hasMore,
      pagination: {
        limit,
        cursor: cursor || null,
        nextCursor,
      },
    },
  });
});

/**
 * DELETE /api/chat/channels/:channelId/files/:fileId
 * Delete a file reference from this chat. Owner/admin can delete.
 */
export const deleteChannelFile = asyncHandler(async (req, res) => {
  const { channelId, fileId } = req.params;
  const workspaceId = req.workspaceId;
  const userId = req.user._id.toString();
  const role = req.membership?.role;

  const ref = await FileReference.findOne({
    workspaceId,
    channelId,
    fileId,
    contextType: { $in: ["channel", "dm"] },
  });

  if (!ref) {
    return res.status(404).json({
      success: false,
      error: { message: "File not found in this chat" },
    });
  }

  const isAdmin = role === "owner" || role === "admin";
  const isOwner = ref.referencedBy?.toString() === userId;
  if (!isAdmin && !isOwner) {
    return res.status(403).json({
      success: false,
      error: { message: "You can only delete your own files" },
    });
  }

  await FileReference.deleteOne({ _id: ref._id });

  const remainingRefs = await FileReference.countDocuments({
    workspaceId,
    fileId,
  });

  if (remainingRefs === 0) {
    await FileAsset.updateOne(
      { _id: fileId, workspaceId },
      { $set: { status: "deleted" } },
    );
  }

  res.json({ success: true, data: { fileId, channelId } });
});

// ──────────────────── Saved Messages ────────────────────────────────────────

/**
 * POST /api/chat/messages/:id/save
 * Toggle save/unsave a message.
 */
export const toggleSaveMessage = asyncHandler(async (req, res) => {
  const message = await messageService.getMessageById(
    req.params.id,
    req.workspaceId,
  );
  const result = await SavedMessage.toggle(
    req.user._id,
    message._id,
    message.channelId,
    req.workspaceId,
  );
  res.json({ success: true, data: result });
});

/**
 * GET /api/chat/saved-messages
 * Get user's saved messages.
 */
export const getSavedMessages = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
  const skip = Math.max(parseInt(req.query.skip) || 0, 0);
  const saved = await SavedMessage.getUserSaved(req.user._id, req.workspaceId, {
    limit,
    skip,
  });
  res.json({ success: true, data: { messages: saved } });
});

// ──────────────────── Scheduled Messages ────────────────────────────────────

/**
 * POST /api/chat/channels/:channelId/scheduled-messages
 * Schedule a message for future delivery.
 */
export const scheduleMessage = asyncHandler(async (req, res) => {
  const { content, htmlContent, threadId, scheduledAt, attachments, mentions, fileReferences } = req.body;


  if (!content || !content.trim()) {
    return res.status(400).json({
      success: false,
      error: { message: "Message content is required" },
    });

  // Require content OR attachments (mirrors sendMessage validation)
  const hasContent = content && content.trim();
  const hasAttachments = (attachments && attachments.length > 0) || (fileReferences && fileReferences.length > 0);
  if (!hasContent && !hasAttachments) {
    return res.status(400).json({ success: false, error: { message: 'Message must have content or attachments' } });

  }

  const schedDate = new Date(scheduledAt);
  if (isNaN(schedDate.getTime()) || schedDate <= new Date()) {
    return res.status(400).json({
      success: false,
      error: { message: "scheduledAt must be a future date" },
    });
  }

  // Normalise mentions shape from frontend ({userId, username}) → stored shape ({targetId, name, type})
  const normMentions = (mentions || []).map((m) => ({
    targetId: m.userId || m.targetId,
    name: m.username || m.name || '',
    type: m.type || 'user',
  }));

  const scheduled = await ScheduledMessage.create({
    channelId: req.params.channelId,
    authorId: req.user._id,
    workspaceId: req.workspaceId,
    content: content || '',
    htmlContent: htmlContent || content || '',
    threadId: threadId || null,
    scheduledAt: schedDate,
    attachments: attachments || [],
    mentions: normMentions,
  });


  res
    .status(201)
    .json({ success: true, data: { scheduledMessage: scheduled } });

  // Enqueue BullMQ delayed job (no-op if Redis unavailable)
  try {
    await enqueueScheduledMessage(scheduled);
  } catch {
    // Polling fallback will pick it up
  }

  res.status(201).json({ success: true, data: { scheduledMessage: scheduled } });

}});

/**
 * GET /api/chat/scheduled-messages
 * Get user's pending scheduled messages.
 */
export const getScheduledMessages = asyncHandler(async (req, res) => {
  const messages = await ScheduledMessage.find({
    authorId: req.user._id,
    workspaceId: req.workspaceId,
    status: "pending",
  }).sort({ scheduledAt: 1 });

  res.json({ success: true, data: { messages } });
});

/**
 * DELETE /api/chat/scheduled-messages/:id
 * Cancel a scheduled message.
 */
export const cancelScheduledMessage = asyncHandler(async (req, res) => {
  const scheduled = await ScheduledMessage.findOne({
    _id: req.params.id,
    authorId: req.user._id,
    workspaceId: req.workspaceId,
    status: "pending",
  });

  if (!scheduled) {
    return res.status(404).json({
      success: false,
      error: { message: "Scheduled message not found or already sent" },
    });
  }

  scheduled.status = "cancelled";
  await scheduled.save();

  res.json({ success: true, data: { scheduledMessage: scheduled } });
});

/**
 * PATCH /api/chat/messages/reschedule/:id
 * Reschedule a pending scheduled message.
 */
export const rescheduleMessage = asyncHandler(async (req, res) => {
  const { scheduledAt } = req.body;

  if (!scheduledAt) {
    return res.status(400).json({ success: false, error: { message: 'scheduledAt is required' } });
  }

  const schedDate = new Date(scheduledAt);
  if (isNaN(schedDate.getTime()) || schedDate <= new Date()) {
    return res.status(400).json({ success: false, error: { message: 'scheduledAt must be a future date' } });
  }

  const scheduled = await ScheduledMessage.findOneAndUpdate(
    {
      _id: req.params.id,
      authorId: req.user._id,
      workspaceId: req.workspaceId,
      status: 'pending',
    },
    { $set: { scheduledAt: schedDate } },
    { new: true },
  );

  if (!scheduled) {
    return res.status(404).json({ success: false, error: { message: 'Scheduled message not found or already sent' } });
  }

  res.json({ success: true, data: { scheduledMessage: scheduled } });
});

/**
 * POST /api/chat/messages/send-now/:id
 * Immediately send a pending scheduled message.
 */
export const sendScheduledNow = asyncHandler(async (req, res) => {
  const scheduled = await ScheduledMessage.findOneAndUpdate(
    {
      _id: req.params.id,
      authorId: req.user._id,
      workspaceId: req.workspaceId,
      status: 'pending',
    },
    { $set: { status: 'processing' } },
    { new: true },
  );

  if (!scheduled) {
    return res.status(404).json({ success: false, error: { message: 'Scheduled message not found or already sent' } });
  }

  try {
    const message = await messageService.sendMessage({
      channelId: scheduled.channelId,
      authorId: scheduled.authorId,
      content: scheduled.content,
      htmlContent: scheduled.htmlContent,
      threadId: scheduled.threadId,
      workspaceId: scheduled.workspaceId,
      attachments: scheduled.attachments || [],
      mentions: (scheduled.mentions || []).map((m) => ({
        userId: m.targetId,
        username: m.name,
        type: m.type,
      })),
    });

    await ScheduledMessage.markSent(scheduled._id, message._id);

    res.json({ success: true, data: { message, scheduledMessage: { ...scheduled.toObject(), status: 'sent' } } });
  } catch (err) {
    await ScheduledMessage.markFailed(scheduled._id, err.message);
    res.status(500).json({ success: false, error: { message: 'Failed to send message' } });
  }
});


