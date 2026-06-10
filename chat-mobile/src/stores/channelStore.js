import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import storage from '../services/storage';
import { channelAPI, usersAPI } from '../services/api';
import logger from '../utils/logger';
import Toast from 'react-native-toast-message';

export const useChannelStore = create(
  persist(
    (set, get) => ({
      channels: [],
      activeChannelId: null,
      unreads: {},
      membersByChannel: {},
      starredIds: [],
      pinnedIds: [],
      isLoading: false,

      fetchChannels: async () => {
        set({ isLoading: true });
        try {
          const { data } = await channelAPI.list();
          const channels = data.data.channels;
          // Extract starred/pinned from channel flags if server provides them
          const starredIds = channels.filter(c => c.isStarred || c.starred).map(c => c._id);
          const pinnedIds = channels.filter(c => c.isPinned || c.pinned).map(c => c._id);
          set({ channels, starredIds, pinnedIds, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          logger.error('Failed to fetch channels:', error);
        }
      },

      createChannel: async ({ name, visibility = 'public', topic = '' }) => {
        try {
          const { data } = await channelAPI.create({ name, visibility, topic });
          const channel = data.data?.channel || data.data;
          if (channel) {
            set((state) => ({
              channels: [...state.channels.filter(c => c._id !== channel._id), channel],
            }));
            Toast.show({ type: 'success', text1: `#${name} created` });
            return channel;
          }
        } catch (error) {
          const msg = error.response?.data?.message || error.message || 'Failed to create channel';
          Toast.show({ type: 'error', text1: msg });
          throw error;
        }
      },

      createDM: async (userId) => {
        try {
          const { data } = await channelAPI.createDM(userId);
          const channel = data.data?.channel || data.data;
          if (channel) {
            // Add to channels if not already present
            set((state) => {
              const exists = state.channels.some(c => c._id === channel._id);
              return {
                channels: exists ? state.channels : [...state.channels, channel],
              };
            });
            return channel;
          }
        } catch (error) {
          const msg = error.response?.data?.message || error.message || 'Failed to create DM';
          Toast.show({ type: 'error', text1: msg });
          throw error;
        }
      },

      starChannel: async (channelId) => {
        try {
          await channelAPI.star(channelId);
          set((state) => {
            const isStarred = state.starredIds.includes(channelId);
            return {
              starredIds: isStarred
                ? state.starredIds.filter(id => id !== channelId)
                : [...state.starredIds, channelId],
              channels: state.channels.map(c =>
                c._id === channelId ? { ...c, isStarred: !isStarred } : c
              ),
            };
          });
        } catch (error) {
          Toast.show({ type: 'error', text1: 'Failed to update star' });
        }
      },

      pinChannel: async (channelId) => {
        try {
          await channelAPI.pin(channelId);
          set((state) => {
            const isPinned = state.pinnedIds.includes(channelId);
            return {
              pinnedIds: isPinned
                ? state.pinnedIds.filter(id => id !== channelId)
                : [...state.pinnedIds, channelId],
              channels: state.channels.map(c =>
                c._id === channelId ? { ...c, isPinned: !isPinned } : c
              ),
            };
          });
        } catch (error) {
          Toast.show({ type: 'error', text1: 'Failed to update pin' });
        }
      },

      setActiveChannel: (channelId) => {
        set({ activeChannelId: channelId });
        if (channelId) {
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

          // Sort channels by lastMessageAt descending (most recent first)
          channels.sort((a, b) => {
            const aTime = new Date(a.lastMessageAt || 0).getTime();
            const bTime = new Date(b.lastMessageAt || 0).getTime();
            return bTime - aTime;
          });

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
          logger.error('Failed to fetch channel members:', error);
        }
      },

      getStarredChannels: () => {
        const { channels, starredIds } = get();
        return channels.filter(c => starredIds.includes(c._id));
      },

      getPinnedChannels: () => {
        const { channels, pinnedIds } = get();
        return channels.filter(c => pinnedIds.includes(c._id));
      },
    }),
    {
      name: 'flowtask-channel-storage',
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({ 
        activeChannelId: state.activeChannelId,
        unreads: state.unreads,
        starredIds: state.starredIds,
        pinnedIds: state.pinnedIds,
      }),
    }
  )
);
