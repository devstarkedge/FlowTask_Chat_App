import { useEffect, useState } from 'react';
import { useChatStore } from '../stores/chatStore';
import { messageAPI } from '../services/api';
import { getSocket } from '../services/socket';
import logger from '../utils/logger';

const EMPTY_ARRAY = [];

export const useReceipts = (channelId, messageId) => {
  const [loading, setLoading] = useState(false);
  const deliveredTo = useChatStore((state) => state.deliveryReceipts[messageId] || EMPTY_ARRAY);
  const readBy = useChatStore((state) => state.readReceipts[messageId] || EMPTY_ARRAY);
  const pending = useChatStore((state) => state.pendingReceipts[messageId] || EMPTY_ARRAY);

  useEffect(() => {
    if (!messageId || !channelId) return;
    let cancelled = false;
    const fetchReceipts = (showLoading = false) => {
      if (showLoading) setLoading(true);
      messageAPI
        .getInfo(messageId, channelId)
        .then(({ data }) => {
          if (cancelled) return;
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
        .finally(() => {
          if (showLoading && !cancelled) setLoading(false);
        });
    };

    fetchReceipts(true);
    const socket = getSocket();
    const refreshForReceipt = (event) => {
      const eventChannelId = event?.channelId?._id || event?.channelId;
      const eventMessageId = event?.messageId?._id || event?.messageId;
      if (String(eventChannelId) === String(channelId) && String(eventMessageId) === String(messageId)) {
        fetchReceipts();
      }
    };
    socket?.on('message:read', refreshForReceipt);
    socket?.on('message:delivered', refreshForReceipt);
    return () => {
      cancelled = true;
      socket?.off('message:read', refreshForReceipt);
      socket?.off('message:delivered', refreshForReceipt);
    };
  }, [channelId, messageId]);

  return {
    deliveredTo,
    readBy,
    pending,
    loading,
  };
};

export default useReceipts;
