import ReadReceipt from './ReadReceipt.model.js';

/**
 * ReadReceipt Repository — data access layer for read receipt documents.
 * Centralizes all database queries following the Model → Repository → Service pattern.
 */

class ReadReceiptRepository {
  /**
   * Get unread counts for all channels where a user has unread messages.
   * @param {string} userId
   * @returns {Promise<Array<{ channelId, unreadCount, unreadMentionCount }>>}
   */
  async getUnreadCounts(userId) {
    return ReadReceipt.find(
      { userId, unreadCount: { $gt: 0 } },
      { channelId: 1, unreadCount: 1, unreadMentionCount: 1, lastReadMessageId: 1, _id: 0 },
    ).lean();
  }

  /**
   * Mark a channel as fully read for a user.
   * Upserts the read receipt and resets unread counts to zero.
   * @param {string} userId
   * @param {string} channelId
   * @param {string|null} lastMessageId - ID of the last message the user has seen
   * @returns {Promise<ReadReceipt>}
   */
  async markChannelAsRead(userId, channelId, lastMessageId) {
    return ReadReceipt.findOneAndUpdate(
      { userId, channelId },
      {
        lastReadMessageId: lastMessageId,
        lastReadAt: new Date(),
        unreadCount: 0,
        unreadMentionCount: 0,
      },
      { upsert: true, new: true },
    );
  }

  /**
   * Increment unread count for all users in a channel except the author.
   * Only updates existing read-receipt documents — relies on ensureExists()
   * being called when a user joins a channel so each member already has a document.
   * @param {string} channelId
   * @param {string} excludeUserId - User who sent the message (don't increment for them)
   * @param {boolean} hasMention - Whether the message contains an @mention
   * @returns {Promise}
   */
  async incrementUnread(channelId, excludeUserId, hasMention = false) {
    const update = { $inc: { unreadCount: 1 } };
    if (hasMention) {
      update.$inc.unreadMentionCount = 1;
    }

    return ReadReceipt.updateMany(
      {
        channelId,
        userId: { $ne: excludeUserId },
      },
      update,
    );
  }

  /**
   * Get the read receipt for a specific user and channel.
   * @param {string} userId
   * @param {string} channelId
   * @returns {Promise<ReadReceipt|null>}
   */
  async findByUserAndChannel(userId, channelId) {
    return ReadReceipt.findOne({ userId, channelId }).lean();
  }

  /**
   * Create or ensure a read receipt exists for a user joining a channel.
   * @param {string} userId
   * @param {string} channelId
   * @returns {Promise<ReadReceipt>}
   */
  async ensureExists(userId, channelId) {
    return ReadReceipt.findOneAndUpdate(
      { userId, channelId },
      { $setOnInsert: { unreadCount: 0, unreadMentionCount: 0 } },
      { upsert: true, new: true },
    );
  }

  /**
   * Remove all read receipts for a user leaving a channel.
   * @param {string} userId
   * @param {string} channelId
   * @returns {Promise}
   */
  async removeByUserAndChannel(userId, channelId) {
    return ReadReceipt.deleteOne({ userId, channelId });
  }

  /**
   * Get all readers of a channel (for read receipt indicators).
   * @param {string} channelId
   * @returns {Promise<Array<ReadReceipt>>}
   */
  async getChannelReaders(channelId) {
    return ReadReceipt.find({ channelId }).lean();
  }
}

export default new ReadReceiptRepository();
