/**
 * Offline Message Queue
 *
 * Persists pending messages to AsyncStorage so they survive app restarts.
 * Automatically flushes (sends) queued messages in FIFO order when connectivity
 * is restored. Prevents duplicate sends via a dedup mechanism.
 *
 * Status flow: pending -> sent -> delivered -> seen
 */
import storage from './storage';
import api from './api';
import logger from '../utils/logger';

const QUEUE_KEY = 'offline_message_queue';
const SENT_IDS_KEY = 'offline_sent_temp_ids';  

/**
 * Load the persisted queue from AsyncStorage.
 * @returns {Promise<Array>}
 */
const loadQueue = async () => {
  try {
    const raw = await storage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    logger.error('[OfflineQueue] Failed to load queue:', err);
    return [];
  }
};

/**
 * Persist the queue to AsyncStorage.
 * @param {Array} queue
 */
const saveQueue = async (queue) => {
  try {
    await storage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    logger.error('[OfflineQueue] Failed to save queue:', err);
  }
};

/**
 * Load the set of temp IDs that have already been sent (dedup).
 * @returns {Promise<Set<string>>}
 */
const loadSentIds = async () => {
  try {
    const raw = await storage.getItem(SENT_IDS_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (err) {
    logger.error('[OfflineQueue] Failed to load sent IDs:', err);
    return new Set();
  }
};

/**
 * Persist the sent IDs set.
 * @param {Set<string>} sentIds
 */
const saveSentIds = async (sentIds) => {
  try {
    await storage.setItem(SENT_IDS_KEY, JSON.stringify([...sentIds]));
  } catch (err) {
    logger.error('[OfflineQueue] Failed to save sent IDs:', err);
  }
};

/**
 * Enqueue a message for later sending.
 * @param {Object} message - The optimistic message object with tempId
 * @param {string} channelId
 * @param {Object} sendPayload - The payload to POST to the server
 */
export const enqueueMessage = async (message, channelId, sendPayload) => {
  const queue = await loadQueue();
  // Prevent duplicate enqueue
  if (queue.some((m) => m.tempId === message._id)) {
    logger.warn('[OfflineQueue] Message already queued, skipping:', message._id);
    return;
  }
  queue.push({
    tempId: message._id,
    channelId,
    sendPayload,
    createdAt: message.createdAt,
    retryCount: 0,
    lastError: null,
  });
  await saveQueue(queue);
  logger.info(`[OfflineQueue] Enqueued message ${message._id} (queue size: ${queue.length})`);
};

/**
 * Remove a message from the queue by tempId.
 * @param {string} tempId
 */
export const dequeueMessage = async (tempId) => {
  const queue = await loadQueue();
  const filtered = queue.filter((m) => m.tempId !== tempId);
  if (filtered.length !== queue.length) {
    await saveQueue(filtered);
    logger.info(`[OfflineQueue] Dequeued message ${tempId}`);
  }
};

/**
 * Get the current queue length.
 * @returns {Promise<number>}
 */
export const getQueueLength = async () => {
  const queue = await loadQueue();
  return queue.length;
};

/**
 * Get all queued messages.
 * @returns {Promise<Array>}
 */
export const getQueuedMessages = async () => {
  return loadQueue();
};

/**
 * Flush (send) all queued messages in FIFO order.
 * Uses a dedup set to prevent sending the same message twice.
 *
 * @param {Function} onMessageSent - Callback invoked for each successfully sent message:
 *   (tempId, serverMessage) => void
 * @param {Function} onMessageFailed - Callback invoked for each permanently failed message:
 *   (tempId, error) => void
 * @param {Function} getReconcileFn - Optional: returns a reconcile function for the store
 * @returns {Promise<{sent: number, failed: number}>}
 */
export const flushQueue = async (onMessageSent, onMessageFailed) => {
  const queue = await loadQueue();
  if (queue.length === 0) return { sent: 0, failed: 0 };

  const sentIds = await loadSentIds();
  let sent = 0;
  let failed = 0;
  const remaining = [];

  // Sort by createdAt to preserve original order
  queue.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  for (const entry of queue) {
    // Dedup: skip if this tempId was already sent
    if (sentIds.has(entry.tempId)) {
      logger.info(`[OfflineQueue] Skipping already-sent message ${entry.tempId}`);
      continue;
    }

    try {
      const { data } = await api.post(
        `/channels/${entry.channelId}/messages`,
        entry.sendPayload
      );
      const serverMessage = data.data?.message || data.data;

      // Mark as sent in dedup set
      sentIds.add(entry.tempId);
      await saveSentIds(sentIds);

      // Notify caller
      if (onMessageSent) {
        onMessageSent(entry.tempId, serverMessage);
      }

      sent++;
      logger.info(`[OfflineQueue] Flushed message ${entry.tempId}`);
    } catch (error) {
      const isNetworkError =
        !error.response ||
        error.code === 'ECONNABORTED' ||
        error.code === 'ERR_NETWORK' ||
        error.message?.includes('Network') ||
        error.message?.includes('timeout');

      if (isNetworkError) {
        // Network error — stop flushing and keep remaining in queue
        logger.warn(
          `[OfflineQueue] Network error on ${entry.tempId}, stopping flush. ${remaining.length + 1} messages remain.`
        );
        remaining.push({ ...entry, retryCount: entry.retryCount + 1, lastError: error.message });
        // Also keep the rest of the queue
        for (let j = queue.indexOf(entry) + 1; j < queue.length; j++) {
          remaining.push(queue[j]);
        }
        break;
      }

      // Server-side error (non-network) — increment retry count
      const newRetryCount = (entry.retryCount || 0) + 1;
      if (newRetryCount >= 5) {
        // Max retries exceeded — mark as permanently failed
        logger.error(
          `[OfflineQueue] Message ${entry.tempId} permanently failed after ${newRetryCount} retries:`,
          error.response?.data || error.message
        );
        if (onMessageFailed) {
          onMessageFailed(entry.tempId, error);
        }
        failed++;
        // Remove from sentIds so it can be retried manually
        sentIds.delete(entry.tempId);
        await saveSentIds(sentIds);
      } else {
        // Keep in queue for retry
        remaining.push({ ...entry, retryCount: newRetryCount, lastError: error.message });
        logger.warn(
          `[OfflineQueue] Server error on ${entry.tempId}, will retry (${newRetryCount}/5):`,
          error.response?.data?.error?.message || error.message
        );
      }
    }
  }

  // Save remaining queue and sent IDs
  await saveQueue(remaining);
  await saveSentIds(sentIds);

  logger.info(`[OfflineQueue] Flush complete: ${sent} sent, ${failed} failed, ${remaining.length} remaining`);
  return { sent, failed };
};

/**
 * Clear the entire queue and sent IDs set.
 */
export const clearQueue = async () => {
  await storage.removeItem(QUEUE_KEY);
  await storage.removeItem(SENT_IDS_KEY);
  logger.info('[OfflineQueue] Queue cleared');
};

/**
 * Remove a specific temp ID from the sent IDs set (for manual retry).
 * @param {string} tempId
 */
export const removeSentId = async (tempId) => {
  const sentIds = await loadSentIds();
  sentIds.delete(tempId);
  await saveSentIds(sentIds);
};