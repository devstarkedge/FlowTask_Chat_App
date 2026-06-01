import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { threadAPI } from '../services/api';

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
          console.error('Failed to fetch threads:', error);
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
          const threads = state.threads.map((t) =>
            t._id === threadId
              ? {
                  ...t,
                  replyCount: (t.replyCount || 0) + 1,
                  lastReplyAt: reply.createdAt,
                  hasUnread: !isActive,
                }
              : t
          );

          const unreadCount = threads.filter(t => t.hasUnread).length;
          return { threads, unreadThreadCount: unreadCount };
        });
      },

      resolveThread: async (threadId) => {
        try {
          await threadAPI.resolve(threadId);
          get().updateThread(threadId, { isResolved: true });
        } catch (error) {
          console.error('Failed to resolve thread:', error);
          throw error;
        }
      },

      unresolveThread: async (threadId) => {
        try {
          await threadAPI.unresolve(threadId);
          get().updateThread(threadId, { isResolved: false });
        } catch (error) {
          console.error('Failed to unresolve thread:', error);
          throw error;
        }
      },

      clearThreads: () => set({ threads: [], activeThreadId: null, unreadThreadCount: 0 }),
    }),
    {
      name: 'flowtask-thread-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ 
        activeThreadId: state.activeThreadId,
        unreadThreadCount: state.unreadThreadCount,
      }),
    }
  )
);
