export const createQueueSlice = (set, get) => ({
  offlineQueue: [], // Array of queued messages
  offlineQueueStatus: {}, // { [clientMessageId]: 'pending' | 'sending' | 'sent' | 'failed' }

  setOfflineQueue: (queue) => set({ offlineQueue: queue }),

  addToOfflineQueue: (entry) => {
    set((state) => {
      if (state.offlineQueue.some(m => m.clientMessageId === entry.clientMessageId)) return state;
      return {
        offlineQueue: [...state.offlineQueue, entry],
        offlineQueueStatus: {
          ...state.offlineQueueStatus,
          [entry.clientMessageId]: 'pending',
        }
      };
    });
  },

  removeFromOfflineQueue: (clientMessageId) => {
    set((state) => ({
      offlineQueue: state.offlineQueue.filter(m => m.clientMessageId !== clientMessageId),
    }));
  },

  updateQueueStatus: (clientMessageId, status) => {
    set((state) => ({
      offlineQueueStatus: {
        ...state.offlineQueueStatus,
        [clientMessageId]: status,
      }
    }));
  }
});
