import readReceiptService from './readReceipt.service.js';
import asyncHandler from '../../middleware/asyncHandler.js';

/**
 * Read Receipt Controller — REST endpoints for unread management.
 */

/**
 * POST /api/chat/channels/:channelId/read
 * Mark a channel as read for the current user.
 */
export const markAsRead = asyncHandler(async (req, res) => {
  const { lastReadMessageId } = req.body;

  await readReceiptService.markAsRead(
    req.user._id,
    req.params.channelId,
    lastReadMessageId,
    req.workspaceId,
  );

  res.json({ success: true });
});

/**
 * GET /api/chat/unread
 * Get unread counts for all user's channels.
 */
export const getUnreadCounts = asyncHandler(async (req, res) => {
  const unreads = await readReceiptService.getUnreadCounts(req.user._id, req.workspaceId);

  res.json({
    success: true,
    data: { unreads },
  });
});
