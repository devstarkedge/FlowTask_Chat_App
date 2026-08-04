import { useEffect, useState } from 'react';
import { useChatStore } from '../store';
import ReceiptService from '../services/ReceiptService';

const EMPTY_ARRAY = [];

export const useReceipts = (channelId, messageId) => {
  const [loading, setLoading] = useState(false);
  const deliveredTo = useChatStore((state) => state.deliveryReceipts[messageId] || EMPTY_ARRAY);
  const readBy = useChatStore((state) => state.readReceipts[messageId] || EMPTY_ARRAY);
  const pending = useChatStore((state) => state.pendingReceipts[messageId] || EMPTY_ARRAY);

  useEffect(() => {
    if (messageId && channelId) {
      setLoading(true);
      ReceiptService.fetchMessageReceipts(channelId, messageId)
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
