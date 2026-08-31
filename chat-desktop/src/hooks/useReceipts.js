import { useEffect, useState } from 'react';
import { useChatStore } from '../stores/chatStore';
import { messageAPI } from '../services/api';
import logger from '../utils/logger';

const EMPTY_ARRAY = [];

export const useReceipts = (channelId, messageId) => {
  const [loading, setLoading] = useState(false);
  const deliveredTo = useChatStore((state) => state.deliveryReceipts[messageId] || EMPTY_ARRAY);
  const readBy = useChatStore((state) => state.readReceipts[messageId] || EMPTY_ARRAY);
  const pending = useChatStore((state) => state.pendingReceipts[messageId] || EMPTY_ARRAY);

  useEffect(() => {
    if (messageId && channelId) {
      setLoading(true);
      messageAPI
        .getInfo(messageId, channelId)
        .then(({ data }) => {
          const info = data.data;
          useChatStore.getState().setMessageReceipts(messageId, {
            deliveredTo: info.deliveredTo || [],
            readBy: info.readBy || [],
            pending: info.pending || [],
          });
        })
        .catch((err) => {
          logger.error(`[useReceipts] Failed to fetch receipts for message ${messageId}:`, err);
        })
        .finally(() => setLoading(false));
    }
  }, [channelId, messageId]);

  return {
    deliveredTo,
    readBy,
    pending,
    loading,
  };
};

export default useReceipts;
