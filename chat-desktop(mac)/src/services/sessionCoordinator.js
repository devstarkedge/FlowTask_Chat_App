/**
 * Enterprise Cross-Tab & Multi-Instance Session Coordinator
 * Synchronizes authentication, token rotations, and logout events across
 * all browser tabs, popout windows (e.g. Huddles), and multi-window Electron instances.
 */
import logger from '../utils/logger';

const CHANNEL_NAME = 'taskchat_session_sync';

let broadcastChannel = null;
const subscribers = new Set();
let isListening = false;

function getBroadcastChannel() {
  if (typeof window === 'undefined') return null;
  if (!broadcastChannel && typeof window.BroadcastChannel !== 'undefined') {
    try {
      broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    } catch (e) {
      logger.debug('[SessionCoordinator] BroadcastChannel not supported:', e);
      broadcastChannel = null;
    }
  }
  return broadcastChannel;
}

export const SESSION_EVENTS = {
  TOKEN_REFRESHED: 'SESSION_TOKEN_REFRESHED',
  LOGIN: 'SESSION_LOGIN',
  LOGOUT: 'SESSION_LOGOUT',
  WORKSPACE_CHANGED: 'SESSION_WORKSPACE_CHANGED',
};

/**
 * Broadcast an auth event to all other tabs/windows.
 */
export function broadcastSessionEvent(type, payload = {}) {
  if (typeof window === 'undefined') return;

  const eventPayload = {
    type,
    payload,
    timestamp: Date.now(),
    tabId: window.__taskChatTabId || (window.__taskChatTabId = Math.random().toString(36).slice(2)),
  };

  const channel = getBroadcastChannel();
  if (channel) {
    try {
      channel.postMessage(eventPayload);
    } catch (e) {
      logger.debug('[SessionCoordinator] Failed to postMessage:', e);
    }
  }

  // LocalStorage event fallback for environments without BroadcastChannel
  try {
    localStorage.setItem(
      'taskchat_session_event',
      JSON.stringify({ ...eventPayload, nonce: Math.random() })
    );
  } catch (e) {}
}

function ensureGlobalListeners() {
  if (typeof window === 'undefined' || isListening) return;
  isListening = true;

  const myTabId = window.__taskChatTabId || (window.__taskChatTabId = Math.random().toString(36).slice(2));

  const handleEvent = (eventData) => {
    if (!eventData || eventData.tabId === myTabId) return;

    logger.debug('[SessionCoordinator] Received cross-tab event:', eventData.type);

    subscribers.forEach((sub) => {
      try {
        switch (eventData.type) {
          case SESSION_EVENTS.TOKEN_REFRESHED:
            if (typeof sub.onTokenRefreshed === 'function') {
              sub.onTokenRefreshed(eventData.payload);
            }
            break;
          case SESSION_EVENTS.LOGOUT:
            if (typeof sub.onLogout === 'function') {
              sub.onLogout(eventData.payload);
            }
            break;
          case SESSION_EVENTS.LOGIN:
            if (typeof sub.onLogin === 'function') {
              sub.onLogin(eventData.payload);
            }
            break;
          case SESSION_EVENTS.WORKSPACE_CHANGED:
            if (typeof sub.onWorkspaceChanged === 'function') {
              sub.onWorkspaceChanged(eventData.payload);
            }
            break;
          default:
            break;
        }
      } catch (err) {
        logger.error('[SessionCoordinator] Error in session event handler:', err);
      }
    });
  };

  const channel = getBroadcastChannel();
  if (channel) {
    channel.onmessage = (e) => handleEvent(e.data);
  }

  // Storage event listener fallback
  const handleStorage = (e) => {
    if (e.key === 'taskchat_session_event' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        handleEvent(parsed);
      } catch (err) {}
    } else if (e.key === 'chat_access_token' && !e.newValue) {
      // Explicit deletion of access token in another tab = logout
      handleEvent({ type: SESSION_EVENTS.LOGOUT, tabId: 'storage_listener' });
    }
  };

  window.addEventListener('storage', handleStorage);
}

/**
 * Initialize / register cross-tab synchronization listeners.
 * Returns an unsubscribe callback.
 */
export function initSessionCoordinator(handlers = {}) {
  if (typeof window === 'undefined') return () => {};
  ensureGlobalListeners();
  subscribers.add(handlers);
  return () => {
    subscribers.delete(handlers);
  };
}
