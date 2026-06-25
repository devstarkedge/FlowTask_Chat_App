import { getSocket } from './socket';
import logger from '../utils/logger';

/**
 * ConversationPresenceManager — Single source of truth for active conversation tracking.
 * 
 * Manages:
 * - activeConversationId: Which conversation the user is currently viewing
 * - activeConversationType: 'channel' | 'dm' | 'thread'
 * - appFocused: Whether the browser window has focus
 * - tabVisible: Whether the tab is visible (Visibility API)
 * 
 * Integrates with:
 * - Socket window:focus/blur events (server-side tracking)
 * - React Navigation (conversation changes)
 * - Document Visibility API (tab switching)
 * - Window Focus/Blur events (app minimization)
 */
class ConversationPresenceManager {
  constructor() {
    this.activeConversationId = null;
    this.activeConversationType = null; // 'channel' | 'dm' | 'thread'
    this.appFocused = true;
    this.tabVisible = true;
    this._initialized = false;
  }

  /**
   * Initialize presence tracking with browser APIs.
   * Call once during app startup.
   */
  setup() {
    if (this._initialized) {
      logger.warn('ConversationPresenceManager already initialized');
      return;
    }

    // Visibility API — tracks tab switching and minimization.
    // This is the source of truth for whether the user can actually see the screen.
    // We avoid window focus/blur because they trigger when clicking on other apps
    // (e.g., editor or devtools) in split-screen/multi-monitor setups, where the
    // browser window is still visible and readable.
    document.addEventListener('visibilitychange', () => {
      this.tabVisible = document.visibilityState === 'visible';
      this.appFocused = this.tabVisible; // Sync appFocused with visibility
      
      if (this.tabVisible) {
        if (this.activeConversationId) {
          this.emitSocketFocus(this.activeConversationId);
        }
      } else {
        this.emitSocketBlur();
      }
    });

    // Page unload — cleanup
    window.addEventListener('beforeunload', () => {
      this.clearActive();
    });

    this._initialized = true;
    logger.info('ConversationPresenceManager initialized');
  }

  /**
   * Set the active conversation the user is viewing.
   * @param {string|null} conversationId - Channel/DM/Thread ID
   * @param {string} type - 'channel' | 'dm' | 'thread'
   */
  setActive(conversationId, type = 'channel') {
    const previousId = this.activeConversationId;
    
    this.activeConversationId = conversationId;
    this.activeConversationType = type;

    // Notify server about focus change
    if (conversationId) {
      this.emitSocketFocus(conversationId);
      logger.debug('Conversation focus set', { conversationId, type });
    } else {
      this.emitSocketBlur();
    }

    // If switching conversations, blur the previous one
    if (previousId && previousId !== conversationId) {
      logger.debug('Conversation focus changed', { from: previousId, to: conversationId });
    }
  }

  /**
   * Clear the active conversation (user navigated away).
   */
  clearActive() {
    if (this.activeConversationId) {
      logger.debug('Conversation focus cleared', { conversationId: this.activeConversationId });
    }
    
    this.activeConversationId = null;
    this.activeConversationType = null;
    this.emitSocketBlur();
  }

  /**
   * Check if a conversation is currently active and visible.
   * @param {string} conversationId - Channel/DM/Thread ID to check
   * @returns {boolean} True if user is actively viewing this conversation
   */
  isActive(conversationId) {
    return conversationId === this.activeConversationId 
      && this.appFocused 
      && this.tabVisible;
  }

  /**
   * Get the current active conversation ID.
   * @returns {string|null}
   */
  getActiveConversationId() {
    return this.activeConversationId;
  }

  /**
   * Get the current active conversation type.
   * @returns {string|null} 'channel' | 'dm' | 'thread'
   */
  getActiveConversationType() {
    return this.activeConversationType;
  }

  /**
   * Check if the app is currently focused and visible.
   * @returns {boolean}
   */
  isAppActive() {
    return this.appFocused && this.tabVisible;
  }

  /**
   * Emit socket focus event to server.
   * @private
   */
  emitSocketFocus(channelId) {
    try {
      const socket = getSocket();
      if (socket && socket.connected) {
        socket.emit('window:focus', { channelId });
      }
    } catch (error) {
      logger.debug('Failed to emit socket focus event', { error: error.message });
    }
  }

  /**
   * Emit socket blur event to server.
   * @private
   */
  emitSocketBlur() {
    try {
      const socket = getSocket();
      if (socket && socket.connected) {
        socket.emit('window:blur', {});
      }
    } catch (error) {
      logger.debug('Failed to emit socket blur event', { error: error.message });
    }
  }
}

// Export singleton instance
export const conversationPresence = new ConversationPresenceManager();
export default conversationPresence;
