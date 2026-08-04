import AsyncStorage from '@react-native-async-storage/async-storage';
import { useChatStore } from '../store';
import api from '../../services/api';
import { retryWithBackoff } from '../utils/retry';
import logger from '../../utils/logger';

const QUEUE_STORAGE_KEY = '@chat_offline_queue';

class OfflineQueueService {
  async init() {
    try {
      const stored = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      if (stored) {
        const queue = JSON.parse(stored);
        useChatStore.getState().setOfflineQueue(queue);
      }
    } catch (error) {
      logger.error('[OfflineQueueService] Failed to load offline queue:', error);
    }
  }

  async enqueue(message, channelId, sendPayload) {
    const entry = {
      clientMessageId: message.clientMessageId || message._id,
      channelId,
      payload: sendPayload,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    useChatStore.getState().addToOfflineQueue(entry);
    await this._persist();
  }

  async dequeue(clientMessageId) {
    useChatStore.getState().removeFromOfflineQueue(clientMessageId);
    await this._persist();
  }

  async flush() {
    const store = useChatStore.getState();
    const queue = [...store.offlineQueue];

    if (queue.length === 0 || store.isSyncing) return;

    store.setSyncStatus(true);
    logger.info(`[OfflineQueueService] Flushing ${queue.length} offline messages`);

    // Sort by date to maintain FIFO order
    queue.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    for (const entry of queue) {
      try {
        store.updateQueueStatus(entry.clientMessageId, 'sending');
        
        // Use retry utility to attempt sending the message
        await retryWithBackoff(async () => {
          const { data } = await api.post(`/channels/${entry.channelId}/messages`, entry.payload);
          const serverMessage = data.data?.message || data.data;
          
          store.reconcileMessage(entry.clientMessageId, serverMessage);
          store.updateQueueStatus(entry.clientMessageId, 'sent');
        }, 3, 1000);

        await this.dequeue(entry.clientMessageId);
      } catch (error) {
        logger.error(`[OfflineQueueService] Failed to flush message ${entry.clientMessageId}:`, error);
        store.updateQueueStatus(entry.clientMessageId, 'failed');
        
        // Stop queue processing on network error to preserve order
        if (!error.response || error.code === 'ERR_NETWORK') {
          break;
        }
      }
    }
    store.setSyncStatus(false);
  }

  async _persist() {
    try {
      const queue = useChatStore.getState().offlineQueue;
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    } catch (error) {
      logger.error('[OfflineQueueService] Failed to persist offline queue:', error);
    }
  }
}

export default new OfflineQueueService();
