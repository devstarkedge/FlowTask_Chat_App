import Channel from './Channel.model.js';
import { CHANNEL_TYPES } from '../../config/constants.js';

/**
 * Channel Repository — data access layer for Channel documents.
 * All database queries are encapsulated here to decouple business logic from Mongoose.
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
  async findById(id, { populate = false } = {}) {
    const query = Channel.findById(id);
    if (populate) {
      query.populate('members.userId', 'name email avatar onlineStatus');
      query.populate('createdBy', 'name email');
    }
    return query.exec();
  }

  /**
   * Find channel by slug.
   * @param {string} slug
   * @returns {Promise<Channel|null>}
   */
  async findBySlug(slug) {
    return Channel.findOne({ slug }).exec();
  }

  /**
   * Find channel by FlowTask entity reference.
   * @param {string} entityType - 'board' | 'department' | 'team'
   * @param {string} entityId
   * @returns {Promise<Channel|null>}
   */
  async findByFlowTaskRef(entityType, entityId) {
    return Channel.findByFlowTaskRef(entityType, entityId);
  }

  /**
   * Find all channels for a user, sorted by last activity.
   * @param {string} userId - ChatUser _id
   * @param {object} [options]
   * @param {boolean} [options.includeArchived=false]
   * @returns {Promise<Channel[]>}
   */
  async findByMember(userId, { includeArchived = false } = {}) {
    return Channel.findUserChannels(userId, includeArchived);
  }

  /**
   * Find a DM channel between participants.
   * @param {string[]} participantFlowTaskIds
   * @returns {Promise<Channel|null>}
   */
  async findDMChannel(participantFlowTaskIds) {
    return Channel.findDMChannel(participantFlowTaskIds);
  }

  /**
   * Add a member to a channel (idempotent).
   * @param {string} channelId
   * @param {string} userId - ChatUser _id
   * @param {string} [role='member']
   * @returns {Promise<Channel>}
   */
  async addMember(channelId, userId, role = 'member') {
    return Channel.findOneAndUpdate(
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
  }

  /**
   * Remove a member from a channel.
   * @param {string} channelId
   * @param {string} userId - ChatUser _id
   * @returns {Promise<Channel>}
   */
  async removeMember(channelId, userId) {
    return Channel.findOneAndUpdate(
      { _id: channelId },
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
  async update(channelId, updates) {
    return Channel.findByIdAndUpdate(channelId, updates, { new: true }).exec();
  }

  /**
   * Archive a channel (soft-delete pattern).
   * @param {string} channelId
   * @param {string} [reason]
   * @returns {Promise<Channel>}
   */
  async archive(channelId, reason = '') {
    return Channel.findByIdAndUpdate(
      channelId,
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
  async updateLastMessage(channelId, preview, timestamp) {
    await Channel.updateOne(
      { _id: channelId },
      {
        lastMessagePreview: preview,
        lastMessageAt: timestamp,
      },
    );
  }

  /**
   * Search channels by name (for channel browser).
   * @param {string} query
   * @param {string} userId - ChatUser _id (for visibility filtering)
   * @param {number} [limit=20]
   * @returns {Promise<Channel[]>}
   */
  async search(query, userId, limit = 20) {
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    return Channel.find({
      name: regex,
      isArchived: false,
      $or: [
        { visibility: 'public' },
        { 'members.userId': userId },
      ],
    })
      .limit(limit)
      .select('name slug type visibility memberCount lastMessageAt')
      .sort({ memberCount: -1 })
      .exec();
  }

  /**
   * Get all system channels.
   * @returns {Promise<Channel[]>}
   */
  async findSystemChannels() {
    return Channel.find({ type: CHANNEL_TYPES.SYSTEM }).exec();
  }

  /**
   * Find channels by type (for cron jobs, etc.).
   * @param {string} type
   * @returns {Promise<Channel[]>}
   */
  async findByType(type) {
    return Channel.find({ type, isArchived: false }).exec();
  }

  /**
   * Check if a slug is already taken.
   * @param {string} slug
   * @returns {Promise<boolean>}
   */
  async slugExists(slug) {
    const count = await Channel.countDocuments({ slug });
    return count > 0;
  }

  /**
   * Get member IDs for a channel (for Socket.IO room management).
   * @param {string} channelId
   * @returns {Promise<string[]>} Array of ChatUser _id strings
   */
  async getMemberIds(channelId) {
    const channel = await Channel.findById(channelId).select('members.userId').lean();
    if (!channel) return [];
    return channel.members.map((m) => m.userId.toString());
  }

  /**
   * Bulk add members to a channel.
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

    channel.members.push(...newMembers);
    channel.memberCount = channel.members.length;
    return channel.save();
  }
}

export default new ChannelRepository();
