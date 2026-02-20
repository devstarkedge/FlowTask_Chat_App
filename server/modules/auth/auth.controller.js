import authService from './auth.service.js';
import channelRepository from '../channels/channel.repository.js';
import channelService from '../channels/channel.service.js';
import asyncHandler from '../../middleware/asyncHandler.js';

/**
 * Auth Controller — handles auth-related HTTP endpoints.
 */

/**
 * POST /api/chat/auth/sync
 * Sync user from FlowTask JWT.
 * Called by client after FlowTask login to initialize chat user.
 */
export const syncUser = asyncHandler(async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, error: { message: 'Token required' } });
  }

  const { chatUser } = await authService.syncUser(token);

  // Auto-join public system channels
  const systemChannels = await channelRepository.findSystemChannels();
  for (const sc of systemChannels) {
    if (sc.visibility === 'public' && !sc.hasMember(chatUser._id)) {
      await channelService.addMember(sc._id, chatUser._id).catch(() => {});
    }
  }

  // Sync project channels from FlowTask boards
  await channelService.syncProjectChannelsForUser(token, chatUser);

  // Get user's channels for initial state (includes system + project channels)
  const channels = await channelRepository.findByMember(chatUser._id);

  res.status(200).json({
    success: true,
    data: {
      user: chatUser,
      channels: channels.map((ch) => ({
        _id: ch._id,
        name: ch.name,
        slug: ch.slug,
        type: ch.type,
        visibility: ch.visibility,
        lastMessageAt: ch.lastMessageAt,
        lastMessagePreview: ch.lastMessagePreview,
        memberCount: ch.memberCount,
      })),
    },
  });
});

/**
 * GET /api/chat/auth/me
 * Get current chat user profile.
 * Requires auth middleware (protect) to have run first.
 */
export const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      user: req.user,
    },
  });
});

/**
 * PUT /api/chat/auth/preferences
 * Update chat preferences (chat-owned data).
 */
export const updatePreferences = asyncHandler(async (req, res) => {
  const { default: userRepository } = await import('../users/user.repository.js');

  const allowedFields = [
    'theme', 'notificationSound', 'desktopNotifications',
    'sidebarCollapsed', 'compactMode',
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  const user = await userRepository.updatePreferences(req.user._id, updates);

  res.status(200).json({
    success: true,
    data: { user },
  });
});
