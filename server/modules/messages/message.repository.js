import Message from './Message.model.js';
import MessageReaction from './MessageReaction.model.js';
import Thread from '../threads/Thread.model.js';
import { injectWorkspaceFilter, injectWorkspaceFilterRequired } from '../../middleware/workspaceContext.js';
import mongoose from 'mongoose';

/**
 * Message Repository — data access layer for Message documents.
 * Encapsulates all Mongoose queries for messages.
 * Uses cursor-based pagination for real-time feed performance.
 * All query methods accept an optional workspaceId for multi-tenant scoping.
 *
 * Reactions are dual-written to both Message.reactions[] (embedded)
 * and the MessageReaction collection for scalability.
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
   * Check for a recent duplicate activity message in the same channel.
   * Used to prevent double-inserts when both the typed and legacy webhook
   * events are received within a short window.
   * @param {string|ObjectId} channelId
   * @param {string} eventType  - activityMeta.eventType
   * @param {string} taskId     - activityMeta.taskId (string)
   * @param {number} [windowMs=30000] - look-back window in milliseconds
   * @returns {Promise<boolean>} true if a duplicate exists
   */
  async findRecentActivityDuplicate(channelId, eventType, taskId, windowMs = 30000) {
    const since = new Date(Date.now() - windowMs);
    const exists = await Message.exists({
      channelId,
      'activityMeta.eventType': eventType,
      'activityMeta.taskId': taskId,
      createdAt: { $gte: since },
      isDeleted: { $ne: true },
    });
    return !!exists;
  }

  /**
   * Find message by ID.
   * @param {string} id
   * @param {object} [options]
   * @param {boolean} [options.populate=true]
   * @returns {Promise<Message|null>}
   */
  async findById(id, { populate = true, workspaceId } = {}) {
    if (!mongoose.isValidObjectId(id)) {
      return null;
    }

    const query = Message.findOne(injectWorkspaceFilter({ _id: id }, workspaceId));
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
   * @param {number} [options.limit=80]
   * @param {'before'|'after'} [options.direction='before'] - Load before or after cursor
   * @param {string} [options.workspaceId]
   * @returns {Promise<Message[]>}
   */
 async getChannelMessages(
  channelId,
  { cursor = null, limit = 80, direction = 'before', workspaceId, userId, isAdmin = false } = {}
) {
  const objectUserId = userId ? new mongoose.Types.ObjectId(userId) : null;

  let filter = {
    channelId,
    threadId: null,
    ...(workspaceId && { workspaceId })
  };

  //  ADMIN - see everything
  if (!isAdmin) {
    filter.$or = [
      { visibleTo: { $exists: false } },
      { visibleTo: { $size: 0 } },
      ...(objectUserId
        ? [{ visibleTo: { $in: [objectUserId] } }]
        : [])
    ];
  }

  if (cursor && mongoose.isValidObjectId(cursor)) {
    filter._id = direction === 'before'
      ? { $lt: cursor }
      : { $gt: cursor };
  }

  const sortOrder = direction === 'after' ? 1 : -1;

  const messages = await Message.find(filter)
    .sort({ _id: sortOrder })
    .limit(limit)
    .populate('authorId', 'name email avatar flowTaskUserId onlineStatus')
    .populate({
      path: 'fileReferences',
      populate: { path: 'fileId' }
    })
    .lean();

  if (direction === 'before') {
    messages.reverse();
  }

  // Enrich root messages that have replies with thread participant data
  // so the ThreadPreview in the UI can show replier avatars without extra requests.
  const rootIds = messages.filter((m) => m.replyCount > 0).map((m) => m._id);
  if (rootIds.length > 0) {
    const threads = await Thread.find({ rootMessageId: { $in: rootIds }, ...(workspaceId && { workspaceId }) })
      .populate('participantIds', 'name avatar')
      .lean();
    const threadByRoot = {};
    for (const t of threads) {
      threadByRoot[t.rootMessageId.toString()] = t;
    }
    for (const m of messages) {
      const t = threadByRoot[m._id.toString()];
      if (t) {
        m.lastReplyAt = t.lastReplyAt || m.lastReplyAt || null;
        m.threadParticipants = (t.participantIds || []).map((p) => ({
          _id: p._id,
          name: p.name,
          avatar: p.avatar || null,
        }));
      }
    }
  }

  return messages;
}

  /**
   * Get message context around a target message in a channel.
   * Returns [older..., target, newer...] in chronological order.
   */
  async getMessagesAround(channelId, messageId, { limit = 20, workspaceId } = {}) {
    const scopedTargetFilter = injectWorkspaceFilterRequired(
      { _id: messageId, channelId },
      workspaceId,
      'message around query',
    );

    const target = await Message.findOne(scopedTargetFilter)
      .populate('authorId', 'name email avatar flowTaskUserId onlineStatus')
      .populate({
        path: 'fileReferences',
        populate: { path: 'fileId' },
      })
      .lean();

    if (!target) return null;

    const safeLimit = Math.min(Math.max(Number(limit) || 20, 4), 80);
    const beforeLimit = Math.floor(safeLimit / 2);
    const afterLimit = safeLimit - beforeLimit;

    const beforeFilter = injectWorkspaceFilterRequired(
      {
        channelId,
        isDeleted: false,
        threadId: null,
        $or: [
          { createdAt: { $lt: target.createdAt } },
          { createdAt: target.createdAt, _id: { $lt: target._id } },
        ],
      },
      workspaceId,
      'message around before query',
    );

    const afterFilter = injectWorkspaceFilterRequired(
      {
        channelId,
        isDeleted: false,
        threadId: null,
        $or: [
          { createdAt: { $gt: target.createdAt } },
          { createdAt: target.createdAt, _id: { $gt: target._id } },
        ],
      },
      workspaceId,
      'message around after query',
    );

    const beforeRaw = await Message.find(beforeFilter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(beforeLimit + 1)
      .populate('authorId', 'name email avatar flowTaskUserId onlineStatus')
      .populate({
        path: 'fileReferences',
        populate: { path: 'fileId' },
      })
      .lean();

    const afterRaw = await Message.find(afterFilter)
      .sort({ createdAt: 1, _id: 1 })
      .limit(afterLimit + 1)
      .populate('authorId', 'name email avatar flowTaskUserId onlineStatus')
      .populate({
        path: 'fileReferences',
        populate: { path: 'fileId' },
      })
      .lean();

    const hasMoreBefore = beforeRaw.length > beforeLimit;
    const hasMoreAfter = afterRaw.length > afterLimit;

    const before = beforeRaw.slice(0, beforeLimit).reverse();
    const after = afterRaw.slice(0, afterLimit);

    return {
      messages: [...before, target, ...after],
      highlightedMessageId: target._id.toString(),
      hasMoreBefore,
      hasMoreAfter,
    };
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
  async getThreadReplies(threadId, { cursor = null, limit = 30, workspaceId } = {}) {
    const filter = injectWorkspaceFilterRequired(
      { threadId },
      workspaceId,
      'thread replies query',
    );

    if (cursor && mongoose.isValidObjectId(cursor)) {
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
  async update(messageId, updates, workspaceId) {
    const filter = injectWorkspaceFilter({ _id: messageId }, workspaceId);
    return Message.findOneAndUpdate(filter, updates, { returnDocument: 'after' })
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
  async softDelete(messageId, deletedBy, workspaceId) {
    const filter = injectWorkspaceFilter({ _id: messageId }, workspaceId);

    const updated = await Message.findOneAndUpdate(
      filter,
      {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy,

        // Keep consistent tombstone content
        content: '[Message deleted]',
        htmlContent: '<p>[Message deleted]</p>',
      },
      { returnDocument: 'after' }
    )
      .populate('authorId', 'name email avatar flowTaskUserId onlineStatus')
      .lean();

    if (!updated) return null;

    //  Normalize IDs (VERY IMPORTANT for frontend matching)
    updated._id = updated._id.toString();
    updated.channelId = updated.channelId?.toString();
    updated.workspaceId = updated.workspaceId?.toString();

    if (updated.visibleTo) {
      updated.visibleTo = updated.visibleTo.map(id => id.toString());
    }

    return updated;
  }

  /**
   * Pin a message.
   * @param {string} messageId
   * @param {string} pinnedBy - ChatUser _id
   * @returns {Promise<Message|null>}
   */
  async pin(messageId, pinnedBy, workspaceId) {
    const filter = injectWorkspaceFilter({ _id: messageId }, workspaceId);
    return Message.findOneAndUpdate(
      filter,
      { isPinned: true, pinnedBy, pinnedAt: new Date() },
      { returnDocument: 'after' },
    ).exec();
  }

  /**
   * Unpin a message.
   * @param {string} messageId
   * @returns {Promise<Message|null>}
   */
  async unpin(messageId, workspaceId) {
    const filter = injectWorkspaceFilter({ _id: messageId }, workspaceId);
    return Message.findOneAndUpdate(
      filter,
      { isPinned: false, pinnedBy: null, pinnedAt: null },
      { returnDocument: 'after' },
    ).exec();
  }

  /**
   * Get pinned messages for a channel.
   * @param {string} channelId
   * @param {string} [workspaceId]
   * @returns {Promise<Message[]>}
   */
  async getPinnedMessages(channelId, workspaceId) {
    const filter = injectWorkspaceFilterRequired(
      { channelId, isPinned: true, isDeleted: false },
      workspaceId,
      'pinned messages query',
    );
    return Message.find(filter)
      .sort({ pinnedAt: -1 })
      .populate('authorId', 'name email avatar flowTaskUserId')
      .populate('pinnedBy', 'name avatar email')
      .populate({
        path: 'fileReferences',
        populate: {
          path: 'fileId',
          select: 'secureUrl originalName mimeType fileSize thumbnailUrl resourceType',
        },
      })
      .lean();
  }

  /**
   * Add reaction to a message (atomic operation).
   * Dual-writes to both embedded array and MessageReaction collection.
   * @param {string} messageId
   * @param {string} emoji
   * @param {string} userId - ChatUser _id
   * @returns {Promise<Message|null>}
   */
  async addReaction(messageId, emoji, userId) {
    // Write to MessageReaction collection
    const msg = await Message.findById(messageId).select('channelId workspaceId').lean();
    if (msg) {
      await MessageReaction.findOneAndUpdate(
        { messageId, emoji, userId },
        { $setOnInsert: { messageId, emoji, userId, channelId: msg.channelId, workspaceId: msg.workspaceId } },
        { upsert: true },
      ).catch(() => {}); // non-critical — embedded array is primary for now
    }

    // First try to add to existing reaction entry (embedded)
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
      { returnDocument: 'after' },
    );

    if (result) return result;

    // If emoji doesn't exist yet, add new reaction entry
    const added = await Message.findOneAndUpdate(
      {
        _id: messageId,
        'reactions.emoji': { $ne: emoji },
      },
      {
        $push: {
          reactions: { emoji, userIds: [userId], count: 1 },
        },
      },
      { returnDocument: 'after' },
    );

    // If both updates returned null, user already reacted — return as-is
    return added || Message.findById(messageId);
  }

  /**
   * Remove reaction from a message (atomic operation).
   * Dual-writes to both embedded array and MessageReaction collection.
   * @param {string} messageId
   * @param {string} emoji
   * @param {string} userId - ChatUser _id
   * @returns {Promise<Message|null>}
   */
  async removeReaction(messageId, emoji, userId) {
    // Remove from MessageReaction collection
    await MessageReaction.deleteOne({ messageId, emoji, userId }).catch(() => {});

    const message = await Message.findOneAndUpdate(
      {
        _id: messageId,
        'reactions.emoji': emoji,
        'reactions.userIds': userId,
      },
      {
        $pull: { 'reactions.$.userIds': userId },
        $inc: { 'reactions.$.count': -1 },
      },
      { returnDocument: 'after' },
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
   * @param {string} [options.workspaceId]
   * @returns {Promise<Message[]>}
   */
  async search(query, { channelId = null, channelIds = null, limit = 20, workspaceId } = {}) {
    const filter = injectWorkspaceFilterRequired({
      $text: { $search: query },
      isDeleted: false,
    }, workspaceId, 'message search query');
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
async findByFlowTaskRef(entityType, entityId, workspaceId) {
  return Message.find({
    workspaceId,
    'flowTaskRef.entityType': entityType,
    'flowTaskRef.entityId': entityId,
    isDeleted: false,
  }).lean();
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