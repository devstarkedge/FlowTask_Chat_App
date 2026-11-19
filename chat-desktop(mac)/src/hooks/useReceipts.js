import { useEffect, useState, useRef } from 'react';
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
  const debounceTimerRef = useRef(null);

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

    // Initial fetch with loading indicator
    fetchReceipts(true);

    const scheduleFetch = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        if (!cancelled) fetchReceipts(false);
      }, 100);
    };

    const socket = getSocket();

    const refreshForReceipt = (event) => {
      const eventChannelId = event?.channelId?._id || event?.channelId;
      const eventMessageId = event?.messageId?._id || event?.messageId;
      if (
        (!eventChannelId || String(eventChannelId) === String(channelId)) &&
        String(eventMessageId) === String(messageId)
      ) {
        scheduleFetch();
      }
    };

    const refreshForStatus = (event) => {
      const eventChannelId = event?.channelId?._id || event?.channelId;
      if (eventChannelId && String(eventChannelId) !== String(channelId)) return;

      const singleId = event?.messageId?._id || event?.messageId;
      const matchSingle = singleId && String(singleId) === String(messageId);
      const matchBatch =
        Array.isArray(event?.messageIds) &&
        event.messageIds.some((id) => String(id?._id || id) === String(messageId));

      if (matchSingle || matchBatch) {
        scheduleFetch();
      }
    };

    socket?.on('message:read', refreshForReceipt);
    socket?.on('message:delivered', refreshForReceipt);
    socket?.on('message:status', refreshForStatus);

    return () => {
      cancelled = true;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      socket?.off('message:read', refreshForReceipt);
      socket?.off('message:delivered', refreshForReceipt);
      socket?.off('message:status', refreshForStatus);
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
