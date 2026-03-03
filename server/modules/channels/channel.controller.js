import channelService from './channel.service.js';
import asyncHandler from '../../middleware/asyncHandler.js';

/**
 * Channel Controller — REST endpoints for channel operations.
 */

/**
 * GET /api/chat/channels
 * Get all channels for the authenticated user.
 */
export const getChannels = asyncHandler(async (req, res) => {
  const channels = await channelService.getChannelsForUser(req.user._id, req.workspaceId);

  res.json({
    success: true,
    data: { channels },
  });
});

/**
 * GET /api/chat/channels/:id
 * Get a single channel by ID.
 */
export const getChannel = asyncHandler(async (req, res) => {
  const channel = await channelService.getChannelById(req.params.id, req.user._id);

  res.json({
    success: true,
    data: { channel },
  });
});

/**
 * GET /api/chat/channels/slug/:slug
 * Get a channel by slug.
 */
export const getChannelBySlug = asyncHandler(async (req, res) => {
  const channel = await channelService.getChannelBySlug(req.params.slug);

  res.json({
    success: true,
    data: { channel },
  });
});

/**
 * POST /api/chat/channels
 * Create a custom channel.
 */
export const createChannel = asyncHandler(async (req, res) => {
  const { name, description, visibility, memberIds } = req.body;

  if (!name || name.trim().length < 2) {
    return res.status(400).json({
      success: false,
      error: { message: 'Channel name is required (min 2 characters)' },
    });
  }

  const channel = await channelService.createCustomChannel(
    { name: name.trim(), description, visibility, memberIds },
    req.user._id,
    req.workspaceId,
  );

  res.status(201).json({
    success: true,
    data: { channel },
  });
});

/**
 * PUT /api/chat/channels/:id
 * Update channel details.
 */
export const updateChannel = asyncHandler(async (req, res) => {
  const channel = await channelService.updateChannel(
    req.params.id,
    req.body,
    req.user._id,
  );

  res.json({
    success: true,
    data: { channel },
  });
});

/**
 * POST /api/chat/channels/:id/archive
 * Archive a channel.
 */
export const archiveChannel = asyncHandler(async (req, res) => {
  const channel = await channelService.archiveChannel(req.params.id, req.user._id);

  res.json({
    success: true,
    data: { channel },
  });
});

/**
 * POST /api/chat/channels/dm
 * Create or get a DM channel between current user and target.
 */
export const createDM = asyncHandler(async (req, res) => {
  const { targetUserId } = req.body;

  if (!targetUserId) {
    return res.status(400).json({
      success: false,
      error: { message: 'targetUserId is required' },
    });
  }

  const channel = await channelService.getOrCreateDM(
    req.user._id,
    targetUserId,
    req.workspaceId,
  );

  res.status(200).json({
    success: true,
    data: { channel },
  });
});

/**
 * POST /api/chat/channels/:id/members
 * Add a member to a channel.
 */
export const addMember = asyncHandler(async (req, res) => {
  const { userId, role } = req.body;

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: { message: 'userId is required' },
    });
  }

  const channel = await channelService.addMember(req.params.id, userId, role);

  res.json({
    success: true,
    data: { channel },
  });
});

/**
 * DELETE /api/chat/channels/:id/members/:userId
 * Remove a member from a channel.
 */
export const removeMember = asyncHandler(async (req, res) => {
  const channel = await channelService.removeMember(
    req.params.id,
    req.params.userId,
    req.user._id,
  );

  res.json({
    success: true,
    data: { channel },
  });
});

/**
 * POST /api/chat/channels/:id/leave
 * Leave a channel (self-remove).
 */
export const leaveChannel = asyncHandler(async (req, res) => {
  const channel = await channelService.removeMember(
    req.params.id,
    req.user._id,
    req.user._id,
  );

  res.json({
    success: true,
    data: { channel },
  });
});

/**
 * GET /api/chat/channels/search?q=...
 * Search channels by name.
 */
export const searchChannels = asyncHandler(async (req, res) => {
  const channels = await channelService.searchChannels(
    req.query.q || '',
    req.user._id,
    req.workspaceId,
  );

  res.json({
    success: true,
    data: { channels },
  });
});

/**
 * GET /api/chat/channels/:id/members
 * Get aggregated members for a channel.
 * For project channels: board members + task assignees + channel members (deduplicated).
 * For other channels: channel members.
 */
export const getChannelMembers = asyncHandler(async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const members = await channelService.getAggregatedMembers(
    req.params.id,
    token,
  );

  res.json({
    success: true,
    data: { members, total: members.length },
  });
});
