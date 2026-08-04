export const createReceiptsSlice = (set, get) => ({
  deliveryReceipts: {}, // { [messageId]: [ { userId, name, avatar, deliveredAt } ] }
  readReceipts: {},     // { [messageId]: [ { userId, name, avatar, readAt } ] }
  pendingReceipts: {},  // { [messageId]: [ { userId, name, avatar } ] }
  messageStatus: {},    // { [messageId]: 'pending' | 'sending' | 'sent' | 'delivered' | 'seen' | 'failed' }

  updateMessageStatus: (messageId, status, timestamps = {}) => {
    set((state) => {
      const messagesByChannel = { ...state.messagesByChannel };
      let found = false;
      
      for (const channelId of Object.keys(messagesByChannel)) {
        const list = messagesByChannel[channelId] || [];
        const idx = list.findIndex(m => m._id === messageId);
        if (idx !== -1) {
          const updatedList = [...list];
          updatedList[idx] = {
            ...updatedList[idx],
            status,
            ...timestamps,
          };
          messagesByChannel[channelId] = updatedList;
          found = true;
          break;
        }
      }

      return {
        messageStatus: {
          ...state.messageStatus,
          [messageId]: status,
        },
        ...(found ? { messagesByChannel } : {}),
      };
    });
  },

  addDeliveryReceipt: (messageId, receipt) => {
    set((state) => {
      const existing = state.deliveryReceipts[messageId] || [];
      if (existing.some(r => r.userId === receipt.userId)) return state;

      // If already read, do not add to delivery
      const existingRead = state.readReceipts[messageId] || [];
      if (existingRead.some(r => r.userId === receipt.userId)) return state;

      // If added to delivery, remove from pending
      const existingPending = state.pendingReceipts[messageId] || [];
      const updatedPending = existingPending.filter(r => r.userId !== receipt.userId);

      return {
        deliveryReceipts: {
          ...state.deliveryReceipts,
          [messageId]: [...existing, receipt],
        },
        pendingReceipts: {
          ...state.pendingReceipts,
          [messageId]: updatedPending,
        }
      };
    });
  },

  addReadReceipt: (messageId, receipt) => {
    set((state) => {
      const existingRead = state.readReceipts[messageId] || [];
      const updatedRead = existingRead.some(r => r.userId === receipt.userId)
        ? existingRead
        : [...existingRead, receipt];

      const existingDelivered = state.deliveryReceipts[messageId] || [];
      const updatedDelivered = existingDelivered.filter(r => r.userId !== receipt.userId);

      const existingPending = state.pendingReceipts[messageId] || [];
      const updatedPending = existingPending.filter(r => r.userId !== receipt.userId);

      return {
        readReceipts: {
          ...state.readReceipts,
          [messageId]: updatedRead,
        },
        deliveryReceipts: {
          ...state.deliveryReceipts,
          [messageId]: updatedDelivered,
        },
        pendingReceipts: {
          ...state.pendingReceipts,
          [messageId]: updatedPending,
        }
      };
    });
  },

  setMessageReceipts: (messageId, { deliveredTo, readBy, pending }) => {
    set((state) => ({
      deliveryReceipts: {
        ...state.deliveryReceipts,
        [messageId]: deliveredTo || [],
      },
      readReceipts: {
        ...state.readReceipts,
        [messageId]: readBy || [],
      },
      pendingReceipts: {
        ...state.pendingReceipts,
        [messageId]: pending || [],
      }
    }));
  }
});
