import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import storage from '../services/storage';
import { channelAPI, usersAPI, readReceiptAPI, categoryAPI, resolveWorkspaceId } from '../services/api';
import { getSocket } from '../services/socket';
import logger from '../utils/logger';
import Toast from 'react-native-toast-message';
// Lazy getter to avoid circular deps (channelStore <- chatStore <- authStore)
const getAuthUser = () => {
  try {
    return require('./authStore').useAuthStore.getState().user;
  } catch {
    return null;
  }
};

export const useChannelStore = create(
  persist(
    (set, get) => ({
      activeChannelId: null,
      unreads: {},
      categories: [],
      starredIds: [],
      pinnedIds: [],
      isLoading: false,

      fetchCategories: async () => {
        try {
          const { data } = await categoryAPI.list();
          set({ categories: data.data || [] });
        } catch (error) {
          logger.error('Failed to fetch categories:', error);
        }
      },

      addCategory: (category) => {
        set((state) => ({ categories: [...state.categories, category] }));
      },

      updateCategory: (category) => {



        const cId = category._id?.toString ? category._id.toString() : category._id;
        set((state) => ({
          categories: state.categories.map(g => {
            const gId = g._id?.toString ? g._id.toString() : g._id;
            return gId === cId ? category : g;
          }),
        }));
      },

      removeCategory: (categoryId) => {
        const cidStr = categoryId?.toString ? categoryId.toString() : categoryId;
        set((state) => ({
          categories: state.categories.filter(g => {
            const gId = g._id?.toString ? g._id.toString() : g._id;
            return gId !== cidStr;
          }),
        }));
      },

      fetchUnreads: async () => {
        try {
          const { data } = await readReceiptAPI.getUnread();
          const unreads = {};
          // Collect channel-level updates from populated channelId objects
          // (mirrors web app behaviour: server populates lastMessageAt + lastMessagePreview
          //  so we can refresh the sidebar preview without a separate API call).
          const channelUpdates = {};

          if (data?.data?.unreads) {
            for (const item of data.data.unreads) {
              const channelObj = item.channelId;
              // channelId may be a string ID or a populated object
              const cid =
                typeof channelObj === 'object' && channelObj !== null
                  ? channelObj._id
                  : channelObj;

              if (!cid) continue;
              const cidStr = cid.toString ? cid.toString() : cid;

              unreads[cidStr] = item.unreadCount || 0;

              // If the server populated the channel document, extract fresh preview data
              if (
                typeof channelObj === 'object' &&
                channelObj !== null &&
                (channelObj.lastMessageAt || channelObj.lastMessagePreview)
              ) {
                channelUpdates[cidStr] = {
                  ...(channelObj.lastMessageAt && { lastMessageAt: channelObj.lastMessageAt }),
                  ...(channelObj.lastMessagePreview !== undefined && {
                    lastMessagePreview: channelObj.lastMessagePreview,
                  }),
                };
              }
            }
          }

          // Update unread counts in the Zustand store
          set({ unreads });

          // Channels are managed by TanStack Query — update the cache directly
          // instead of touching a non-existent state.channels array.
          if (Object.keys(channelUpdates).length > 0) {
            const queryClient = require('../queries/queryClient').queryClient;
            const queryKeys = require('../queries/queryKeys').queryKeys;
            const wid = resolveWorkspaceId();
            if (wid) {
              queryClient.setQueryData(queryKeys.channels(wid), (oldChannels) => {
                if (!Array.isArray(oldChannels)) return oldChannels;
                return oldChannels.map((c) => {
                  const cid = c._id?.toString ? c._id.toString() : c._id;
                  return channelUpdates[cid] ? { ...c, ...channelUpdates[cid] } : c;
                });
              });
            }
          }
        } catch (error) {
          logger.error('Failed to fetch unreads:', error);
        }
      },

      markAsRead: async (channelId, messageId = null) => {
        if (!channelId) return;
        const cid = channelId?.toString ? channelId.toString() : String(channelId);
        try {
          // Reset locally immediately for fast UI
          set((state) => ({
            unreads: { ...state.unreads, [cid]: 0 }
          }));

          // Call REST API
          await readReceiptAPI.markRead(cid, messageId);
          
          // Emit socket seen event (in case it is a DM)
          const socket = getSocket();
          if (socket && socket.connected) {
            socket.emit('dm:markSeen', { channelId: cid });
          }
        } catch (error) {
          logger.error('[ChannelStore] markAsRead error:', error);
        }
      },

      createChannel: async ({ name, visibility = 'public', topic = '', memberIds = [] }) => {
        try {
          const { data } = await channelAPI.create({ name, visibility, topic, memberIds });
          const channel = data.data?.channel || data.data;
          if (channel) {
            const queryClient = require('../queries/queryClient').queryClient;
            const queryKeys = require('../queries/queryKeys').queryKeys;
            const wid = resolveWorkspaceId();
            if (wid) queryClient.invalidateQueries({ queryKey: queryKeys.channels(wid) });
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
            const queryClient = require('../queries/queryClient').queryClient;
            const queryKeys = require('../queries/queryKeys').queryKeys;
            const wid = resolveWorkspaceId();
            if (wid) queryClient.invalidateQueries({ queryKey: queryKeys.channels(wid) });
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
            };
          });
          const queryClient = require('../queries/queryClient').queryClient;
          const queryKeys = require('../queries/queryKeys').queryKeys;
          const wid = resolveWorkspaceId();
          if (wid) queryClient.invalidateQueries({ queryKey: queryKeys.channels(wid) });
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
            };
          });
          const queryClient = require('../queries/queryClient').queryClient;
          const queryKeys = require('../queries/queryKeys').queryKeys;
          const wid = resolveWorkspaceId();
          if (wid) queryClient.invalidateQueries({ queryKey: queryKeys.channels(wid) });
        } catch (error) {
          Toast.show({ type: 'error', text1: 'Failed to update pin' });
        }
      },

      setActiveChannel: (channelId) => {
        const cid = channelId != null
          ? (channelId?.toString ? channelId.toString() : String(channelId))
          : null;
        set({ activeChannelId: cid });
        if (cid) {
          get().markAsRead(cid);
        }
      },

      addChannel: (channel) => {
        const queryClient = require('../queries/queryClient').queryClient;
        const queryKeys = require('../queries/queryKeys').queryKeys;
        const wid = resolveWorkspaceId();
        if (wid) queryClient.invalidateQueries({ queryKey: queryKeys.channels(wid) });
      },

      removeChannel: (channelId) => {
        const cidStr = channelId?.toString ? channelId.toString() : channelId;
        set((state) => ({
          activeChannelId: (() => {
            const activeStr = state.activeChannelId?.toString ? state.activeChannelId.toString() : state.activeChannelId;
            return activeStr === cidStr ? null : state.activeChannelId;
          })(),
        }));
        const queryClient = require('../queries/queryClient').queryClient;
        const queryKeys = require('../queries/queryKeys').queryKeys;
        const wid = resolveWorkspaceId();
        if (wid) queryClient.invalidateQueries({ queryKey: queryKeys.channels(wid) });
      },

      updateChannel: (channelId, updates) => {
        const queryClient = require('../queries/queryClient').queryClient;
        const queryKeys = require('../queries/queryKeys').queryKeys;
        const wid = resolveWorkspaceId();
        if (wid) queryClient.invalidateQueries({ queryKey: queryKeys.channels(wid) });
      },

      updateUnread: (channelId, count) => {
        if (!channelId) return;
        const cid = channelId?.toString ? channelId.toString() : String(channelId);
        set((state) => ({
          unreads: { ...state.unreads, [cid]: count },
        }));
      },

      handleNewMessage: (message) => {
        const { channelId, content, createdAt } = message;
        if (!channelId) return;

        const channelIdStr = channelId?.toString ? channelId.toString() : channelId;
        const rawText = (content || '').replace(/<[^>]*>/g, '').trim();
        const preview = rawText.length > 80 ? rawText.substring(0, 80) + '\u2026' : rawText;
        const timestamp = createdAt || new Date().toISOString();

        const queryClient = require('../queries/queryClient').queryClient;
        const queryKeys = require('../queries/queryKeys').queryKeys;
        const wid = resolveWorkspaceId();
        if (!wid) return;

        queryClient.setQueryData(queryKeys.channels(wid), (oldChannels) => {
          if (!oldChannels) return oldChannels;
          const cIndex = oldChannels.findIndex(c => (c._id?.toString ? c._id.toString() : c._id) === channelIdStr);
          if (cIndex === -1) return oldChannels;

          const oldChannel = oldChannels[cIndex];
          const newTime = new Date(timestamp).getTime();
          const oldTime = new Date(oldChannel.lastMessageAt || 0).getTime();

          if (oldTime >= newTime) return oldChannels;

          const updatedChannel = { ...oldChannel, lastMessageAt: timestamp, lastMessagePreview: preview };
          const newChannels = [...oldChannels];
          newChannels.splice(cIndex, 1);

          let insertIdx = 0;
          while (insertIdx < newChannels.length) {
            const time = new Date(newChannels[insertIdx].lastMessageAt || 0).getTime();
            if (newTime >= time) break;
            insertIdx++;
          }
          
          newChannels.splice(insertIdx, 0, updatedChannel);
          return newChannels;
        });
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
        categories: state.categories,
      }),
    }
  )
);
