import asyncHandler from "../../middleware/asyncHandler.js";
import { getMessageInfo as getMessageInfoService, markAsRead } from "./readReceipt.service.js";
import ReadReceipt from "./readReceipt.model.js";
import readReceiptRepository from "./readReceipt.repository.js";

/**
 * GET /api/chat/unread
 * Get unread counts and read receipts for all channels
 */
export const getUnread = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const workspaceId = req.workspaceId;

  const unreads = await ReadReceipt.find({
    userId,
    workspaceId,
    messageId: null,
  }).populate('channelId', '_id lastMessageAt lastMessagePreview').lean();

  res.json({ success: true, data: { unreads } });
});

/**
 * POST /api/chat/channels/:channelId/read
 * Mark a channel as read
 */
export const markChannelRead = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const { lastReadMessageId } = req.body;
  const userId = req.user._id;
  const workspaceId = req.workspaceId;

  const receipt = await readReceiptRepository.markChannelAsRead(userId, channelId, lastReadMessageId, workspaceId);
  res.json({ success: true, data: receipt });
});

/**
 * GET /api/chat/messages/:messageId/info
 * Get message info: delivery/read status per member
 */
export const getMessageInfo = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const { channelId } = req.query;
  const userId = req.user._id;
  const workspaceId = req.workspaceId;

  if (!channelId) {
    return res.status(400).json({ success: false, message: "channelId is required" });
  }

  const info = await getMessageInfoService(messageId, channelId, userId, workspaceId);
  res.json({ success: true, data: info });
});

/**
 * POST /api/chat/channels/:channelId/messages/:messageId/mark-read
 * Mark a message as read by current user
 */
export const markMessageRead = asyncHandler(async (req, res) => {
  const { messageId, channelId } = req.params;
  const userId = req.user._id;
  const workspaceId = req.workspaceId;

  await markAsRead(messageId, channelId, userId, workspaceId);
  res.json({ success: true });
});