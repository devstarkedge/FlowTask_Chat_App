import messageService from './message.service.js';
import fileUploadService from '../../services/fileUpload.service.js';
import asyncHandler from '../../middleware/asyncHandler.js';

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
  );

  res.json({ success: true, data: result });
});

/**
 * POST /api/chat/channels/:channelId/messages
 * Send a message to a channel.
 */
export const sendMessage = asyncHandler(async (req, res) => {
  const { content, htmlContent, contentType, attachments, fileReferences, flowTaskRef, threadId, tempId } = req.body;

  const message = await messageService.sendMessage({
    channelId: req.params.channelId,
    authorId: req.user._id,
    content,
    htmlContent,
    contentType,
    attachments,
    fileReferences,
    flowTaskRef,
    threadId,
    tempId,
    workspaceId: req.workspaceId,
  });

  res.status(201).json({ success: true, data: { message } });
});

/**
 * GET /api/chat/messages/:id
 * Get a single message.
 */
export const getMessage = asyncHandler(async (req, res) => {
  const message = await messageService.getMessageById(req.params.id);
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
  );
  res.json({ success: true, data: { message } });
});

/**
 * POST /api/chat/messages/:id/pin
 * Pin a message.
 */
export const pinMessage = asyncHandler(async (req, res) => {
  const message = await messageService.pinMessage(req.params.id, req.user._id);
  res.json({ success: true, data: { message } });
});

/**
 * DELETE /api/chat/messages/:id/pin
 * Unpin a message.
 */
export const unpinMessage = asyncHandler(async (req, res) => {
  const message = await messageService.unpinMessage(req.params.id, req.user._id);
  res.json({ success: true, data: { message } });
});

/**
 * GET /api/chat/channels/:channelId/pins
 * Get pinned messages for a channel.
 */
export const getPinnedMessages = asyncHandler(async (req, res) => {
  const messages = await messageService.getPinnedMessages(req.params.channelId);
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
  );
  res.json({ success: true, data: { messages } });
});

/**
 * POST /api/chat/channels/:channelId/upload
 * Upload files to a channel. Returns file metadata for attaching to messages.
 */
export const uploadFiles = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, error: { message: 'No files provided' } });
  }

  const uploads = [];

  for (const file of req.files) {
    const asset = await fileUploadService.queueUpload(file, req.user._id);

    uploads.push({
      _id: asset._id, // This is now a FileAsset _id
      fileName: asset.originalName,
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      url: asset.secureUrl || '/placeholder-loading',
      thumbnailUrl: asset.thumbnailUrl,
      status: asset.status,
      source: 'chat_upload', // Keeping source for legacy frontend if needed
    });
  }

  res.status(201).json({ success: true, data: { files: uploads } });
});
