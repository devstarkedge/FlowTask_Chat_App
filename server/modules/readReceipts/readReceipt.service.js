import ReadReceipt from './ReadReceipt.model.js';
import { emitToUser } from '../../sockets/socketManager.js';
import logger from '../../utils/logger.js';
import { SOCKET_EVENTS } from '../../config/constants.js';
import messageService from '../messages/message.service.js';

/**
 * Read Receipt Service — manages unread counts and read state per user per channel.
 */

class ReadReceiptService {
  /**
   * Mark a channel as read for a user (set unread to 0).
   * For DM channels, also marks messages as seen (delivery status).
   */
  async markAsRead(userId, channelId, lastReadMessageId) {
    const receipt = await ReadReceipt.markChannelAsRead(
      userId,
      channelId,
      lastReadMessageId,
    );

    // Emit updated unread count to the user
    emitToUser(userId.toString(), SOCKET_EVENTS.UNREAD_UPDATED, {
      channelId,
      unreadCount: 0,
      unreadMentionCount: 0,
    });

    // For DM channels, update message delivery status to 'seen'
    messageService.markDMMessagesAsSeen(channelId, userId).catch((err) => {
      logger.error('Failed to mark DM messages as seen', { channelId, userId: userId.toString(), error: err.message });
    });

    return receipt;
  }

  /**
   * Get unread counts for all channels a user belongs to.
   */
  async getUnreadCounts(userId) {
    return ReadReceipt.getUnreadCounts(userId);
  }

  /**
   * Increment unread count for a set of users on a channel.
   * Called internally when a new message is posted.
   */
  async incrementUnread(channelId, userIds, hasMention = false) {
    return ReadReceipt.incrementUnread(channelId, userIds, hasMention);
  }
}

export default new ReadReceiptService();
