import { useChannelStore } from '../stores/channelStore';
import { conversationPresence } from './conversationPresence';
import { useAuthStore } from '../stores/authStore';
import { readReceiptAPI } from './api';
import { getSocket } from './socket';
import logger from '../utils/logger';

/**
 * UnreadManager — Centralized unread state management.
 * 
 * Responsibilities:
 * - Intercept all incoming message events
 * - Apply presence-based filtering (prevent unread increment if actively viewing)
 * - Auto-mark messages as read when user is viewing the conversation
 * - Coordinate with channelStore, notificationStore, and socket handlers
 * - Calculate total unread counts for workspace/sidebar
 * 
 * Architecture:
 * - Singleton pattern for consistent state
 * - Debounced auto-mark-as-read to prevent API spam
 * - Validates server UNREAD_UPDATED events against active conversation
 */
class UnreadManager {
  constructor() {
    this._autoMarkTimers = new Map(); // Debounce timers by channelId
    this._AUTO_MARK_DEBOUNCE_MS = 300; // Wait 300ms before marking as read
  }

  /**
   * Handle incoming message from socket.
   * Prevents unread increment if user is actively viewing the conversation.
   * 
   * @param {Object} message - Socket message payload
   */
  handleMessageReceived(message) {
    const { channelId, authorId, _id: messageId } = message;
    if (!channelId) return;

    const currentUserId = useAuthStore.getState().user?._id;
    
    // Skip own messages (handled via optimistic UI + ACK)
    if (authorId === currentUserId) {
      logger.debug('Skipping own message for unread logic', { messageId, channelId });
      return;
    }

    // Check if user is actively viewing this conversation
    if (conversationPresence.isActive(channelId)) {
      // User is viewing this conversation — auto-mark as read
      logger.debug('User actively viewing conversation, auto-marking as read', { 
        channelId, 
        messageId 
      });
      this.scheduleAutoMarkAsRead(channelId, messageId);
      return; // Don't increment unread
    }

    // User not viewing — increment unread normally via channelStore
    logger.debug('User not viewing conversation, incrementing unread', { 
      channelId, 
      messageId 
    });
    this.incrementUnread(channelId);
  }

  /**
   * Handle UNREAD_UPDATED socket event from server.
   * Validates against active conversation before applying update.
   * 
   * @param {Object} data - { channelId, unreadCount }
   */
  handleUnreadUpdate({ channelId, unreadCount }) {
    if (!channelId) return;

    // If user is actively viewing this conversation, ignore server's unread count
    if (conversationPresence.isActive(channelId)) {
      logger.debug('Ignoring unread update for active conversation', { 
        channelId, 
        serverUnreadCount: unreadCount 
      });
      // Ensure it's set to 0
      useChannelStore.getState().updateUnread(channelId, 0);
      return;
    }
    
    // Apply server's update
    logger.debug('Applying unread update from server', { 
      channelId, 
      unreadCount 
    });
    useChannelStore.getState().updateUnread(channelId, unreadCount);
  }

  /**
   * Schedule auto-mark-as-read with debouncing.
   * Prevents API spam when multiple messages arrive rapidly.
   * 
   * @param {string} channelId - Channel/DM ID
   * @param {string} messageId - Latest message ID
   * @private
   */
  scheduleAutoMarkAsRead(channelId, messageId) {
    // Clear existing timer for this channel
    if (this._autoMarkTimers.has(channelId)) {
      clearTimeout(this._autoMarkTimers.get(channelId));
    }

    // Set new timer
    const timer = setTimeout(async () => {
      try {
        await this.autoMarkAsRead(channelId, messageId);
      } catch (error) {
        logger.error('Auto-mark-as-read failed', { 
          channelId, 
          messageId, 
          error: error.message 
        });
      } finally {
        this._autoMarkTimers.delete(channelId);
      }
    }, this._AUTO_MARK_DEBOUNCE_MS);

    this._autoMarkTimers.set(channelId, timer);
  }

  /**
   * Mark conversation as read via API and update stores.
   * 
   * @param {string} channelId - Channel/DM ID
   * @param {string} messageId - Latest read message ID
   */
  async autoMarkAsRead(channelId, messageId) {
    try {
      // Call read receipt API
      await readReceiptAPI.markRead(channelId, messageId);
      
      // Update local store
      useChannelStore.getState().updateUnread(channelId, 0);

      // Emit socket read receipt (optional, for real-time sync)
      try {
        const socket = getSocket();
        if (socket && socket.connected) {
          socket.emit('dm:markSeen', { channelId });
        }
      } catch (error) {
        logger.debug('Failed to emit socket read receipt', { error: error.message });
      }

      logger.debug('Auto-marked conversation as read', { channelId, messageId });
    } catch (error) {
      logger.error('Failed to auto-mark as read', { 
        channelId, 
        messageId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Increment unread count for a channel.
   * Directly updates the channelStore unreads object.
   * 
   * @param {string} channelId - Channel/DM ID
   */
  incrementUnread(channelId) {
    const state = useChannelStore.getState();
    const currentCount = state.unreads[channelId] || 0;
    state.updateUnread(channelId, currentCount + 1);
  }

  /**
   * Calculate total unread count across all channels.
   * 
   * @param {Object} unreads - { [channelId]: count }
   * @returns {number} Total unread count
   */
  calculateTotalUnread(unreads) {
    if (!unreads || typeof unreads !== 'object') return 0;
    
    return Object.values(unreads).reduce((sum, count) => {
      return sum + (typeof count === 'number' ? count : 0);
    }, 0);
  }

  /**
   * Cleanup debounce timers (call on app unmount).
   */
  cleanup() {
    for (const timer of this._autoMarkTimers.values()) {
      clearTimeout(timer);
    }
    this._autoMarkTimers.clear();
  }
}

// Export singleton instance
export const unreadManager = new UnreadManager();
export default unreadManager;
