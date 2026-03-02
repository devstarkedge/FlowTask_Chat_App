import readReceiptRepository from './readReceipt.repository.js';
import { emitToUser } from '../../sockets/socketManager.js';
import logger from '../../utils/logger.js';
import { SOCKET_EVENTS } from '../../config/constants.js';
import messageService from '../messages/message.service.js';

/**
 * Read Receipt Service — manages unread counts and read state per user per channel.
 * Delegates all data access to readReceiptRepository (Model → Repository → Service pattern).
 */

class ReadReceiptService {
  /**
   * Mark a channel as read for a user (set unread to 0).
   * For DM channels, also marks messages as seen (delivery status).
   */
  async markAsRead(userId, channelId, lastReadMessageId) {
    const receipt = await readReceiptRepository.markChannelAsRead(
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
   * Includes lastReadMessageId for unread separator rendering.
   */
  async getUnreadCounts(userId) {
    return readReceiptRepository.getUnreadCounts(userId);
  }

  /**
   * Increment unread count for a set of users on a channel.
   * Called internally when a new message is posted.
   */
  async incrementUnread(channelId, userIds, hasMention = false) {
    return readReceiptRepository.incrementUnread(channelId, userIds, hasMention);
  }

  /**
   * Get the read receipt for a specific user in a channel.
   */
  async getReceipt(userId, channelId) {
    return readReceiptRepository.findByUserAndChannel(userId, channelId);
  }

  /**
   * Ensure a read receipt exists when a user joins a channel.
   */
  async ensureReceiptExists(userId, channelId) {
    return readReceiptRepository.ensureExists(userId, channelId);
  }

  /**
   * Clean up read receipts when a user leaves a channel.
   */
  async removeReceipt(userId, channelId) {
    return readReceiptRepository.removeByUserAndChannel(userId, channelId);
  }
}

export default new ReadReceiptService();
