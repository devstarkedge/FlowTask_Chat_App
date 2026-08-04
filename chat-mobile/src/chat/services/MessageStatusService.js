import { useChatStore } from '../store';
import { getSocket } from '../services/SocketManager';
import api from '../../services/api';
import logger from '../../utils/logger';

class MessageStatusService {
  async markAsRead(channelId, messageId) {
    const store = useChatStore.getState();
    try {
      store.updateMessageStatus(messageId, 'seen');
      
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('message:read', { channelId, messageId });
      }

      await api.post(`/channels/${channelId}/messages/${messageId}/mark-read`);
    } catch (error) {
      logger.error(`[MessageStatusService] Failed to mark message ${messageId} as read:`, error);
    }
  }

  async markAsDelivered(channelId, messageId) {
    const store = useChatStore.getState();
    try {
      store.updateMessageStatus(messageId, 'delivered');
      
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('message:delivered', { channelId, messageId });
      }
    } catch (error) {
      logger.error(`[MessageStatusService] Failed to mark message ${messageId} as delivered:`, error);
    }
  }

  updateLocalStatus(messageId, status) {
    useChatStore.getState().updateMessageStatus(messageId, status);
  }
}

export default new MessageStatusService();
