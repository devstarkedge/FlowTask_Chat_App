import messageService from "./message.service.js";
import * as chrono from 'chrono-node';
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
import { emitToUser } from '../../sockets/socketManager.js';
import { SOCKET_EVENTS, MESSAGE_CONTENT_TYPES } from '../../config/constants.js';
import readReceiptRepository from '../readReceipts/readReceipt.repository.js';
import Message from "./Message.model.js";


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
    req.user.id,
    req.user
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
    parentMessageId,
    tempId,
    mentions,
    gifMeta,
    audioMeta,
    videoMeta,
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
    parentMessageId,
    tempId,
    workspaceId,
    mentions,
    gifMeta,
    audioMeta,
    videoMeta,
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
    req.body.htmlContent
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
 * @desc    Mark a message as unread
 * @route   POST /api/chat/channels/:channelId/messages/:messageId/mark-unread
 * @access  Private
 */
export const markUnread = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const userId = req.user._id;
  const workspaceId = req.workspaceId;

  const message = await Message.findOne({ _id: messageId, workspaceId, isDeleted: false });
  if (!message) {
    throw new NotFoundError('Message not found');
  }
  
  const channelId = message.channelId;

  // Find the message immediately preceding this one to set as lastReadMessageId
  const previousMessage = await Message.findOne({
    channelId,
    workspaceId,
    isDeleted: false,
    createdAt: { $lt: message.createdAt },
  }).sort({ createdAt: -1 });

  const lastReadMessageId = previousMessage ? previousMessage._id : null;

  // Calculate new unread count (all messages on or after this message)
  const unreadCount = await Message.countDocuments({
    channelId,
    workspaceId,
    isDeleted: false,
    createdAt: { $gte: message.createdAt },
    authorId: { $ne: userId } // Don't count own messages
  });

  // Update read receipt
  await readReceiptRepository.model.findOneAndUpdate(
    { userId, channelId, workspaceId },
    { 
      $set: { 
        lastReadMessageId,
        unreadCount,
        // We could approximate unread mentions here if needed, but 0 is safe for now
      } 
    },
    { new: true, upsert: true }
  );

  // Emit updated unread count to user
  emitToUser(userId.toString(), SOCKET_EVENTS.UNREAD_UPDATED, {
    channelId,
    unreadCount,
    unreadMentionCount: 0 // Optional: fetch exact mention count if necessary
  }, workspaceId?.toString());

  res.json({
    success: true,
    data: {
      lastReadMessageId,
      unreadCount
    }
  });
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

  const isSync = req.query.sync === "true";
  const uploads = [];

  for (const file of req.files) {
    const asset = isSync
      ? await fileUploadService.uploadImmediately(
          file,
          req.user._id,
          req.workspaceId,
        )
      : await fileUploadService.queueUpload(
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
      workspaceId: ref.workspaceId,
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

  // Fetch user's channel IDs using lean projection (minimal overhead)
  const channelIds = await Channel.find(
    { workspaceId, isArchived: false, "members.userId": userId },
    { _id: 1 },
  ).lean().then((docs) => docs.map((c) => c._id));

  if (channelIds.length === 0) {
    return res.json({
      success: true,
      data: {
        items: [],
        hasMore: false,
        pagination: { limit, cursor: null, nextCursor: null },
      },
    });
  }
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
 *
 * Performance: reuses req.message and req.channel from requireMessageAccess
 * middleware to avoid redundant DB round-trips (saves 2-6 queries).
 *
 * IMPORTANT: Does NOT emit socket events back to the requesting user.
 * The HTTP response already carries the full payload, so a socket emit
 * would cause a redundant double-update on the client. Socket events are
 * only needed for OTHER devices/tabs of the same user.
 */
export const toggleSaveMessage = asyncHandler(async (req, res) => {
  // req.message and req.channel are already loaded by requireMessageAccess middleware
  const message = req.message;
  const channel = req.channel;

  const result = await SavedMessage.toggle(
    req.user._id,
    message._id,
    message.channelId,
    req.workspaceId,
  );

  if (result.saved) {
    // Build lightweight saved-message payload from already-loaded data
    // instead of running another findOne + 2 populate queries
    const savedMsg = {
      _id: result.savedMessageId || null,
      userId: req.user._id,
      messageId: {
        _id: message._id,
        content: message.content,
        createdAt: message.createdAt,
        authorId: message.authorId?._id
          ? { _id: message.authorId._id, name: message.authorId.name, avatar: message.authorId.avatar }
          : message.authorId,
      },
      channelId: channel
        ? { _id: channel._id, name: channel.name, type: channel.type }
        : message.channelId,
      workspaceId: req.workspaceId,
      status: 'in_progress',
      type: 'saved_message',
      createdAt: new Date(),
    };

    // Emit to OTHER devices/tabs only — the HTTP response handles this tab.
    // socket.broadcast sends to all sockets EXCEPT the sender (if socket is set).
    // Since emitToUser sends to ALL user sockets (including the current tab),
    // we skip the socket emit entirely. The HTTP response is the single source
    // of truth for the requesting tab. Other tabs will sync via their own
    // periodic fetch or when the user navigates to /later.
    // NOTE: If you need multi-tab sync, use a targeted broadcast that excludes
    // the requesting socket ID.

    result.savedMessage = savedMsg;
  }
  // No socket emit for unsave either — HTTP response is sufficient.

  res.json({ success: true, data: result });
});

/**
 * GET /api/chat/messages/saved
 * Get user's saved messages with optional status filter.
 */
export const getSavedMessages = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
  const skip = Math.max(parseInt(req.query.skip) || 0, 0);
  const status = req.query.status || null;

  const saved = await SavedMessage.getUserSaved(req.user._id, req.workspaceId, {
    limit,
    skip,
    status,
  });

  res.json({ success: true, data: { messages: saved } });
});

/**
 * PATCH /api/chat/messages/:id/save/status
 * Update saved message status by messageId or savedMessage _id.
 */
export const updateSavedMessageStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  
  if (!['in_progress', 'archived', 'completed', 'dismissed'].includes(status)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid status' } });
  }

  // Try to find by messageId first, then by _id (for standalone reminders)
  let saved = await SavedMessage.findOneAndUpdate(
    { userId: req.user._id, messageId: req.params.id, workspaceId: req.workspaceId },
    { $set: { status } },
    { returnDocument: 'after' },
  );

  if (!saved) {
    // Try finding by _id (standalone reminder or direct saved message ID)
    saved = await SavedMessage.findOneAndUpdate(
      { userId: req.user._id, _id: req.params.id, workspaceId: req.workspaceId },
      { $set: { status } },
      { returnDocument: 'after' },
    );
  }

  if (!saved) {
    return res.status(404).json({ success: false, error: { message: 'Saved message not found' } });
  }

  const messageId = saved.messageId || saved._id;
  emitToUser(req.user._id, SOCKET_EVENTS.SAVED_MESSAGE_STATUS_UPDATED, { messageId, status }, req.workspaceId);

  res.json({ success: true, data: { saved } });
});

/**
 * PATCH /api/chat/messages/:id/save/reminder
 * Update reminder for a saved message by messageId or savedMessage _id.
 */
export const updateSavedMessageReminder = asyncHandler(async (req, res) => {
  const {
    reminderAt,
    reminderDescription,
    recurrence,
    recurrenceRule,
    recurrenceMeta,
    timezone,
    priority,
    tags,
    attachments,
    scope,
    linkedTaskId,
    canvasRef,
    mentionTargets,
  } = req.body;

  const updateData = { notificationSent: false, overdueNotificationSent: false }; // Reset notification flags when reminder is updated
  if (recurrence !== undefined) updateData.recurrence = recurrence;
  if (recurrenceRule !== undefined) updateData.recurrenceRule = recurrenceRule || null;
  if (recurrenceMeta !== undefined) updateData.recurrenceMeta = recurrenceMeta || null;
  if (timezone !== undefined) updateData.timezone = timezone || 'UTC';
  if (priority !== undefined) updateData.priority = priority || 'medium';
  if (tags !== undefined) updateData.tags = tags || [];
  if (attachments !== undefined) updateData.attachments = attachments || [];
  if (scope !== undefined) updateData.scope = scope || 'personal';
  if (linkedTaskId !== undefined) updateData.linkedTaskId = linkedTaskId || null;
  if (canvasRef !== undefined) updateData.canvasRef = canvasRef || null;
  if (mentionTargets !== undefined) updateData.mentionTargets = mentionTargets || [];

  if (reminderAt !== undefined) {
    if (reminderAt) {
      const schedDate = new Date(reminderAt);
      if (isNaN(schedDate.getTime())) {
        return res.status(400).json({ success: false, error: { message: 'Invalid reminderAt date' } });
      }
      if (schedDate <= new Date()) {
        return res.status(400).json({ success: false, error: { message: 'Reminder time must be in the future' } });
      }
      updateData.reminderAt = schedDate;
    } else {
      updateData.reminderAt = null;
    }
  }
  if (reminderDescription !== undefined) updateData.reminderDescription = reminderDescription || '';

  // Try to find by messageId first, then by _id (for standalone reminders)
  let saved = await SavedMessage.findOneAndUpdate(
    { userId: req.user._id, messageId: req.params.id, workspaceId: req.workspaceId },
    { $set: updateData },
    { returnDocument: 'after' },
  );

  if (!saved) {
    // Try finding by _id (standalone reminder or direct saved message ID)
    saved = await SavedMessage.findOneAndUpdate(
      { userId: req.user._id, _id: req.params.id, workspaceId: req.workspaceId },
      { $set: updateData },
      { returnDocument: 'after' },
    );
  }

  if (!saved) {
    // If the message is not saved yet, auto-save it now to attach the reminder
    if (req.message) {
      saved = await SavedMessage.create({
        userId: req.user._id,
        messageId: req.message._id,
        channelId: req.message.channelId,
        workspaceId: req.workspaceId,
        type: 'saved_message',
        ...updateData
      });
    } else {
      return res.status(404).json({ success: false, error: { message: 'Saved message not found' } });
    }
  }

  // Sync reminder update across devices
  const populated = await SavedMessage.findById(saved._id)
    .populate({
      path: 'messageId',
      populate: { path: 'authorId', select: 'name avatar' },
    })
    .populate('channelId', 'name type')
    .lean();
 
     
    
  // Stringify to convert BSON ObjectIds and Dates to plain JSON primitives
  // This prevents 'parse error' disconnects in the socket.io-client
  const safePayload = JSON.parse(JSON.stringify(populated));
  emitToUser(req.user._id, SOCKET_EVENTS.SAVED_MESSAGE_ADDED, { savedMessage: safePayload }, req.workspaceId);

  // Create activity notification for reminder
  if (reminderAt) {
    try {
      const { default: notificationEngine } = await import('../../services/notificationEngine.js');
      const { NOTIFICATION_TYPES } = await import('../../config/constants.js');
      const reminderDate = new Date(reminderAt);
      await notificationEngine.processSystemNotification({
        workspaceId: req.workspaceId,
        recipientId: req.user._id,
        type: NOTIFICATION_TYPES.SYSTEM,
        title: 'Reminder set',
        body: `Reminder scheduled for ${reminderDate.toLocaleString()}`,
        priority: 'low',
        category: 'system',
        channelId: saved.channelId || null,
        channelName: null,
        senderId: req.user._id,
        senderName: 'You',
        deepLink: {
          workspaceId: req.workspaceId,
          channelId: saved.channelId || null,
          messageId: saved.messageId || null,
          type: saved.channelId ? 'channel' : 'workspace',
        },
      });
    } catch (notifErr) {
      console.error('Failed to send reminder notification:', notifErr);
    }
  }

  res.json({ success: true, data: { saved } });
});

/**
 * PATCH /api/chat/messages/:id/save/reminder/snooze
 * Snooze a reminder until a specified date/time (ISO string expected)
 */
export const snoozeSavedReminder = asyncHandler(async (req, res) => {
  const { snoozeUntil } = req.body;
  if (!snoozeUntil) return res.status(400).json({ success: false, error: { message: 'snoozeUntil required' } });
  const when = new Date(snoozeUntil);
  if (isNaN(when.getTime()) || when <= new Date()) {
    return res.status(400).json({ success: false, error: { message: 'snoozeUntil must be a future date' } });
  }

  // Try to find by messageId first, then by _id (for standalone reminders)
  let saved = await SavedMessage.findOneAndUpdate(
    { userId: req.user._id, messageId: req.params.id, workspaceId: req.workspaceId },
    { $set: { snoozedUntil: when }, $push: { snoozeHistory: { snoozedAt: new Date(), snoozeUntil: when, userId: req.user._id } } },
    { returnDocument: 'after' },
  );

  if (!saved) {
    saved = await SavedMessage.findOneAndUpdate(
      { userId: req.user._id, _id: req.params.id, workspaceId: req.workspaceId },
      { $set: { snoozedUntil: when }, $push: { snoozeHistory: { snoozedAt: new Date(), snoozeUntil: when, userId: req.user._id } } },
      { returnDocument: 'after' },
    );
  }

  if (!saved) return res.status(404).json({ success: false, error: { message: 'Saved message not found' } });

  const populated = await SavedMessage.findById(saved._id)
    .populate({ path: 'messageId', populate: { path: 'authorId', select: 'name avatar' } })
    .populate('channelId', 'name type')
    .lean();

  emitToUser(req.user._id, SOCKET_EVENTS.SAVED_MESSAGE_ADDED, { savedMessage: populated }, req.workspaceId);

  res.json({ success: true, data: { saved } });
});

/**
 * POST /api/chat/messages/reminders/standalone
 * Create a standalone reminder.
 */
export const createStandaloneReminder = asyncHandler(async (req, res) => {
  const { title, reminderAt, reminderDescription, channelId, recurrence, canvasRef } = req.body;

  if (!title || !reminderAt) {
    return res.status(400).json({ success: false, error: { message: 'Title and reminderAt are required' } });
  }

  const schedDate = new Date(reminderAt);
  if (isNaN(schedDate.getTime())) {
    return res.status(400).json({ success: false, error: { message: 'Invalid reminderAt date' } });
  }

  if (schedDate <= new Date()) {
    return res.status(400).json({ success: false, error: { message: 'Reminder time must be in the future' } });
  }

  const reminder = await SavedMessage.createStandalone(req.user._id, req.workspaceId, {
    title,
    reminderAt: schedDate,
    reminderDescription,
    channelId,
    recurrence: recurrence || 'none',
    canvasRef,
  });

  const populated = await SavedMessage.findById(reminder._id)
    .populate('channelId', 'name type')
    .lean();
  emitToUser(req.user._id, SOCKET_EVENTS.SAVED_MESSAGE_ADDED, { savedMessage: populated }, req.workspaceId);

  // Create activity notification for standalone reminder
  try {
    const { default: notificationEngine } = await import('../../services/notificationEngine.js');
    const { NOTIFICATION_TYPES } = await import('../../config/constants.js');
    await notificationEngine.processSystemNotification({
      workspaceId: req.workspaceId,
      recipientId: req.user._id,
      type: NOTIFICATION_TYPES.SYSTEM,
      title: 'Reminder created',
      body: `Reminder "${title}" scheduled for ${schedDate.toLocaleString()}`,
      priority: 'low',
      category: 'system',
      channelId: channelId || null,
      channelName: null,
      senderId: req.user._id,
      senderName: 'You',
      deepLink: {
        workspaceId: req.workspaceId,
        channelId: channelId || null,
        messageId: null,
        type: channelId ? 'channel' : 'workspace',
      },
    });
  } catch (notifErr) {
    console.error('Failed to send standalone reminder notification:', notifErr);
  }

  res.status(201).json({ success: true, data: { reminder } });
});

/**
 * POST /api/chat/messages/reminders/parse
 * Parse freeform text into date suggestions (uses chrono-node)
 */
export const parseReminderText = asyncHandler(async (req, res) => {
  const { text, referenceDate } = req.body;
  if (!text || typeof text !== 'string') return res.status(400).json({ success: false, error: { message: 'text is required' } });
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  const results = chrono.parse(text, ref, { forwardDate: true });
  const suggestions = results.map((r) => ({
    text: r.text,
    start: r.start ? r.start.date().toISOString() : null,
    end: r.end ? r.end.date().toISOString() : null,
  }));
  res.json({ success: true, data: { suggestions } });
});

/**
 * POST /api/chat/messages/:id/reminder-suggestions
 * Analyze a saved message by id and suggest reminders (chrono + heuristics)
 */
export const suggestRemindersFromMessage = asyncHandler(async (req, res) => {
  const msg = await messageService.getMessageById(req.params.id, req.workspaceId);
  if (!msg) return res.status(404).json({ success: false, error: { message: 'Message not found' } });
  const content = msg.content || msg.htmlContent || '';
  const results = chrono.parse(content, new Date(), { forwardDate: true });
  const suggestions = results.map((r) => ({
    text: r.text,
    start: r.start ? r.start.date().toISOString() : null,
    end: r.end ? r.end.date().toISOString() : null,
  }));

  // Lightweight heuristic: if none found, look for quick patterns like "in 2 hours", "tomorrow"
  if (suggestions.length === 0) {
    const quick = chrono.parse(content, new Date(), { forwardDate: true });
    quick.forEach((r) => suggestions.push({ text: r.text, start: r.start ? r.start.date().toISOString() : null }));
  }

  res.json({ success: true, data: { suggestions } });
});

/**
 * DELETE /api/chat/messages/reminders/:id
 * Delete a reminder.
 */
export const deleteReminder = asyncHandler(async (req, res) => {
  const reminder = await SavedMessage.findOneAndDelete({
    _id: req.params.id,
    userId: req.user._id,
    workspaceId: req.workspaceId,
  });

  if (!reminder) {
    return res.status(404).json({ success: false, error: { message: 'Reminder not found' } });
  }

  res.json({ success: true, data: { reminderId: req.params.id } });
});

// ──────────────────── Scheduled Messages ────────────────────────────────────

/**
 * POST /api/chat/channels/:channelId/scheduled-messages
 * Schedule a message for future delivery.
 */
export const scheduleMessage = asyncHandler(async (req, res) => {
  const { content, htmlContent, threadId, scheduledAt, attachments, mentions, fileReferences } = req.body;

  // Require content OR attachments
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

  // Enqueue BullMQ delayed job (no-op if Redis unavailable; polling fallback picks it up)
  try {
    await enqueueScheduledMessage(scheduled);
  } catch {
    // Polling fallback will pick it up
  }

  res.status(201).json({ success: true, data: { scheduledMessage: scheduled } });
});

/**
 * GET /api/chat/scheduled-messages
 * Get user's pending scheduled messages.
 */
export const getScheduledMessages = asyncHandler(async (req, res) => {
  const messages = await ScheduledMessage.find({
    authorId: req.user._id,
    workspaceId: req.workspaceId,
    status: { $in: ["pending", "failed"] },
  })
    .populate("authorId", "name avatar")
    .sort({ scheduledAt: 1 });

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
    status: { $in: ["pending", "failed"] },
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
      status: { $in: ["pending", "failed"] },
    },
    { $set: { scheduledAt: schedDate, status: "pending", failedReason: null } },
    { returnDocument: 'after' },
  );

  if (!scheduled) {
    return res.status(404).json({ success: false, error: { message: 'Scheduled message not found or already sent' } });
  }

  res.json({ success: true, data: { scheduledMessage: scheduled } });
});

/**
 * PATCH /api/chat/messages/scheduled/:id
 * Update a pending scheduled message (content, attachments, etc).
 */
export const updateScheduledMessage = asyncHandler(async (req, res) => {
  const { content, htmlContent, attachments, mentions, scheduledAt } = req.body;

  const updateData = {};
  if (content !== undefined) updateData.content = content;
  if (htmlContent !== undefined) updateData.htmlContent = htmlContent || content;
  if (attachments !== undefined) updateData.attachments = attachments;
  if (scheduledAt !== undefined) updateData.scheduledAt = new Date(scheduledAt);

  if (mentions !== undefined) {
    updateData.mentions = (mentions || []).map((m) => ({
      targetId: m.userId || m.targetId,
      name: m.username || m.name || "",
      type: m.type || "user",
    }));
  }

  const scheduled = await ScheduledMessage.findOneAndUpdate(
    {
      _id: req.params.id,
      authorId: req.user._id,
      workspaceId: req.workspaceId,
      status: { $in: ["pending", "failed"] },
    },
    { $set: updateData },
    { new: true },
  ).populate("authorId", "name avatar");

  if (!scheduled) {
    return res.status(404).json({
      success: false,
      error: { message: "Scheduled message not found or already sent" },
    });
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
      status: { $in: ["pending", "failed"] },
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
      attachments: (scheduled.attachments || []).map(att => ({
        ...att.toObject(),
        originalName: att.fileName || 'attachment',
        source: 'chat_upload',
      })),
      fileReferences: (scheduled.attachments || []).map(att => att.fileId).filter(Boolean),
      mentions: (scheduled.mentions || []).map((m) => ({
        userId: m.targetId,
        username: m.name,
        type: m.type,
      })),
    });

    await ScheduledMessage.markSent(scheduled._id, message._id);

    // Emit real-time event to remove from scheduled list
    emitToUser(scheduled.authorId.toString(), SOCKET_EVENTS.SCHEDULED_MESSAGE_SENT, {
      scheduledMessageId: scheduled._id.toString(),
      message,
      channelId: scheduled.channelId.toString(),
      workspaceId: scheduled.workspaceId.toString(),
    }, scheduled.workspaceId.toString());

    res.json({ success: true, data: { message, scheduledMessage: { ...scheduled.toObject(), status: 'sent' } } });
  } catch (err) {
    await ScheduledMessage.markFailed(scheduled._id, err.message);
    res.status(500).json({ success: false, error: { message: 'Failed to send message' } });
  }
});

/**
 * POST /api/chat/messages/:id/forward
 * Forward a message to one or more destination channels.
 * Optional `attachmentFileIds` in body — when present, only those specific file
 * references are cloned (used when forwarding a single file from a multi-file message).
 */
export const forwardMessage = asyncHandler(async (req, res) => {
  const { destinationIds, messageIds, attachmentFileIds, customMessage } = req.body;
  const messageId = req.params.id; // single-message route param (optional when using body.messageIds)

  if (!destinationIds || !Array.isArray(destinationIds) || destinationIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: { message: 'At least one destination channel is required' },
    });
  }

  // Support both single (URL param) and bulk (body.messageIds) forwarding
  const hasSingle = !!messageId;
  const hasBulk = Array.isArray(messageIds) && messageIds.length > 0;

  if (!hasSingle && !hasBulk) {
    return res.status(400).json({
      success: false,
      error: { message: 'At least one message ID is required (param :id or body.messageIds)' },
    });
  }

  const messages = await messageService.forwardMessage({
    messageId: hasSingle ? messageId : undefined,
    messageIds: hasBulk ? messageIds : undefined,
    destinationIds,
    attachmentFileIds: Array.isArray(attachmentFileIds) ? attachmentFileIds : undefined,
    userId: req.user._id,
    workspaceId: req.workspaceId,
    customMessage,
  });

  res.json({ success: true, data: { messages } });
});

/**
 * POST /api/chat/messages/:id/forward-group
 * Forward a message to a newly created group channel.
 * Creates a private channel with the specified members and forwards the
 * message(s) into it in a single operation (Instagram-style "Create a Group").
 *
 * Body: { memberIds: string[], groupName?: string, messageIds?: string[], attachmentFileIds?: string[] }
 */
export const forwardToNewGroup = asyncHandler(async (req, res) => {
  const { memberIds, groupName, messageIds, attachmentFileIds, customMessage } = req.body;
  const messageId = req.params.id;

  if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: { message: 'At least one member is required to create a group' },
    });
  }

  const hasSingle = !!messageId;
  const hasBulk = Array.isArray(messageIds) && messageIds.length > 0;

  if (!hasSingle && !hasBulk) {
    return res.status(400).json({
      success: false,
      error: { message: 'At least one message ID is required (param :id or body.messageIds)' },
    });
  }

  const result = await messageService.forwardToNewGroup({
    messageId: hasSingle ? messageId : undefined,
    messageIds: hasBulk ? messageIds : undefined,
    memberIds,
    groupName: groupName || undefined,
    attachmentFileIds: Array.isArray(attachmentFileIds) ? attachmentFileIds : undefined,
    userId: req.user._id,
    workspaceId: req.workspaceId,
    customMessage,
  });

  res.json({ success: true, data: result });
});


