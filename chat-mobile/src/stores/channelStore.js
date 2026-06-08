import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { channelAPI, usersAPI } from '../services/api';

export const useChannelStore = create(
  persist(
    (set, get) => ({
      channels: [],
      activeChannelId: null,
      unreads: {},
      membersByChannel: {},
      isLoading: false,

      fetchChannels: async () => {
        set({ isLoading: true });
        try {
          const { data } = await channelAPI.list();
          set({ channels: data.data.channels, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          console.error('Failed to fetch channels:', error);
        }
      },

      setActiveChannel: (channelId) => {
        set({ activeChannelId: channelId });
        if (channelId) {
          // Mark as read (REST fallback)
          // api.post(`/channels/${channelId}/read`).catch(() => {});
          set((state) => ({
            unreads: { ...state.unreads, [channelId]: 0 },
          }));
        }
      },

      addChannel: (channel) => {
        set((state) => {
          if (state.channels.some((c) => c._id === channel._id)) return state;
          return { channels: [...state.channels, channel] };
        });
      },

      removeChannel: (channelId) => {
        set((state) => ({
          channels: state.channels.filter((c) => c._id !== channelId),
          activeChannelId: state.activeChannelId === channelId ? null : state.activeChannelId,
        }));
      },

      updateChannel: (channelId, updates) => {
        set((state) => ({
          channels: state.channels.map((c) =>
            c._id === channelId ? { ...c, ...updates } : c,
          ),
        }));
      },

      updateUnread: (channelId, count) => {
        set((state) => ({
          unreads: { ...state.unreads, [channelId]: count },
        }));
      },

      handleNewMessage: (message) => {
        const { channelId, content, createdAt } = message;
        if (!channelId) return;

        const rawText = (content || '').replace(/<[^>]*>/g, '').trim();
        const preview = rawText.length > 50 ? rawText.substring(0, 50) + '...' : rawText;
        const timestamp = createdAt || new Date().toISOString();

        set((state) => {
          const isActive = channelId === state.activeChannelId;
          const channels = state.channels.map((c) =>
            c._id === channelId
              ? { ...c, lastMessageAt: timestamp, lastMessagePreview: preview }
              : c
          );

          const unreads = isActive
            ? state.unreads
            : { ...state.unreads, [channelId]: (state.unreads[channelId] || 0) + 1 };

          return { channels, unreads };
        });
      },

      fetchMembers: async (channelId) => {
        try {
          const { data } = await usersAPI.getChannelMembers(channelId);
          const members = data.data?.members || data.data || [];
          set((state) => ({
            membersByChannel: {
              ...state.membersByChannel,
              [channelId]: members,
            },
          }));
        } catch (error) {
          console.error('Failed to fetch channel members:', error);
        }
      },
    }),
    {
      name: 'flowtask-channel-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ 
        activeChannelId: state.activeChannelId,
        unreads: state.unreads 
      }),
    }
  )
);
