import { useChatStore } from '../store';
import OfflineQueueService from './OfflineQueueService';
import SocketManager from './SocketManager';
import logger from '../../utils/logger';

class SyncService {
  async performFullSync() {
    const store = useChatStore.getState();
    if (store.isSyncing) return;
    
    store.setSyncStatus(true);
    logger.info('[SyncService] Starting sync sequence on reconnect...');

    try {
      // 1. Ensure Socket is Authenticated
      const socket = SocketManager.getSocket();
      if (!socket || !socket.connected) {
        await SocketManager.connect();
      }

      // 2. Flush Offline Queue
      await OfflineQueueService.flush();

      // 3. Trigger Store Status Cleanups / Refresh
      logger.info('[SyncService] Synchronization sequence completed successfully');
    } catch (error) {
      logger.error('[SyncService] Sync sequence failed:', error);
    } finally {
      store.setSyncStatus(false);
    }
  }
}

export default new SyncService();
