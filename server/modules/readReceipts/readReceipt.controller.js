import asyncHandler from "../../middleware/asyncHandler.js";
import { getMessageInfo as getMessageInfoService, markAsRead } from "./readReceipt.service.js";
import ReadReceipt from "./readReceipt.model.js";
import readReceiptRepository from "./readReceipt.repository.js";
import channelService from '../channels/channel.service.js';
import { emitToUser } from "../../sockets/socketManager.js";
import { SOCKET_EVENTS } from "../../config/constants.js";

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
  const accessibleChannels = await channelService.getChannelsForUser(
    userId,
    workspaceId,
    req.membership,
  );
  const allowedChannelIds = new Set(accessibleChannels.map((channel) => channel._id.toString()));
  const authorizedUnreads = unreads.filter((receipt) =>
    receipt.channelId && allowedChannelIds.has(receipt.channelId._id.toString()),
  );

  res.json({ success: true, data: { unreads: authorizedUnreads } });
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

  await channelService.getChannelById(channelId, userId, workspaceId, req.membership);

  const receipt = await readReceiptRepository.markChannelAsRead(userId, channelId, lastReadMessageId, workspaceId);
  
  emitToUser(userId.toString(), SOCKET_EVENTS.UNREAD_UPDATED, {
    channelId,
    unreadCount: 0
  }, workspaceId?.toString());

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

  await channelService.getChannelById(channelId, userId, workspaceId, req.membership);
  await markAsRead(messageId, channelId, userId, workspaceId);
  res.json({ success: true });
});
