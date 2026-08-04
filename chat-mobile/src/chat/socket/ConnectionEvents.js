import { useChatStore } from '../store';
import SyncService from '../services/SyncService';
import logger from '../../utils/logger';

export default (socket) => {
  socket.on('connect', () => {
    logger.info('[SocketConnection] Connected to server');
    const store = useChatStore.getState();
    store.setConnectionStatus('connected');
    store.setOnlineStatus(true);
    
    // Trigger Sync Sequence on Reconnect
    SyncService.performFullSync();
  });

  socket.on('disconnect', (reason) => {
    logger.info('[SocketConnection] Disconnected:', reason);
    const store = useChatStore.getState();
    store.setConnectionStatus('disconnected');
    store.setOnlineStatus(false);
  });

  socket.on('connect_error', (error) => {
    logger.error('[SocketConnection] Connection error:', error.message);
    const store = useChatStore.getState();
    store.setConnectionStatus('disconnected');
  });
};
