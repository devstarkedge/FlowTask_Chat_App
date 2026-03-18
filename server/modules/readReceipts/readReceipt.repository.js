import ReadReceipt from './ReadReceipt.model.js';
import { injectWorkspaceFilterRequired } from '../../middleware/workspaceContext.js';

/**
 * ReadReceipt Repository — data access layer for read receipt documents.
 * Centralizes all database queries following the Model → Repository → Service pattern.
 * All query methods accept an optional workspaceId for multi-tenant scoping.
 */

class ReadReceiptRepository {
  /**
   * Get unread counts for all channels where a user has unread messages.
   * @param {string} userId
   * @param {string} [workspaceId]
   * @returns {Promise<Array<{ channelId, unreadCount, unreadMentionCount }>>}
   */
  async getUnreadCounts(userId, workspaceId) {
    const filter = injectWorkspaceFilterRequired(
      { userId, unreadCount: { $gt: 0 } },
      workspaceId,
      'read receipt unread counts query',
    );
    return ReadReceipt.find(
      filter,
      { channelId: 1, unreadCount: 1, unreadMentionCount: 1, lastReadMessageId: 1, _id: 0 },
    ).lean();
  }

  /**
   * Mark a channel as fully read for a user.
   * @param {string} userId
   * @param {string} channelId
   * @param {string|null} lastMessageId
   * @param {string} [workspaceId]
   * @returns {Promise<ReadReceipt>}
   */
  async markChannelAsRead(userId, channelId, lastMessageId, workspaceId) {
    const filter = injectWorkspaceFilterRequired(
      { userId, channelId },
      workspaceId,
      'mark channel as read query',
    );
    return ReadReceipt.findOneAndUpdate(
      filter,
      {
        lastReadMessageId: lastMessageId,
        lastReadAt: new Date(),
        unreadCount: 0,
        unreadMentionCount: 0,
        workspaceId,
      },
      { upsert: true, new: true },
    );
  }

  /**
   * Increment unread count for all users in a channel except the author.
   * @param {string} channelId
   * @param {string} excludeUserId
   * @param {boolean} hasMention
   * @param {string} [workspaceId]
   * @returns {Promise}
   */
  async incrementUnread(channelId, excludeUserId, hasMention = false, workspaceId) {
    const update = { $inc: { unreadCount: 1 } };
    if (hasMention) {
      update.$inc.unreadMentionCount = 1;
    }
    const filter = injectWorkspaceFilterRequired({
      channelId,
      userId: { $ne: excludeUserId },
    }, workspaceId, 'increment unread query');
    return ReadReceipt.updateMany(filter, update);
  }

  /**
   * Get the read receipt for a specific user and channel.
   * @param {string} userId
   * @param {string} channelId
   * @param {string} [workspaceId]
   * @returns {Promise<ReadReceipt|null>}
   */
  async findByUserAndChannel(userId, channelId, workspaceId) {
    const filter = injectWorkspaceFilterRequired(
      { userId, channelId },
      workspaceId,
      'find read receipt query',
    );
    return ReadReceipt.findOne(filter).lean();
  }

  /**
   * Create or ensure a read receipt exists for a user joining a channel.
   * @param {string} userId
   * @param {string} channelId
   * @param {string} [workspaceId]
   * @returns {Promise<ReadReceipt>}
   */
  async ensureExists(userId, channelId, workspaceId) {
    const filter = injectWorkspaceFilterRequired(
      { userId, channelId },
      workspaceId,
      'ensure read receipt query',
    );
    return ReadReceipt.findOneAndUpdate(
      filter,
      { $setOnInsert: { unreadCount: 0, unreadMentionCount: 0, workspaceId } },
      { upsert: true, new: true },
    );
  }

  /**
   * Remove all read receipts for a user leaving a channel.
   * @param {string} userId
   * @param {string} channelId
   * @param {string} [workspaceId]
   * @returns {Promise}
   */
  async removeByUserAndChannel(userId, channelId, workspaceId) {
    const filter = injectWorkspaceFilterRequired(
      { userId, channelId },
      workspaceId,
      'remove read receipt query',
    );
    return ReadReceipt.deleteOne(filter);
  }

  /**
   * Get all readers of a channel (for read receipt indicators).
   * @param {string} channelId
   * @param {string} [workspaceId]
   * @returns {Promise<Array<ReadReceipt>>}
   */
  async getChannelReaders(channelId, workspaceId) {
    const filter = injectWorkspaceFilterRequired(
      { channelId },
      workspaceId,
      'channel readers query',
    );
    return ReadReceipt.find(filter).lean();
  }
}

export default new ReadReceiptRepository();
