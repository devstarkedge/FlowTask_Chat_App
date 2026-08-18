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

      fetchThreads: async (page = 1, options = {}) => {
        const silent = options?.silent === true;
        if (!resolveWorkspaceId()) {
          logger.warn('[ThreadStore] Skipping fetchThreads — no active workspace');
          return;
        }
        // Only show global loading on first page
        if (page === 1 && !silent) set({ isLoading: true });
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
