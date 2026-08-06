import { AppState } from 'react-native';
import { getSocket } from './socket';
import logger from '../utils/logger';
import { useChannelStore } from '../stores/channelStore';
import { readReceiptAPI } from './api';

/**
 * ConversationPresenceManager — mobile parity with web conversationPresence.
 *
 * Tracks which conversation the user is viewing and whether the app is
 * foregrounded, and emits window:focus / window:blur so the server can
 * suppress unreads, push, and promote DM receipts to "seen".
 */
class ConversationPresenceManager {
  constructor() {
    this.activeConversationId = null;
    this.activeConversationType = null; // 'channel' | 'dm' | 'thread'
    this.appActive = AppState.currentState === 'active';
    this._initialized = false;
    this._appStateSub = null;
  }

  setup() {
    if (this._initialized) return;

    this._appStateSub = AppState.addEventListener('change', (nextState) => {
      const wasActive = this.appActive;
      this.appActive = nextState === 'active';

      if (this.appActive && !wasActive) {
        if (this.activeConversationId) {
          this.emitSocketFocus(this.activeConversationId);
          useChannelStore.getState().updateUnread(this.activeConversationId, 0);
          readReceiptAPI.markRead(this.activeConversationId).catch((err) => {
            logger.error('[Presence] Failed to mark read on foreground', err?.message);
          });
        }
      } else if (!this.appActive && wasActive) {
        this.emitSocketBlur();
      }
    });

    this._initialized = true;
    logger.info('[Presence] ConversationPresenceManager initialized');
  }

  cleanup() {
    this._appStateSub?.remove?.();
    this._appStateSub = null;
    this._initialized = false;
  }

  setActive(conversationId, type = 'channel') {
    const cid = conversationId != null ? String(conversationId) : null;
    this.activeConversationId = cid;
    this.activeConversationType = type;

    if (cid && this.appActive) {
      this.emitSocketFocus(cid);
    } else if (!cid) {
      this.emitSocketBlur();
    }
  }

  clearActive() {
    this.activeConversationId = null;
    this.activeConversationType = null;
    this.emitSocketBlur();
  }

  isActive(conversationId) {
    if (!conversationId || !this.activeConversationId) return false;
    return String(conversationId) === String(this.activeConversationId) && this.appActive;
  }

  getActiveConversationId() {
    return this.activeConversationId;
  }

  isAppActive() {
    return this.appActive;
  }

  /**
   * Re-emit focus after socket reconnect so server socket.activeChannelId is restored.
   */
  reemitFocusIfNeeded() {
    if (this.activeConversationId && this.appActive) {
      this.emitSocketFocus(this.activeConversationId);
    }
  }

  emitSocketFocus(channelId) {
    try {
      const socket = getSocket();
      if (socket?.connected && channelId) {
        socket.emit('window:focus', { channelId: String(channelId) });
      }
    } catch (error) {
      logger.debug('[Presence] Failed to emit window:focus', { error: error?.message });
    }
  }

  emitSocketBlur() {
    try {
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('window:blur', {});
      }
    } catch (error) {
      logger.debug('[Presence] Failed to emit window:blur', { error: error?.message });
    }
  }
}

export const conversationPresence = new ConversationPresenceManager();
export default conversationPresence;
