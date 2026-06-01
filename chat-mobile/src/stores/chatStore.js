import { create } from 'zustand';
import { useAuthStore } from './authStore';
import { useChannelStore } from './channelStore';
import api from '../services/api';

export const useChatStore = create((set, get) => ({
  messagesByChannel: {},
  hasMore: {},
  isLoadingMessages: false,
  connectionStatus: 'disconnected',

  fetchMessages: async (channelId, cursor = null) => {
    set({ isLoadingMessages: true });
    try {
      const params = cursor ? { cursor } : {};
      const { data } = await api.get(`/channels/${channelId}/messages`, { params });
      const messages = data.data.items || [];
      const hasMore = data.data.hasMore || false;

      set((state) => {
        const existing = state.messagesByChannel[channelId] || [];
        // Merge and sort
        const merged = cursor 
          ? [...messages, ...existing] 
          : messages;
        
        // Dedup by _id
        const unique = Array.from(new Map(merged.map(m => [m._id, m])).values())
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        return {
          messagesByChannel: {
            ...state.messagesByChannel,
            [channelId]: unique,
          },
          hasMore: { ...state.hasMore, [channelId]: hasMore },
          isLoadingMessages: false,
        };
      });
    } catch (error) {
      set({ isLoadingMessages: false });
      console.error('Failed to fetch messages:', error);
    }
  },

  sendMessage: async (channelId, content) => {
    const user = useAuthStore.getState().user;
    const tempId = `temp-${Date.now()}`;
    
    // Optimistic message
    const optimisticMessage = {
      _id: tempId,
      channelId,
      content,
      authorId: user,
      senderSnapshot: {
        name: user?.name || 'You',
        avatar: user?.avatar || null,
      },
      createdAt: new Date().toISOString(),
      pending: true,
    };

    // Add locally
    get().addMessage(optimisticMessage);
    useChannelStore.getState().handleNewMessage(optimisticMessage);

    try {
      const { data } = await api.post(`/channels/${channelId}/messages`, { content, tempId });
      const serverMessage = data.data.message;
      
      // Reconcile
      get().reconcileMessage(tempId, serverMessage);
      return serverMessage;
    } catch (error) {
      console.error('Failed to send message:', error);
      // Mark as failed
      set((state) => ({
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: (state.messagesByChannel[channelId] || []).map(m => 
            m._id === tempId ? { ...m, pending: false, failed: true } : m
          )
        }
      }));
    }
  },

  addMessage: (message) => {
    const channelId = message.channelId;
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
    const channelId = serverMessage.channelId;
    set((state) => ({
      messagesByChannel: {
        ...state.messagesByChannel,
        [channelId]: (state.messagesByChannel[channelId] || []).map(m => 
          m._id === tempId ? { ...serverMessage, pending: false } : m
        )
      }
    }));
  },

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  // Typing indicators
  typingByChannel: {},
  setTyping: (channelId, userId, name) => {
    set((state) => ({
      typingByChannel: {
        ...state.typingByChannel,
        [channelId]: {
          ...(state.typingByChannel[channelId] || {}),
          [userId]: name
        }
      }
    }));
  },
  clearTyping: (channelId, userId) => {
    set((state) => {
      const typing = { ...(state.typingByChannel[channelId] || {}) };
      delete typing[userId];
      return {
        typingByChannel: {
          ...state.typingByChannel,
          [channelId]: typing
        }
      };
    });
  },
}));
