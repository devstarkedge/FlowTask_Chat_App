import { useChatStore } from '../store';
import api from '../../services/api';
import logger from '../../utils/logger';

class ReceiptService {
  async fetchMessageReceipts(channelId, messageId) {
    const store = useChatStore.getState();
    try {
      const { data } = await api.get(`/messages/${messageId}/info`, { params: { channelId } });
      const info = data.data;

      store.setMessageReceipts(messageId, {
        deliveredTo: info.deliveredTo || [],
        readBy: info.readBy || [],
        pending: info.pending || [],
      });
      return info;
    } catch (error) {
      logger.error(`[ReceiptService] Failed to fetch receipts for message ${messageId}:`, error);
      throw error;
    }
  }

  handleDeliveryReceipt(messageId, receipt) {
    useChatStore.getState().addDeliveryReceipt(messageId, receipt);
  }

  handleReadReceipt(messageId, receipt) {
    useChatStore.getState().addReadReceipt(messageId, receipt);
  }
}

export default new ReceiptService();
