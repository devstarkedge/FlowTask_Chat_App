import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import storage from '../services/storage';
import { threadAPI } from '../services/api';
import { useAuthStore } from './authStore';
import api from '../services/api';
import logger from '../utils/logger';

export const useThreadStore = create(
  persist(
    (set, get) => ({
      threads: [],
      activeThreadId: null,
      unreadThreadCount: 0,
      isLoading: false,

      fetchThreads: async () => {
        set({ isLoading: true });
        try {
          const { data } = await threadAPI.getMyThreads();
          const threads = data.data?.threads || [];
          const unreadCount = threads.filter(t => t.hasUnread).length;
          set({ threads, unreadThreadCount: unreadCount, isLoading: false });
        } catch (error) {
          set({ isLoading: false, threads: [], unreadThreadCount: 0 });
          logger.error('Failed to fetch threads:', error);
        }
      },

      setActiveThread: (threadId) => {
        set({ activeThreadId: threadId });
      },

      addThread: (thread) => {
        set((state) => {
          if (state.threads.some((t) => t._id === thread._id)) return state;
          return { threads: [thread, ...state.threads] };
        });
      },

      updateThread: (threadId, updates) => {
        set((state) => ({
          threads: state.threads.map((t) =>
            t._id === threadId ? { ...t, ...updates } : t
          ),
        }));
      },

      removeThread: (threadId) => {
        set((state) => ({
          threads: state.threads.filter((t) => t._id !== threadId),
          activeThreadId: state.activeThreadId === threadId ? null : state.activeThreadId,
        }));
      },

      markThreadAsRead: (threadId) => {
        set((state) => {
          const threads = state.threads.map((t) =>
            t._id === threadId ? { ...t, hasUnread: false } : t
          );
          const unreadCount = threads.filter(t => t.hasUnread).length;
          return { threads, unreadThreadCount: unreadCount };
        });
      },

      handleNewThreadReply: (reply) => {
        const { threadId } = reply;
        if (!threadId) return;

        set((state) => {
          const isActive = threadId === state.activeThreadId;
          const threads = [...state.threads];
          const threadIndex = threads.findIndex((t) => t._id === threadId);
          
          if (threadIndex > -1) {
            const thread = threads[threadIndex];
            threads[threadIndex] = {
              ...thread,
              replyCount: (thread.replyCount || 0) + 1,
              lastReplyAt: reply.createdAt,
              hasUnread: !isActive,
            };
            
            // Move to top
            const [updatedThread] = threads.splice(threadIndex, 1);
            threads.unshift(updatedThread);
          }

          const unreadCount = threads.filter(t => t.hasUnread).length;
          return { threads, unreadThreadCount: unreadCount };
        });
      },

      resolveThread: async (threadId) => {
        try {
          await threadAPI.resolve(threadId);
          get().updateThread(threadId, { isResolved: true });
        } catch (error) {
          logger.error('Failed to resolve thread:', error);
          throw error;
        }
      },

      unresolveThread: async (threadId) => {
        try {
          await threadAPI.unresolve(threadId);
          get().updateThread(threadId, { isResolved: false });
        } catch (error) {
          logger.error('Failed to unresolve thread:', error);
          throw error;
        }
      },

      clearThreads: () => set({ threads: [], activeThreadId: null, unreadThreadCount: 0 }),

      // ─── Thread Replies ──────────────────────────────────────────────────────
      threadRepliesByRoot: {},
      threadHasMore: {},
      isLoadingReplies: false,

      fetchThreadReplies: async (rootMessageId, cursor = null) => {
        set({ isLoadingReplies: true });
        try {
          // Find the thread ID from threads list
          const thread = get().threads.find(t => t.rootMessageId === rootMessageId || t._id === rootMessageId);
          const threadId = thread?._id || rootMessageId;

          const params = { limit: 50 };
          if (cursor) params.cursor = cursor;

          const { data } = await threadAPI.getReplies(threadId, params);
          const replies = data.data?.replies || data.data?.items || [];
          const hasMore = data.data?.hasMore || false;

          set((state) => {
            const existing = state.threadRepliesByRoot[rootMessageId] || [];
            const merged = cursor ? [...existing, ...replies] : replies;
            // Dedup
            const unique = Array.from(new Map(merged.map(r => [r._id, r])).values())
              .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            return {
              threadRepliesByRoot: { ...state.threadRepliesByRoot, [rootMessageId]: unique },
              threadHasMore: { ...state.threadHasMore, [rootMessageId]: hasMore },
              isLoadingReplies: false,
            };
          });
        } catch (error) {
          logger.error('Failed to fetch thread replies:', error);
          set({ isLoadingReplies: false });
        }
      },

      addThreadReply: (rootMessageId, reply) => {
        set((state) => {
          const existing = state.threadRepliesByRoot[rootMessageId] || [];
          if (existing.some(r => r._id === reply._id)) return state;
          return {
            threadRepliesByRoot: {
              ...state.threadRepliesByRoot,
              [rootMessageId]: [...existing, reply].sort(
                (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
              ),
            },
          };
        });
      },

      sendThreadReply: async (rootMessageId, channelId, content, htmlContent) => {
        const user = useAuthStore.getState().user;
        const tempId = `temp-reply-${Date.now()}`;

        const optimisticReply = {
          _id: tempId,
          content,
          htmlContent,
          authorId: user,
          senderSnapshot: { name: user?.name, avatar: user?.avatar },
          createdAt: new Date().toISOString(),
          pending: true,
        };

        get().addThreadReply(rootMessageId, optimisticReply);

        try {
          const { data } = await api.post(`/channels/${channelId}/messages`, {
            content,
            htmlContent,
            threadId: rootMessageId,
            tempId,
          });
          const serverReply = data.data?.message || data.data;
          // Replace temp with server reply
          set((state) => ({
            threadRepliesByRoot: {
              ...state.threadRepliesByRoot,
              [rootMessageId]: (state.threadRepliesByRoot[rootMessageId] || []).map(r =>
                r._id === tempId ? { ...serverReply, pending: false } : r
              ),
            },
          }));
          return serverReply;
        } catch (error) {
          logger.error('Failed to send thread reply:', error);
          set((state) => ({
            threadRepliesByRoot: {
              ...state.threadRepliesByRoot,
              [rootMessageId]: (state.threadRepliesByRoot[rootMessageId] || []).map(r =>
                r._id === tempId ? { ...r, pending: false, failed: true } : r
              ),
            },
          }));
        }
      },

      updateThreadStats: (rootMessageId, stats) => {
        set((state) => ({
          threads: state.threads.map(t =>
            (t.rootMessageId === rootMessageId || t._id === rootMessageId)
              ? { ...t, ...stats }
              : t
          ),
        }));
      },
    }),
    {
      name: 'flowtask-thread-storage',
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({ 
        activeThreadId: state.activeThreadId,
        unreadThreadCount: state.unreadThreadCount,
      }),
    }
  )
);
