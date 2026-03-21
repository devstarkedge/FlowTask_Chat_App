import Channel from './Channel.model.js';
import ChannelMember from './ChannelMember.model.js';
import { CHANNEL_TYPES } from '../../config/constants.js';
import { injectWorkspaceFilter } from '../../middleware/workspaceContext.js';
import cache from '../../services/cache.service.js';

/**
 * Channel Repository — data access layer for Channel documents.
 * All database queries are encapsulated here to decouple business logic from Mongoose.
 * All query methods accept an optional workspaceId for multi-tenant scoping.
 *
 * Membership is stored in the separate ChannelMember collection.
 * The embedded Channel.members[] array is kept in sync for backward compat
 * but ChannelMember is the source of truth for new operations.
 */

class ChannelRepository {
  /**
   * Create a new channel.
   * @param {object} data
   * @returns {Promise<Channel>}
   */
  async create(data) {
    const channel = new Channel(data);
    return channel.save();
  }

  /**
   * Find channel by ID.
   * @param {string} id
   * @param {object} [options]
   * @param {boolean} [options.populate=false]
   * @returns {Promise<Channel|null>}
   */
  async findById(id, { populate = false, workspaceId } = {}) {
    const filter = injectWorkspaceFilter({ _id: id }, workspaceId);
    const query = Channel.findOne(filter);
    if (populate) {
      query.populate('members.userId', 'name email avatar onlineStatus');
      query.populate('createdBy', 'name email');
    }
    return query.exec();
  }

  /**
   * Find channel by slug.
   * @param {string} slug
   * @param {string} [workspaceId]
   * @returns {Promise<Channel|null>}
   */
  async findBySlug(slug, workspaceId) {
    const filter = injectWorkspaceFilter({ slug }, workspaceId);
    return Channel.findOne(filter).exec();
  }

  /**
   * Find channel by FlowTask entity reference.
   * @param {string} entityType - 'board' | 'department' | 'team'
   * @param {string} entityId
   * @param {string} [workspaceId]
   * @returns {Promise<Channel|null>}
   */
  async findByFlowTaskRef(entityType, entityId, workspaceId) {
    return Channel.findByFlowTaskRef(entityType, entityId, workspaceId);
  }

  /**
   * Find all channels for a user, sorted by last activity.
   * Uses ChannelMember collection to get channel IDs, then fetches channels.
   * @param {string} userId - ChatUser _id
   * @param {object} [options]
   * @param {boolean} [options.includeArchived=false]
   * @param {string} [options.workspaceId]
   * @returns {Promise<Channel[]>}
   */
  async findByMember(userId, { includeArchived = false, workspaceId } = {}) {

    let channels;
    // Try ChannelMember collection first
    if (workspaceId) {
      const channelIds = await ChannelMember.getChannelIdsForUser(userId, workspaceId);
      if (channelIds.length > 0) {
        const filter = { _id: { $in: channelIds } };
        if (!includeArchived) filter.isArchived = false;
        channels = await Channel.find(filter)
          .sort({ lastMessageAt: -1 })
          .lean();

        // Also check for DM channels via embedded members that may not have
        // ChannelMember entries yet (pre-fix DMs). Merge without duplicates.
        const channelIdSet = new Set(channelIds.map(String));
        const dmFilter = {
          type: CHANNEL_TYPES.DM,
          'members.userId': userId,
          _id: { $nin: [...channelIdSet] },
        };
        if (!includeArchived) dmFilter.isArchived = false;
        if (workspaceId) dmFilter.workspaceId = workspaceId;
        const extraDMs = await Channel.find(dmFilter)
          .sort({ lastMessageAt: -1 })
          .lean();
        if (extraDMs.length > 0) {
          channels = [...channels, ...extraDMs];
        }

        return channels;
      }
    }

    // Fallback to embedded array query
    channels = await Channel.findUserChannels(userId, includeArchived, workspaceId).lean();
    return channels;
  }

  /**
   * Find a DM channel between participants.
   * @param {string[]} participantFlowTaskIds
   * @param {string} [workspaceId]
   * @returns {Promise<Channel|null>}
   */
  async findDMChannel(participantFlowTaskIds, workspaceId) {
    return Channel.findDMChannel(participantFlowTaskIds, workspaceId);
  }

  /**
   * Add a member to a channel (idempotent).
   * Writes to both the ChannelMember collection and the embedded array.
   * @param {string} channelId
   * @param {string} userId - ChatUser _id
   * @param {string} [role='member']
   * @param {string} [workspaceId] - Required for ChannelMember collection
   * @returns {Promise<Channel>}
   */
  async addMember(channelId, userId, role = 'member', workspaceId) {
    // Invalidate user's channel list cache
    await cache.delPattern(`channels:user:${userId}:*`);

    // Write to ChannelMember collection (source of truth)
    if (workspaceId) {
      await ChannelMember.addMember(channelId, userId, workspaceId, role);
    }

    // Also update embedded array for backward compat
    const updated = await Channel.findOneAndUpdate(
      {
        _id: channelId,
        'members.userId': { $ne: userId },
      },
      {
        $push: { members: { userId, role, joinedAt: new Date() } },
        $inc: { memberCount: 1 },
      },
      { new: true },
    );
    // If user was already in embedded array, return the channel as-is
    return updated || Channel.findById(channelId);
  }

  /**
   * Remove a member from a channel.
   * Updates both ChannelMember collection and embedded array.
   * @param {string} channelId
   * @param {string} userId - ChatUser _id
   * @returns {Promise<Channel>}
   */
  async removeMember(channelId, userId, workspaceId) {
    // Invalidate user's channel list cache
    await cache.delPattern(`channels:user:${userId}:*`);

    // Soft-remove from ChannelMember collection
    await ChannelMember.removeMember(channelId, userId);

    // Only decrement if member was actually in the embedded array
    return Channel.findOneAndUpdate(
      { _id: channelId, 'members.userId': userId },
      {
        $pull: { members: { userId } },
        $inc: { memberCount: -1 },
      },
      { new: true },
    );
  }

  /**
   * Update channel fields.
   * @param {string} channelId
   * @param {object} updates
   * @returns {Promise<Channel>}
   */
  async update(channelId, updates, workspaceId) {
    const filter = injectWorkspaceFilter({ _id: channelId }, workspaceId);
    return Channel.findOneAndUpdate(filter, updates, { new: true }).exec();
  }

  /**
   * Archive a channel (soft-delete pattern).
   * @param {string} channelId
   * @param {string} [reason]
   * @returns {Promise<Channel>}
   */
  async archive(channelId, reason = '', workspaceId) {
    const filter = injectWorkspaceFilter({ _id: channelId }, workspaceId);
    return Channel.findOneAndUpdate(
      filter,
      {
        isArchived: true,
        archivedAt: new Date(),
        archivedReason: reason,
      },
      { new: true },
    ).exec();
  }

  /**
   * Update the last message preview for sidebar rendering.
   * @param {string} channelId
   * @param {string} preview - truncated message text
   * @param {Date} timestamp
   * @returns {Promise<void>}
   */
  async updateLastMessage(channelId, preview, timestamp, workspaceId) {
    const filter = injectWorkspaceFilter({ _id: channelId }, workspaceId);
    await Channel.updateOne(
      filter,
      {
        $set: {
          lastMessagePreview: preview,
          lastMessageAt: timestamp,
        }
      },
    );
  }

  /**
   * Search channels by name (for channel browser).
   * Uses ChannelMember for membership filtering.
   * @param {string} query
   * @param {string} userId - ChatUser _id (for visibility filtering)
   * @param {number} [limit=20]
   * @param {string} [workspaceId]
   * @returns {Promise<Channel[]>}
   */
  async search(query, userId, limit = 20, workspaceId) {
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    // Get user's channel IDs from ChannelMember
    let userChannelIds = [];
    if (workspaceId) {
      userChannelIds = await ChannelMember.getChannelIdsForUser(userId, workspaceId);
    }

    const filter = injectWorkspaceFilter({
      name: regex,
      isArchived: false,
      $or: [
        { visibility: 'public' },
        ...(userChannelIds.length > 0 ? [{ _id: { $in: userChannelIds } }] : []),
        { 'members.userId': userId }, // fallback to embedded array
      ],
    }, workspaceId);
    return Channel.find(filter)
      .limit(limit)
      .select('name slug type visibility memberCount lastMessageAt')
      .sort({ memberCount: -1 })
      .exec();
  }

  /**
   * Get all system channels.
   * @param {string} [workspaceId]
   * @returns {Promise<Channel[]>}
   */
  async findSystemChannels(workspaceId) {
    const filter = injectWorkspaceFilter({ type: CHANNEL_TYPES.SYSTEM }, workspaceId);
    // Return full documents so instance methods like hasMember() are available
    return Channel.find(filter).exec();
  }

  /**
   * Find channels by type (for cron jobs, etc.).
   * @param {string} type
   * @param {string} [workspaceId]
   * @returns {Promise<Channel[]>}
   */
  async findByType(type, workspaceId) {
    const filter = injectWorkspaceFilter({ type, isArchived: false }, workspaceId);
    return Channel.find(filter).exec();
  }

  /**
   * Check if a slug is already taken.
   * @param {string} slug
   * @param {string} [workspaceId]
   * @returns {Promise<boolean>}
   */
  async slugExists(slug, workspaceId) {
    const filter = injectWorkspaceFilter({ slug }, workspaceId);
    const count = await Channel.countDocuments(filter);
    return count > 0;
  }

  /**
   * Get member IDs for a channel (for Socket.IO room management).
   * Uses ChannelMember collection as primary source.
   * @param {string} channelId
   * @returns {Promise<string[]>} Array of ChatUser _id strings
   */
  async getMemberIds(channelId) {
    return ChannelMember.getMemberIds(channelId);
  }

  /**
   * Bulk add members to a channel.
   * Writes to both ChannelMember collection and embedded array.
   * @param {string} channelId
   * @param {Array<{userId: string, role?: string}>} membersToAdd
   * @returns {Promise<Channel>}
   */
  async addMembers(channelId, membersToAdd) {
    const channel = await Channel.findById(channelId);
    if (!channel) return null;

    const existingIds = new Set(channel.members.map((m) => m.userId.toString()));
    const newMembers = membersToAdd
      .filter((m) => !existingIds.has(m.userId.toString()))
      .map((m) => ({
        userId: m.userId,
        role: m.role || 'member',
        joinedAt: new Date(),
      }));

    if (newMembers.length === 0) return channel;

    // Invalidate channel list cache for all new members
    await Promise.all(newMembers.map((m) => cache.delPattern(`channels:user:${m.userId}:*`)));

    // Write to ChannelMember collection
    const workspaceId = channel.workspaceId;
    if (workspaceId) {
      const bulkOps = newMembers.map((m) => ({
        updateOne: {
          filter: { channelId, userId: m.userId },
          update: {
            $setOnInsert: { channelId, userId: m.userId, joinedAt: m.joinedAt },
            $set: { isActive: true, workspaceId, role: m.role },
          },
          upsert: true,
        },
      }));
      await ChannelMember.bulkWrite(bulkOps);
    }

    // Atomically update embedded array — only add members not yet present
    const result = await Channel.findOneAndUpdate(
      { _id: channelId },
      {
        $push: { members: { $each: newMembers } },
        $inc: { memberCount: newMembers.length },
      },
      { new: true },
    );
    return result;
  }
}

export default new ChannelRepository();
