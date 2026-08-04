export const createMessagesSlice = (set, get) => ({
  messagesByChannel: {},
  hasMore: {},
  isLoadingMessages: false,

  setMessages: (channelId, messages) => set((state) => ({
    messagesByChannel: {
      ...state.messagesByChannel,
      [channelId]: messages,
    }
  })),

  addMessage: (message) => {
    const { channelId } = message;
    if (!channelId) return;
    set((state) => {
      const existing = state.messagesByChannel[channelId] || [];
      if (existing.some(m => m._id === message._id)) return state;
      const updated = [...existing, message].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      );
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: updated,
        }
      };
    });
  },

  reconcileMessage: (tempId, serverMessage) => {
    const { channelId } = serverMessage;
    if (!channelId) return;
    set((state) => {
      const messages = state.messagesByChannel[channelId] || [];
      const alreadyHas = messages.some(m => m._id === serverMessage._id);
      let updated;
      if (alreadyHas) {
        updated = messages.filter(m => m._id !== tempId);
      } else {
        updated = messages.map(m =>
          m._id === tempId ? { ...serverMessage, pending: false } : m
        );
      }
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: updated
        }
      };
    });
  },

  updateMessage: (message) => {
    const { channelId, _id } = message;
    if (!channelId || !_id) return;
    set((state) => {
      const msgs = state.messagesByChannel[channelId] || [];
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: msgs.map(m => m._id === _id ? { ...m, ...message } : m)
        }
      };
    });
  },

  softDeleteMessage: (messageId, channelId) => {
    set((state) => ({
      messagesByChannel: {
        ...state.messagesByChannel,
        [channelId]: (state.messagesByChannel[channelId] || []).map(m =>
          m._id === messageId ? { ...m, isDeleted: true, content: 'This message was deleted' } : m
        )
      }
    }));
  },

  removeMessage: (messageId, channelId) => {
    set((state) => ({
      messagesByChannel: {
        ...state.messagesByChannel,
        [channelId]: (state.messagesByChannel[channelId] || []).filter(m => m._id !== messageId)
      }
    }));
  }
});
