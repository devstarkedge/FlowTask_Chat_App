import notificationService from './notification.service.js';
import asyncHandler from '../../middleware/asyncHandler.js';

/**
 * Notification Controller — HTTP handlers for the notification API.
 */

/**
 * GET /api/chat/notifications
 * Get user's notifications with cursor-based pagination.
 */
export const getNotifications = asyncHandler(async (req, res) => {
  const { cursor, limit, filter } = req.query;
  const result = await notificationService.getNotifications(
    req.user._id,
    req.workspaceId,
    { cursor, limit: parseInt(limit, 10) || 30, filter },
  );

  res.json({ success: true, ...result });
});

/**
 * GET /api/chat/notifications/unread-count
 * Get unread notification count for current workspace.
 */
export const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user._id, req.workspaceId);
  res.json({ success: true, count });
});

/**
 * GET /api/chat/notifications/unread-counts-all
 * Get unread notification counts across all workspaces (for workspace switcher).
 */
export const getUnreadCountsAll = asyncHandler(async (req, res) => {
  const counts = await notificationService.getUnreadCountsByWorkspace(req.user._id);
  // Transform array to object { workspaceId: count }
  const countMap = {};
  for (const item of counts) {
    countMap[item._id.toString()] = item.count;
  }
  res.json({ success: true, counts: countMap });
});

/**
 * POST /api/chat/notifications/:id/read
 * Mark a single notification as read.
 */
export const markAsRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markAsRead(req.params.id, req.user._id, req.workspaceId);
  res.json({ success: true, notification });
});

/**
 * POST /api/chat/notifications/read-all
 * Mark all notifications as read in current workspace.
 */
export const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllAsRead(req.user._id, req.workspaceId);
  res.json({ success: true, ...result });
});

/**
 * DELETE /api/chat/notifications/:id
 * Delete a notification.
 */
export const deleteNotification = asyncHandler(async (req, res) => {
  await notificationService.deleteNotification(req.params.id, req.user._id, req.workspaceId);
  res.json({ success: true, message: 'Notification deleted.' });
});
