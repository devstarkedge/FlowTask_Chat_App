import { useChannelStore } from '../stores/channelStore';
import { conversationPresence } from './conversationPresence';
import { useAuthStore } from '../stores/authStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { readReceiptAPI } from './api';
import { getSocket } from './socket';
import logger from '../utils/logger';
import { queryClient } from '../queries/queryClient';
import { queryKeys } from '../queries/queryKeys';

/**
 * UnreadManager — mobile parity with web unreadManager.
 * Presence-aware unread increments + auto-mark-as-read while viewing.
 */
class UnreadManager {
  constructor() {
    this._autoMarkTimers = new Map();
    this._AUTO_MARK_DEBOUNCE_MS = 300;
  }

  handleMessageReceived(message) {
    if (!message || !message.channelId) return;

    const channelId =
      typeof message.channelId === 'object' ? message.channelId._id : message.channelId;
    const authorId =
      typeof message.authorId === 'object' ? message.authorId._id : message.authorId;
    const messageId = message._id;
    const cid = channelId != null ? String(channelId) : null;
    if (!cid) return;

    const currentUserId = useAuthStore.getState().user?._id;
    if (authorId != null && String(authorId) === String(currentUserId)) {
      return;
    }

    if (conversationPresence.isActive(cid)) {
      const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId;
      const channels = queryClient.getQueryData(queryKeys.channels(activeWorkspaceId)) || [];
      const channel = channels.find((c) => String(c._id) === cid);
      if (channel?.type === 'dm') {
        try {
          const socket = getSocket();
          if (socket?.connected) {
            socket.emit('dm:markSeen', { channelId: cid });
          }
        } catch (err) {
          logger.debug('[UnreadManager] Failed to emit dm:markSeen', { error: err?.message });
        }
      }

      this.scheduleAutoMarkAsRead(cid, messageId);
      return;
    }

    this.incrementUnread(cid);
  }

  handleUnreadUpdate({ channelId, unreadCount }) {
    if (!channelId) return;
    const cid = String(channelId);

    if (conversationPresence.isActive(cid)) {
      useChannelStore.getState().updateUnread(cid, 0);
      return;
    }

    useChannelStore.getState().updateUnread(cid, unreadCount);
  }

  scheduleAutoMarkAsRead(channelId, messageId) {
    if (this._autoMarkTimers.has(channelId)) {
      clearTimeout(this._autoMarkTimers.get(channelId));
    }

    const timer = setTimeout(async () => {
      try {
        await this.autoMarkAsRead(channelId, messageId);
      } catch (error) {
        logger.error('[UnreadManager] Auto-mark-as-read failed', {
          channelId,
          messageId,
          error: error.message,
        });
      } finally {
        this._autoMarkTimers.delete(channelId);
      }
    }, this._AUTO_MARK_DEBOUNCE_MS);

    this._autoMarkTimers.set(channelId, timer);
  }

  async autoMarkAsRead(channelId, messageId) {
    await readReceiptAPI.markRead(channelId, messageId);
    useChannelStore.getState().updateUnread(channelId, 0);

    try {
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('dm:markSeen', { channelId });
      }
    } catch (error) {
      logger.debug('[UnreadManager] Failed to emit dm:markSeen', { error: error?.message });
    }
  }

  incrementUnread(channelId) {
    const state = useChannelStore.getState();
    const currentCount = state.unreads[channelId] || 0;
    state.updateUnread(channelId, currentCount + 1);
  }

  cleanup() {
    for (const timer of this._autoMarkTimers.values()) {
      clearTimeout(timer);
    }
    this._autoMarkTimers.clear();
  }
}

export const unreadManager = new UnreadManager();
export default unreadManager;
