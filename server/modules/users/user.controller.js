import asyncHandler from '../../middleware/asyncHandler.js';
import userService from './user.service.js';

/**
 * Get user profile by ID.
 * GET /users/:id
 */
export const getProfile = asyncHandler(async (req, res) => {
  const profile = await userService.getProfile(req.params.id);
  res.json({ success: true, data: profile });
});

/**
 * Set custom status for the authenticated user.
 * PUT /users/status
 * Body: { emoji?: string, text?: string, duration?: number (minutes) }
 */
export const setCustomStatus = asyncHandler(async (req, res) => {
  const user = await userService.setCustomStatus(req.user._id, req.body);
  res.json({
    success: true,
    data: {
      customStatus: user.customStatus,
    },
  });
});

/**
 * Clear custom status for the authenticated user.
 * DELETE /users/status
 */
export const clearCustomStatus = asyncHandler(async (req, res) => {
  await userService.clearCustomStatus(req.user._id);
  res.json({ success: true, data: { customStatus: { emoji: null, text: null, expiresAt: null } } });
});

/**
 * Set online presence status (online, away, dnd).
 * PUT /users/presence
 * Body: { status: 'online' | 'away' | 'dnd' }
 */
export const setPresence = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const user = await userService.setOnlineStatus(req.user._id, status);
  res.json({
    success: true,
    data: {
      onlineStatus: user.onlineStatus,
    },
  });
});

/**
 * Get all currently online users.
 * GET /users/online
 */
export const getOnlineUsers = asyncHandler(async (req, res) => {
  const users = await userService.getOnlineUsers();
  res.json({ success: true, data: users });
});

/**
 * Search users by name or email.
 * GET /users/search?q=...&limit=...
 */
export const searchUsers = asyncHandler(async (req, res) => {
  const { q, limit } = req.query;
  if (!q || !q.trim()) {
    return res.status(400).json({ success: false, error: 'Query parameter "q" is required' });
  }
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const users = await userService.searchUsers(q, parsedLimit);
  res.json({ success: true, data: users });
});
