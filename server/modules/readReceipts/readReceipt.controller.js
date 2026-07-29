import asyncHandler from "../../middleware/asyncHandler.js";
import { getMessageInfo as getMessageInfoService, markAsRead } from "./readReceipt.service.js";

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