/**
 * Network Monitor
 *
 * Monitors internet connectivity using the socket connection status from the chatStore.
 * When connectivity is restored, triggers the offline message queue flush.
 *
 * This approach avoids needing @react-native-community/netinfo by piggybacking
 * on the existing socket.io connection status.
 */
import { useChatStore } from '../stores/chatStore';
import { flushQueue } from './offlineQueue';
import { reconcileMessageInCache, updateMessageStatusLocalInCache, markMessageFailedInCache } from '../queries/cacheUtils';
import logger from '../utils/logger';

let isInitialized = false;
let unsubscribe = null;

/**
 * Initialize the network monitor.
 * Subscribes to connection status changes and flushes the queue on reconnect.
 */
export const initNetworkMonitor = () => {
  if (isInitialized) return;
  isInitialized = true;

  logger.info('[NetworkMonitor] Initialized');

  // Subscribe to store changes
  unsubscribe = useChatStore.subscribe((state, prevState) => {
    const wasDisconnected = prevState.connectionStatus !== 'connected';
    const isNowConnected = state.connectionStatus === 'connected';

    if (wasDisconnected && isNowConnected) {
      logger.info('[NetworkMonitor] Connection restored, flushing offline queue...');
      flushQueue(
        // onMessageSent
        (tempId, serverMessage) => {
          const channelId = serverMessage.channelId?._id || serverMessage.channelId;
          reconcileMessageInCache(channelId, tempId, serverMessage);
          updateMessageStatusLocalInCache(channelId, tempId, 'sent');
        },
        // onMessageFailed
        (tempId, error) => {
          // Since we might not know channelId here without storing it, we would need it from the queue entry.
          // Wait, we can modify flushQueue callback or just skip if we don't know it. Actually we don't need this local fallback if React Query fetches next time, but let's assume we don't know channelId.
          // In offlineQueue.js flushQueue, entry has channelId. 
          // Wait, offlineQueue flush callback doesn't provide channelId. Let's just rely on chatStore's offlineQueueStatus.
          const store = useChatStore.getState();
          store.markMessageFailed(tempId, error);
        }
      ).then((result) => {
        logger.info(`[NetworkMonitor] Queue flush result: ${result.sent} sent, ${result.failed} failed`);
      }).catch((err) => {
        logger.error('[NetworkMonitor] Queue flush error:', err);
      });
    }
  });

  // Also flush on initial connect if there are queued messages
  const currentStatus = useChatStore.getState().connectionStatus;
  if (currentStatus === 'connected') {
    logger.info('[NetworkMonitor] Already connected on init, flushing queue...');
    flushQueue(
      (tempId, serverMessage) => {
        const channelId = serverMessage.channelId?._id || serverMessage.channelId;
        reconcileMessageInCache(channelId, tempId, serverMessage);
        updateMessageStatusLocalInCache(channelId, tempId, 'sent');
      },
      (tempId, error) => {
        const store = useChatStore.getState();
        store.markMessageFailed(tempId, error);
      }
    ).catch((err) => {
      logger.error('[NetworkMonitor] Initial queue flush error:', err);
    });
  }
};

/**
 * Manually trigger a queue flush (e.g., from a pull-to-refresh or manual retry button).
 */
export const triggerQueueFlush = async () => {
  const store = useChatStore.getState();
  if (store.connectionStatus !== 'connected') {
    logger.warn('[NetworkMonitor] Cannot flush queue: not connected');
    return { sent: 0, failed: 0 };
  }

  logger.info('[NetworkMonitor] Manual queue flush triggered');
  return flushQueue(
    (tempId, serverMessage) => {
      const channelId = serverMessage.channelId?._id || serverMessage.channelId;
      reconcileMessageInCache(channelId, tempId, serverMessage);
      updateMessageStatusLocalInCache(channelId, tempId, 'sent');
    },
    (tempId, error) => {
      const s = useChatStore.getState();
      s.markMessageFailed(tempId, error);
    }
  );
};

/**
 * Cleanup the network monitor subscription.
 */
export const destroyNetworkMonitor = () => {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  isInitialized = false;
  logger.info('[NetworkMonitor] Destroyed');
};