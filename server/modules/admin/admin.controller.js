import asyncHandler from '../../middleware/asyncHandler.js';
import Channel from '../channels/Channel.model.js';
import ChannelMember from '../channels/ChannelMember.model.js';
import Message from '../messages/Message.model.js';
import ChatUser from '../users/ChatUser.model.js';
import Workspace from '../workspaces/Workspace.model.js';
import Organization from '../organizations/Organization.model.js';
import Notification from '../notifications/Notification.model.js';
import logger from '../../utils/logger.js';

/**
 * Admin Controller — workspace/organization management endpoints.
 *
 * All endpoints require admin role.
 */

// ─── Middleware: require admin ─────────────────────────────────────────────
export const requireAdmin = (req, res, next) => {
  if (!req.user?.isAdmin()) {
    return res.status(403).json({ success: false, error: { message: 'Admin access required' } });
  }
  next();
};

// ──────────────────── Dashboard Analytics ──────────────────────────────────

/**
 * GET /api/chat/admin/analytics
 * Get workspace analytics overview.
 */
export const getAnalytics = asyncHandler(async (req, res) => {
  const workspaceId = req.workspaceId;

  const [
    totalUsers,
    activeUsers,
    totalChannels,
    totalMessages,
    todayMessages,
    onlineUsers,
  ] = await Promise.all([
    ChatUser.countDocuments({ workspaceId }),
    ChatUser.countDocuments({ workspaceId, isActive: true }),
    Channel.countDocuments({ workspaceId, isArchived: false }),
    Message.countDocuments({ workspaceId }),
    Message.countDocuments({
      workspaceId,
      createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    }),
    ChatUser.countDocuments({ workspaceId, onlineStatus: { $ne: 'offline' } }),
  ]);

  // Messages per day for last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const dailyMessages = await Message.aggregate([
    { $match: { workspaceId: Workspace.castId(workspaceId), createdAt: { $gte: sevenDaysAgo } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.json({
    success: true,
    data: {
      totalUsers,
      activeUsers,
      totalChannels,
      totalMessages,
      todayMessages,
      onlineUsers,
      dailyMessages,
    },
  });
});

// ──────────────────── User Management ──────────────────────────────────────

/**
 * GET /api/chat/admin/users
 * List all workspace users with pagination.
 */
export const listUsers = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
  const skip = Math.max(parseInt(req.query.skip) || 0, 0);
  const search = req.query.search;

  const filter = { workspaceId: req.workspaceId };
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: regex }, { email: regex }];
  }

  const [users, total] = await Promise.all([
    ChatUser.find(filter)
      .select('name email avatar role onlineStatus isActive lastSeen createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ChatUser.countDocuments(filter),
  ]);

  res.json({ success: true, data: { users, total, limit, skip } });
});

/**
 * PUT /api/chat/admin/users/:userId/role
 * Change a user's role.
 */
export const changeUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!['user', 'manager', 'admin'].includes(role)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid role' } });
  }

  // Prevent self-demotion
  if (req.params.userId === req.user._id.toString()) {
    return res.status(400).json({ success: false, error: { message: 'Cannot change your own role' } });
  }

  // Prevent removing the last admin
  if (role !== 'admin') {
    const target = await ChatUser.findById(req.params.userId).lean();
    if (target?.role === 'admin') {
      const adminCount = await ChatUser.countDocuments({ workspaceId: req.workspaceId, role: 'admin', isActive: true });
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, error: { message: 'Cannot demote the last admin' } });
      }
    }
  }

  const user = await ChatUser.findOneAndUpdate(
    { _id: req.params.userId, workspaceId: req.workspaceId },
    { role },
    { new: true },
  ).select('name email role');

  if (!user) {
    return res.status(404).json({ success: false, error: { message: 'User not found' } });
  }

  res.json({ success: true, data: { user } });
});

/**
 * PUT /api/chat/admin/users/:userId/deactivate
 * Deactivate a user.
 */
export const deactivateUser = asyncHandler(async (req, res) => {
  // Prevent self-deactivation
  if (req.params.userId === req.user._id.toString()) {
    return res.status(400).json({ success: false, error: { message: 'Cannot deactivate yourself' } });
  }

  // Prevent deactivating the last admin
  const target = await ChatUser.findById(req.params.userId).lean();
  if (target?.role === 'admin') {
    const adminCount = await ChatUser.countDocuments({ workspaceId: req.workspaceId, role: 'admin', isActive: true });
    if (adminCount <= 1) {
      return res.status(400).json({ success: false, error: { message: 'Cannot deactivate the last admin' } });
    }
  }

  const user = await ChatUser.findOneAndUpdate(
    { _id: req.params.userId, workspaceId: req.workspaceId },
    { isActive: false, onlineStatus: 'offline' },
    { new: true },
  ).select('name email isActive');

  if (!user) {
    return res.status(404).json({ success: false, error: { message: 'User not found' } });
  }

  res.json({ success: true, data: { user } });
});

/**
 * PUT /api/chat/admin/users/:userId/activate
 * Reactivate a deactivated user.
 */
export const activateUser = asyncHandler(async (req, res) => {
  const user = await ChatUser.findOneAndUpdate(
    { _id: req.params.userId, workspaceId: req.workspaceId },
    { isActive: true },
    { new: true },
  ).select('name email isActive');

  if (!user) {
    return res.status(404).json({ success: false, error: { message: 'User not found' } });
  }

  res.json({ success: true, data: { user } });
});

// ──────────────────── Channel Management ───────────────────────────────────

/**
 * GET /api/chat/admin/channels
 * List all channels with stats.
 */
export const listChannels = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const skip = parseInt(req.query.skip) || 0;

  const filter = { workspaceId: req.workspaceId };
  if (req.query.type) filter.type = req.query.type;
  if (req.query.archived === 'true') filter.isArchived = true;
  else if (req.query.archived !== 'all') filter.isArchived = false;

  const [channels, total] = await Promise.all([
    Channel.find(filter)
      .select('name slug type visibility memberCount lastMessageAt isArchived systemManaged createdAt')
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Channel.countDocuments(filter),
  ]);

  res.json({ success: true, data: { channels, total, limit, skip } });
});

/**
 * PUT /api/chat/admin/channels/:channelId/archive
 * Archive a channel.
 */
export const archiveChannel = asyncHandler(async (req, res) => {
  const channel = await Channel.findOneAndUpdate(
    { _id: req.params.channelId, workspaceId: req.workspaceId },
    { isArchived: true, archivedAt: new Date(), archivedReason: req.body.reason || 'Archived by admin' },
    { new: true },
  ).select('name slug isArchived');

  if (!channel) {
    return res.status(404).json({ success: false, error: { message: 'Channel not found' } });
  }

  res.json({ success: true, data: { channel } });
});

/**
 * PUT /api/chat/admin/channels/:channelId/unarchive
 * Unarchive a channel.
 */
export const unarchiveChannel = asyncHandler(async (req, res) => {
  const channel = await Channel.findOneAndUpdate(
    { _id: req.params.channelId, workspaceId: req.workspaceId },
    { isArchived: false, archivedAt: null, archivedReason: null },
    { new: true },
  ).select('name slug isArchived');

  if (!channel) {
    return res.status(404).json({ success: false, error: { message: 'Channel not found' } });
  }

  res.json({ success: true, data: { channel } });
});

/**
 * DELETE /api/chat/admin/channels/:channelId
 * Permanently delete a channel and all its messages.
 */
export const deleteChannel = asyncHandler(async (req, res) => {
  const channel = await Channel.findOne({
    _id: req.params.channelId,
    workspaceId: req.workspaceId,
  });

  if (!channel) {
    return res.status(404).json({ success: false, error: { message: 'Channel not found' } });
  }

  // Delete all related data
  await Promise.all([
    Message.deleteMany({ channelId: channel._id }),
    ChannelMember.deleteMany({ channelId: channel._id }),
    Notification.deleteMany({ channelId: channel._id }),
    Channel.deleteOne({ _id: channel._id }),
  ]);

  logger.info('Channel permanently deleted by admin', {
    channelId: channel._id,
    channelName: channel.name,
    deletedBy: req.user._id,
  });

  res.json({ success: true, data: { channelId: channel._id } });
});

// ──────────────────── Workspace Settings ───────────────────────────────────

/**
 * GET /api/chat/admin/settings
 * Get workspace settings.
 */
export const getSettings = asyncHandler(async (req, res) => {
  const workspace = await Workspace.findById(req.workspaceId).lean();
  if (!workspace) {
    return res.status(404).json({ success: false, error: { message: 'Workspace not found' } });
  }

  res.json({ success: true, data: { settings: workspace.settings || {}, workspace } });
});

/**
 * PUT /api/chat/admin/settings
 * Update workspace settings.
 */
export const updateSettings = asyncHandler(async (req, res) => {
  const { name, settings } = req.body;
  const update = {};
  if (name) update.name = name;
  if (settings && typeof settings === 'object') {
    for (const [k, v] of Object.entries(settings)) {
      update[`settings.${k}`] = v;
    }
  }

  const workspace = await Workspace.findByIdAndUpdate(
    req.workspaceId,
    { $set: update },
    { new: true },
  ).lean();

  res.json({ success: true, data: { workspace } });
});
