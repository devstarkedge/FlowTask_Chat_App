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
      channels: [],
      activeChannelId: null,
      unreads: {},
      membersByChannel: {},
      categories: [],
      starredIds: [],
      pinnedIds: [],
      isLoading: false,

      fetchChannels: async (options = {}) => {
        const silent = options?.silent === true;
        if (!resolveWorkspaceId()) {
          logger.warn('[ChannelStore] Skipping fetchChannels — no active workspace');
          return;
        }
        if (!silent) set({ isLoading: true });
        try {
          const { data } = await channelAPI.list();
          const channels = data.data.channels;
          // Extract starred/pinned from channel flags if server provides them
          const starredIds = channels.filter(c => c.isStarred || c.starred).map(c => c._id);
          const pinnedIds = channels.filter(c => c.isPinned || c.pinned).map(c => c._id);
          set({ channels, starredIds, pinnedIds, isLoading: false });

          get().fetchCategories();

          // ── Join channel rooms AFTER channels are loaded ──────────────────
          // The socket connect handler runs before fetchChannels resolves, so channels
          // is always [] at connect time. We must join rooms here so the mobile app
          // receives channel:updated events (which carry lastMessagePreview from server).
          try {
            const socket = getSocket();
            if (socket && socket.connected) {
              channels.forEach(ch => {
                const cid = ch._id?.toString ? ch._id.toString() : ch._id;
                if (cid) socket.emit('channel:join', cid);
              });
            }
          } catch (socketErr) {
            logger.warn('[ChannelStore] Failed to join channel rooms after fetch:', socketErr);
          }

          get().fetchUnreads();
        } catch (error) {
          set({ isLoading: false });
          logger.error('Failed to fetch channels:', error);
        }
      },
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

          set((state) => {
            // Merge fresh lastMessagePreview/lastMessageAt into channels where available
            const updatedChannels =
              Object.keys(channelUpdates).length > 0
                ? state.channels.map((c) => {
                    const cid = c._id?.toString ? c._id.toString() : c._id;
                    return channelUpdates[cid]
                      ? { ...c, ...channelUpdates[cid] }
                      : c;
                  })
                : state.channels;

            return { unreads, channels: updatedChannels };
          });
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
        const cid = channelId != null
          ? (channelId?.toString ? channelId.toString() : String(channelId))
          : null;
        set({ activeChannelId: cid });
        if (cid) {
          get().markAsRead(cid);
        }
      },

      addChannel: (channel) => {
        const newCid = channel._id?.toString ? channel._id.toString() : channel._id;
        set((state) => {
          if (state.channels.some((c) => {
            const cId = c._id?.toString ? c._id.toString() : c._id;
            return cId === newCid;
          })) return state;
          return { channels: [...state.channels, channel] };
        });
      },

      removeChannel: (channelId) => {
        const cidStr = channelId?.toString ? channelId.toString() : channelId;
        set((state) => ({
          channels: state.channels.filter((c) => {
            const cId = c._id?.toString ? c._id.toString() : c._id;
            return cId !== cidStr;
          }),
          activeChannelId: (() => {
            const activeStr = state.activeChannelId?.toString ? state.activeChannelId.toString() : state.activeChannelId;
            return activeStr === cidStr ? null : state.activeChannelId;
          })(),
        }));
      },

      updateChannel: (channelId, updates) => {
        // Normalise to string so ObjectId !== string mismatches never cause silent failures
        const cidStr = channelId?.toString ? channelId.toString() : channelId;
        set((state) => ({
          channels: state.channels.map((c) => {
            const cId = c._id?.toString ? c._id.toString() : c._id;
            return cId === cidStr ? { ...c, ...updates } : c;
          }),
        }));
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

        // Preview-only update (mirrors web). Unread increments are handled by UnreadManager.
        const channelIdStr = channelId?.toString ? channelId.toString() : channelId;
        const rawText = (content || '').replace(/<[^>]*>/g, '').trim();
        const preview = rawText.length > 80 ? rawText.substring(0, 80) + '\u2026' : rawText;
        const timestamp = createdAt || new Date().toISOString();

        set((state) => {
          const cIndex = state.channels.findIndex(c => (c._id?.toString ? c._id.toString() : c._id) === channelIdStr);
          if (cIndex === -1) return state;

          const oldChannel = state.channels[cIndex];
          const newTime = new Date(timestamp).getTime();
          const oldTime = new Date(oldChannel.lastMessageAt || 0).getTime();

          if (oldTime >= newTime) return state;

          const updatedChannel = { ...oldChannel, lastMessageAt: timestamp, lastMessagePreview: preview };
          const newChannels = [...state.channels];
          newChannels.splice(cIndex, 1);

          let insertIdx = 0;
          while (insertIdx < newChannels.length) {
            const time = new Date(newChannels[insertIdx].lastMessageAt || 0).getTime();
            if (newTime >= time) break;
            insertIdx++;
          }
          
          newChannels.splice(insertIdx, 0, updatedChannel);
          return { channels: newChannels };
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
 
       

        
      // Update a single member's online status across all cached channel member lists.
      // Called by socket presence events so the chat header avatar reflects live status.
      updateMemberPresence: (userId, onlineStatus) => {
        set((state) => {
          const channelUpdates = {};
          for (const [chId, members] of Object.entries(state.membersByChannel)) {
            const hasUser = members.some(
              (m) => m._id === userId || m.userId?._id === userId
            );
            if (hasUser) {
              channelUpdates[chId] = members.map((m) =>
                m._id === userId || m.userId?._id === userId
                  ? { ...m, onlineStatus }
                  : m
              );
            }
          }
          if (Object.keys(channelUpdates).length === 0) return state;
          return {
            membersByChannel: { ...state.membersByChannel, ...channelUpdates },
          };
        });
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
        channels: state.channels,
        categories: state.categories,
        membersByChannel: state.membersByChannel,
      }),
    }
  )
);
