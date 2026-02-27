import Message from './Message.model.js';

/**
 * Message Repository — data access layer for Message documents.
 * Encapsulates all Mongoose queries for messages.
 * Uses cursor-based pagination for real-time feed performance.
 */

class MessageRepository {
  /**
   * Create a new message.
   * @param {object} data
   * @returns {Promise<Message>}
   */
  async create(data) {
    const message = new Message(data);
    await message.save();
    return message.populate('authorId', 'name email avatar flowTaskUserId onlineStatus');
  }

  /**
   * Find message by ID.
   * @param {string} id
   * @param {object} [options]
   * @param {boolean} [options.populate=true]
   * @returns {Promise<Message|null>}
   */
  async findById(id, { populate = true } = {}) {
    const query = Message.findById(id);
    if (populate) {
      query.populate('authorId', 'name email avatar flowTaskUserId onlineStatus');
      query.populate({
        path: 'fileReferences',
        populate: { path: 'fileId' }
      });
    }
    return query.exec();
  }

  /**
   * Get channel messages with cursor-based pagination.
   * Returns messages in descending order (newest first for initial load).
   *
   * @param {string} channelId
   * @param {object} options
   * @param {string|null} [options.cursor] - Message _id to paginate from
   * @param {number} [options.limit=50]
   * @param {'before'|'after'} [options.direction='before'] - Load before or after cursor
   * @returns {Promise<Message[]>}
   */
  async getChannelMessages(channelId, { cursor = null, limit = 80, direction = 'before' } = {}) {
    const filter = { channelId, isDeleted: false, threadId: null };

    if (cursor) {
      if (direction === 'before') {
        filter._id = { $lt: cursor };
      } else {
        filter._id = { $gt: cursor };
      }
    }

    const sortOrder = direction === 'after' ? 1 : -1;

    const messages = await Message.find(filter)
      .sort({ createdAt: sortOrder })
      .limit(limit)
      .populate('authorId', 'name email avatar flowTaskUserId onlineStatus')
      .populate({
        path: 'fileReferences',
        populate: { path: 'fileId' }
      })
      .lean();

    // If loading "before" (older messages), we queried newest-first to get the 
    // immediately preceding messages. We must reverse to restore chronological order.
    if (direction === 'before') {
      messages.reverse();
    }

    return messages;
  }

  /**
   * Get thread replies with cursor-based pagination.
   * Returns replies in ascending order (oldest first for thread reading).
   *
   * @param {string} threadId
   * @param {object} options
   * @param {string|null} [options.cursor]
   * @param {number} [options.limit=30]
   * @returns {Promise<Message[]>}
   */
  async getThreadReplies(threadId, { cursor = null, limit = 30 } = {}) {
    const filter = { threadId, isDeleted: false };

    if (cursor) {
      filter._id = { $gt: cursor };
    }

    return Message.find(filter)
      .sort({ createdAt: 1 })
      .limit(limit)
      .populate('authorId', 'name email avatar flowTaskUserId onlineStatus')
      .populate({
        path: 'fileReferences',
        populate: { path: 'fileId' }
      })
      .lean();
  }

  /**
   * Update message content (for editing).
   * @param {string} messageId
   * @param {object} updates
   * @returns {Promise<Message|null>}
   */
  async update(messageId, updates) {
    return Message.findByIdAndUpdate(messageId, updates, { new: true })
      .populate('authorId', 'name email avatar flowTaskUserId onlineStatus')
      .populate({
        path: 'fileReferences',
        populate: { path: 'fileId' }
      })
      .exec();
  }

  /**
   * Soft-delete a message.
   * @param {string} messageId
   * @param {string} deletedBy - ChatUser _id
   * @returns {Promise<Message|null>}
   */
  async softDelete(messageId, deletedBy) {
    return Message.findByIdAndUpdate(
      messageId,
      {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy,
        // Clear content for privacy but maintain record structure
        content: '[Message deleted]',
        htmlContent: '<p>[Message deleted]</p>',
      },
      { new: true },
    ).exec();
  }

  /**
   * Pin a message.
   * @param {string} messageId
   * @param {string} pinnedBy - ChatUser _id
   * @returns {Promise<Message|null>}
   */
  async pin(messageId, pinnedBy) {
    return Message.findByIdAndUpdate(
      messageId,
      { isPinned: true, pinnedBy, pinnedAt: new Date() },
      { new: true },
    ).exec();
  }

  /**
   * Unpin a message.
   * @param {string} messageId
   * @returns {Promise<Message|null>}
   */
  async unpin(messageId) {
    return Message.findByIdAndUpdate(
      messageId,
      { isPinned: false, pinnedBy: null, pinnedAt: null },
      { new: true },
    ).exec();
  }

  /**
   * Get pinned messages for a channel.
   * @param {string} channelId
   * @returns {Promise<Message[]>}
   */
  async getPinnedMessages(channelId) {
    return Message.find({ channelId, isPinned: true, isDeleted: false })
      .sort({ pinnedAt: -1 })
      .populate('authorId', 'name email avatar flowTaskUserId')
      .populate({
        path: 'fileReferences',
        populate: { path: 'fileId' }
      })
      .lean();
  }

  /**
   * Add reaction to a message (atomic operation).
   * @param {string} messageId
   * @param {string} emoji
   * @param {string} userId - ChatUser _id
   * @returns {Promise<Message|null>}
   */
  async addReaction(messageId, emoji, userId) {
    // First try to add to existing reaction entry
    const result = await Message.findOneAndUpdate(
      {
        _id: messageId,
        'reactions.emoji': emoji,
        'reactions.userIds': { $ne: userId },
      },
      {
        $push: { 'reactions.$.userIds': userId },
        $inc: { 'reactions.$.count': 1 },
      },
      { new: true },
    );

    if (result) return result;

    // If emoji doesn't exist yet, add new reaction entry
    return Message.findOneAndUpdate(
      {
        _id: messageId,
        'reactions.emoji': { $ne: emoji },
      },
      {
        $push: {
          reactions: { emoji, userIds: [userId], count: 1 },
        },
      },
      { new: true },
    );
  }

  /**
   * Remove reaction from a message (atomic operation).
   * @param {string} messageId
   * @param {string} emoji
   * @param {string} userId - ChatUser _id
   * @returns {Promise<Message|null>}
   */
  async removeReaction(messageId, emoji, userId) {
    const message = await Message.findOneAndUpdate(
      {
        _id: messageId,
        'reactions.emoji': emoji,
      },
      {
        $pull: { 'reactions.$.userIds': userId },
        $inc: { 'reactions.$.count': -1 },
      },
      { new: true },
    );

    if (!message) return null;

    // Clean up empty reaction entries
    await Message.updateOne(
      { _id: messageId },
      { $pull: { reactions: { count: { $lte: 0 } } } },
    );

    return Message.findById(messageId);
  }

  /**
   * Search messages by content.
   * @param {string} query
   * @param {object} options
   * @param {string} [options.channelId] - Scope to specific channel
   * @param {number} [options.limit=20]
   * @returns {Promise<Message[]>}
   */
  async search(query, { channelId = null, channelIds = null, limit = 20 } = {}) {
    const filter = {
      $text: { $search: query },
      isDeleted: false,
    };
    if (channelId) filter.channelId = channelId;
    else if (channelIds && channelIds.length > 0) filter.channelId = { $in: channelIds };

    return Message.find(filter, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .populate('authorId', 'name email avatar flowTaskUserId')
      .populate({
        path: 'fileReferences',
        populate: { path: 'fileId' }
      })
      .populate('channelId', 'name slug type')
      .lean();
  }

  /**
   * Find messages by FlowTask entity reference.
   * @param {string} entityType
   * @param {string} entityId
   * @returns {Promise<Message[]>}
   */
  async findByFlowTaskRef(entityType, entityId) {
    return Message.find({
      'flowTaskRef.entityType': entityType,
      'flowTaskRef.entityId': entityId,
      isDeleted: false,
    })
      .sort({ createdAt: 1 })
      .populate('authorId', 'name email avatar flowTaskUserId')
      .lean();
  }

  /**
   * Count messages in a channel after a given message ID.
   * Used for unread count calculation.
   * @param {string} channelId
   * @param {string} afterMessageId
   * @returns {Promise<number>}
   */
  async countAfter(channelId, afterMessageId) {
    return Message.countDocuments({
      channelId,
      _id: { $gt: afterMessageId },
      isDeleted: false,
    });
  }

  /**
   * Get the latest message in a channel.
   * @param {string} channelId
   * @returns {Promise<Message|null>}
   */
  async getLatestInChannel(channelId) {
    return Message.findOne({ channelId, isDeleted: false })
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * Increment reply count on a root message.
   * @param {string} messageId
   * @returns {Promise<void>}
   */
  async incrementReplyCount(messageId) {
    await Message.updateOne(
      { _id: messageId },
      { $inc: { replyCount: 1 } },
    );
  }
}

export default new MessageRepository();
