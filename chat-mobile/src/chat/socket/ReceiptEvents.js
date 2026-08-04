import { useChatStore } from '../store';
import ReceiptService from '../services/ReceiptService';
import logger from '../../utils/logger';

export default (socket) => {
  socket.on('message:delivered', ({ messageId, channelId, userId, deliveredAt }) => {
    logger.info('[SocketReceipt] message:delivered received for', messageId);
    ReceiptService.handleDeliveryReceipt(messageId, { userId, deliveredAt });
    useChatStore.getState().updateMessageStatus(messageId, 'delivered', { deliveredAt });
  });

  socket.on('message:read', ({ messageId, channelId, userId, readAt }) => {
    logger.info('[SocketReceipt] message:read received for', messageId);
    ReceiptService.handleReadReceipt(messageId, { userId, readAt });
    useChatStore.getState().updateMessageStatus(messageId, 'seen', { seenAt: readAt });
  });
};
