import { useChatStore } from '../store';
import OfflineQueueService from '../services/OfflineQueueService';

export const useOfflineQueue = () => {
  const offlineQueue = useChatStore((state) => state.offlineQueue);
  const offlineQueueStatus = useChatStore((state) => state.offlineQueueStatus);
  const isSyncing = useChatStore((state) => state.isSyncing);

  const retrySendMessage = async (clientMessageId) => {
    const entry = offlineQueue.find(m => m.clientMessageId === clientMessageId);
    if (entry) {
      // Re-trigger sending
      await OfflineQueueService.flush();
    }
  };

  const cancelQueuedMessage = async (clientMessageId) => {
    await OfflineQueueService.dequeue(clientMessageId);
  };

  return {
    queue: offlineQueue,
    statusMap: offlineQueueStatus,
    isSyncing,
    retrySendMessage,
    cancelQueuedMessage,
  };
};
export default useOfflineQueue;
