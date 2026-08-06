import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import storage from '../services/storage';
import { threadAPI, resolveWorkspaceId } from '../services/api';
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

      threadsPage: 1,
      threadsHasMore: true,

      fetchThreads: async (page = 1) => {
        if (!resolveWorkspaceId()) {
          logger.warn('[ThreadStore] Skipping fetchThreads — no active workspace');
          return;
        }
        // Only show global loading on first page
        if (page === 1) set({ isLoading: true });
        try {
          const { data } = await threadAPI.getMyThreads({ page, limit: 20 });
          const raw = data.data?.threads || [];
          
          set((state) => {
            const existing = page === 1 ? [] : state.threads;
            const merged = [...existing, ...raw];
            // Deduplicate and ensure sorted by lastReplyAt descending
            const threads = Array.from(new Map(merged.map(t => [t._id, t])).values())
              .sort((a, b) => {
                const dateA = new Date(a.lastReplyAt || a.createdAt);
                const dateB = new Date(b.lastReplyAt || b.createdAt);
                return dateB - dateA;
              });
            const unreadCount = threads.filter(t => t.hasUnread).length;
            
            return { 
              threads, 
              unreadThreadCount: unreadCount, 
              threadsPage: page,
              threadsHasMore: raw.length >= 20, // If we got 20 or more, assume there's more
              isLoading: false 
            };
          });
        } catch (error) {
          set({ isLoading: false });
          if (page === 1) {
            set({ threads: [], unreadThreadCount: 0 });
          }
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
        const { threadId, authorId } = reply;
        if (!threadId) return;

        const currentUser = useAuthStore.getState().user;
        const isSelf = authorId === currentUser?._id;

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
              hasUnread: !isActive && !isSelf,
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
          // Dedup by _id AND by tempId to prevent socket + optimistic duplicates
          if (existing.some(r => r._id === reply._id || (reply.tempId && r._id === reply.tempId))) return state;
          const merged = [...existing, reply];
          const unique = Array.from(new Map(merged.map(r => [r._id, r])).values())
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
          return {
            threadRepliesByRoot: {
              ...state.threadRepliesByRoot,
              [rootMessageId]: unique,
            },
          };
        });
      },

      sendThreadReply: async (rootMessageId, channelId, content, options = {}) => {
        const { htmlContent, fileReferences, mentions } = options;
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
          fileReferences: fileReferences || [],
          mentions: mentions || [],
        };

        get().addThreadReply(rootMessageId, optimisticReply);

        try {
          const { data } = await api.post(`/channels/${channelId}/messages`, {
            content,
            htmlContent,
            threadId: rootMessageId,
            fileReferences,
            mentions,
            tempId,
          });
          const serverReply = data.data?.message || data.data;
          // Replace temp with server reply, then dedup (socket may have already added it)
          set((state) => {
            const replaced = (state.threadRepliesByRoot[rootMessageId] || []).map(r =>
              r._id === tempId ? { ...serverReply, pending: false } : r
            );
            const unique = Array.from(new Map(replaced.map(r => [r._id, r])).values())
              .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            return {
              threadRepliesByRoot: { ...state.threadRepliesByRoot, [rootMessageId]: unique },
            };
          });
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

      editThreadReply: async (rootMessageId, replyId, content, htmlContent) => {
        try {
          const payload = { content };
          if (htmlContent) payload.htmlContent = htmlContent;
          const { data } = await api.put(`/messages/${replyId}`, payload);
          const updated = data.data?.message || data.data;
          set((state) => ({
            threadRepliesByRoot: {
              ...state.threadRepliesByRoot,
              [rootMessageId]: (state.threadRepliesByRoot[rootMessageId] || []).map(r =>
                r._id === replyId ? { ...r, ...updated, isEdited: true } : r
              ),
            },
          }));
        } catch (error) {
          logger.error('Failed to edit thread reply:', error);
          throw error;
        }
      },

      deleteThreadReply: async (rootMessageId, replyId) => {
        try {
          await api.delete(`/messages/${replyId}`);
          set((state) => ({
            threadRepliesByRoot: {
              ...state.threadRepliesByRoot,
              [rootMessageId]: (state.threadRepliesByRoot[rootMessageId] || []).filter(r => r._id !== replyId),
            },
          }));
        } catch (error) {
          logger.error('Failed to delete thread reply:', error);
          throw error;
        }
      },

      // Real-time socket handlers for thread replies
      updateThreadReply: (replyId, updates) => {
        set((state) => {
          const updated = {};
          for (const [rootId, replies] of Object.entries(state.threadRepliesByRoot)) {
            updated[rootId] = replies.map(r =>
              r._id === replyId ? { ...r, ...updates } : r
            );
          }
          return { threadRepliesByRoot: updated };
        });
      },

      removeThreadReply: (replyId, channelId) => {
        set((state) => {
          const updated = {};
          for (const [rootId, replies] of Object.entries(state.threadRepliesByRoot)) {
            updated[rootId] = replies.filter(r => r._id !== replyId);
          }
          return { threadRepliesByRoot: updated };
        });
      },

      addReactionToReply: (replyId, emoji, user) => {
        set((state) => {
          const updated = {};
          for (const [rootId, replies] of Object.entries(state.threadRepliesByRoot)) {
            updated[rootId] = replies.map(r => {
              if (r._id !== replyId) return r;
              const reactions = [...(r.reactions || [])];
              const existing = reactions.find(rx => rx.emoji === emoji);
              if (existing) {
                if (existing.userIds?.includes(user._id)) return r;
                existing.users = [...(existing.users || []), user];
                existing.userIds = [...(existing.userIds || []), user._id];
                existing.count = (existing.count || 0) + 1;
              } else {
                reactions.push({ emoji, users: [user], userIds: [user._id], count: 1 });
              }
              return { ...r, reactions };
            });
          }
          return { threadRepliesByRoot: updated };
        });
      },

      removeReactionFromReply: (replyId, emoji, userId) => {
        set((state) => {
          const updated = {};
          for (const [rootId, replies] of Object.entries(state.threadRepliesByRoot)) {
            updated[rootId] = replies.map(r => {
              if (r._id !== replyId) return r;
              const reactions = (r.reactions || []).map(rx => {
                if (rx.emoji !== emoji) return rx;
                const users = (rx.users || []).filter(u => u._id !== userId);
                const userIds = (rx.userIds || []).filter(id => id !== userId);
                return { ...rx, users, userIds, count: users.length };
              }).filter(rx => rx.count > 0);
              return { ...r, reactions };
            });
          }
          return { threadRepliesByRoot: updated };
        });
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
