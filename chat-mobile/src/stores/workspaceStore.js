import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import storage from '../services/storage';
import logger from '../utils/logger';
import { workspaceAPI, setCachedWorkspaceId } from '../services/api';
import { queryClient } from '../queries/queryClient';
import { queryKeys } from '../queries/queryKeys';

async function clearScopedAppState() {
  try {
    const { useChannelStore } = await import('./channelStore');
    const { useChatStore } = await import('./chatStore');
    const { useThreadStore } = await import('./threadStore');
    const { useLaterStore } = await import('./laterStore');
    const { useDraftStore } = await import('./draftStore');
    const { useScheduledStore } = await import('./scheduledStore');
    const { disconnectSocket } = await import('../services/socket');

    disconnectSocket();
    useChannelStore.setState({
      activeChannelId: null,
      unreads: {},
      categories: [],
    });
    useChatStore.setState({ messagesByChannel: {}, hasMore: {}, typingByChannel: {} });
    useThreadStore.getState().clearThreads?.();
    useLaterStore.getState().clearSavedMessages?.();
    useDraftStore.getState().clearAllDrafts?.();
    useScheduledStore.getState().clearScheduledMessages?.();
  } catch (err) {
    logger.warn('[WorkspaceStore] Failed to clear scoped state:', err?.message);
  }
}

// Keep track of recently removed workspaces to handle backend cache lag
const recentlyRemovedWorkspaces = new Set();

export const useWorkspaceStore = create(
  persist(
    (set, get) => ({
      activeWorkspaceId: null,
      activeWorkspace: null,
      presenceMap: {},
      isLoading: false,
      error: null,

      fetchWorkspaces: async (skipAutoSelect = false) => {
        set({ isLoading: true, error: null });
        try {
          const workspaces = await queryClient.fetchQuery({
            queryKey: queryKeys.workspaces,
            queryFn: async () => {
              const { data } = await workspaceAPI.mine();
              let w = data.data?.workspaces || [];
              return w.filter(ws => !recentlyRemovedWorkspaces.has(ws._id));
            }
          });
          
          set({ isLoading: false });

          if (skipAutoSelect) return workspaces;

          // Auto-select if no active workspace
          const { activeWorkspaceId } = get();
          if (!activeWorkspaceId && workspaces.length > 0) {
            await get().switchWorkspace(workspaces[0]._id);
          } else if (activeWorkspaceId) {
            const active = workspaces.find((w) => w._id === activeWorkspaceId);
            if (active) {
              set({ activeWorkspace: active });
              // Keep API header cache + storage in sync with rehydrated workspace
              await storage.setItem('active_workspace_id', activeWorkspaceId);
              setCachedWorkspaceId(activeWorkspaceId);
            } else if (workspaces.length > 0) {
              await get().switchWorkspace(workspaces[0]._id);
            } else {
              get().clearWorkspaceState();
            }
          }
          return workspaces;
        } catch (error) {
          const msg = error.userMessage || 'Failed to fetch workspaces';
          set({ isLoading: false, error: msg });
          logger.error('[WorkspaceStore] Fetch error:', msg);
          throw error;
        }
      },

      switchWorkspace: async (workspaceId) => {
        if (!workspaceId) return;
        let workspaces = queryClient.getQueryData(queryKeys.workspaces) || [];
        if (workspaces.length === 0) {
          // Fallback if cache is empty
          try {
            workspaces = await get().fetchWorkspaces(true);
          } catch (e) {}
        }
        
        const workspace = workspaces.find((w) => w._id === workspaceId);
        if (workspace) {
          // Set header cache BEFORE any follow-up API calls
          setCachedWorkspaceId(workspaceId);
          set({
            activeWorkspaceId: workspaceId,
            activeWorkspace: workspace,
          });
          await storage.setItem('active_workspace_id', workspaceId);
          logger.info('[WorkspaceStore] Switched to workspace:', workspace.name);

          // Trigger full context refresh
          await get().refreshWorkspaceContext();
        }
      },

      refreshWorkspaceContext: async () => {
        try {
          // Import stores dynamically to avoid circular dependencies
          const { useChannelStore } = await import('./channelStore');
          const { useThreadStore } = await import('./threadStore');
          const { useLaterStore } = await import('./laterStore');
          const { useDraftStore } = await import('./draftStore');
          const { useScheduledStore } = await import('./scheduledStore');
          const { useChatStore } = await import('./chatStore');
          const { disconnectSocket, connectSocket } = await import('../services/socket');

          // Disconnect and reconnect socket with new workspace context
          disconnectSocket();

          // Clear existing state via proper store actions
          useChannelStore.setState({ activeChannelId: null, unreads: {} });
          useChatStore.setState({ messagesByChannel: {}, hasMore: {}, typingByChannel: {} });

          // Reconnect socket
          await connectSocket();

          // Channels are managed by TanStack Query (useChannels hook), not the store.
          // Invalidate the cache so the next render of useChannels refetches automatically.
          const wid = get().activeWorkspaceId;
          if (wid) {
            queryClient.invalidateQueries({ queryKey: queryKeys.channels(wid) });
          }

          // Refresh other store-managed data in parallel
          await Promise.all([
            useThreadStore.getState().fetchThreads?.() || Promise.resolve(),
            useLaterStore.getState().fetchSavedMessages?.() || Promise.resolve(),
            useDraftStore.getState().fetchDrafts?.(get().activeWorkspaceId) || Promise.resolve(),
            useScheduledStore.getState().fetchScheduledMessages?.() || Promise.resolve(),
          ]);

          logger.info('[WorkspaceStore] Context refreshed successfully');
        } catch (error) {
          logger.error('[WorkspaceStore] Failed to refresh context:', error);
        }
      },

      joinByInviteCode: async (inviteCode) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await workspaceAPI.joinByInviteCode(inviteCode);
          const workspaceObj = data.data?.workspace || data.data;
          const workspace = {
            ...(typeof workspaceObj === 'object' ? workspaceObj : {}),
            alreadyMember: !!data.data?.alreadyMember,
          };
          
          // Refresh workspaces list to ensure the new workspace is available for switchWorkspace
          await get().fetchWorkspaces(true);
          
          set({ isLoading: false });
          return workspace;
        } catch (error) {
          const msg = error.response?.data?.error?.message || error.response?.data?.message || error.userMessage || 'Failed to join workspace';
          set({ isLoading: false, error: msg });
          logger.error('[WorkspaceStore] Join error:', msg);
          throw new Error(msg);
        }
      },

      /**
       * Shared post-delete / post-leave flow:
       * re-fetch list → switch to another workspace OR clear state (empty selector).
       * @returns {{ remaining: boolean, nextWorkspaceId: string|null }}
       */
      afterWorkspaceRemoved: async (removedWorkspaceId) => {
        const wasActive = get().activeWorkspaceId === removedWorkspaceId;

        // Add to our cache lag prevention list
        recentlyRemovedWorkspaces.add(removedWorkspaceId);

        // Optimistically drop from local cache
        queryClient.setQueryData(queryKeys.workspaces, (old = []) => 
          old.filter((w) => w._id !== removedWorkspaceId)
        );

        // Authoritative list from server (/mine does not need workspace header)
        const workspaces = await get().fetchWorkspaces(true);
        const remaining = workspaces.filter((w) => w._id !== removedWorkspaceId);

        if (remaining.length > 0) {
          // Prefer keeping navigation on Main: switch before clearing active id
          if (wasActive) {
            await clearScopedAppState();
          }
          const next = remaining[0];
          // Ensure list in store matches filtered remaining (in case server lag)
          queryClient.setQueryData(queryKeys.workspaces, remaining.length === workspaces.length ? workspaces : remaining);
          await get().switchWorkspace(next._id);
          return { remaining: true, nextWorkspaceId: next._id };
        }

        // No workspaces left → empty state (WorkspaceSelector)
        if (wasActive) {
          await clearScopedAppState();
        }
        get().clearWorkspaceState();
        return { remaining: false, nextWorkspaceId: null };
      },

      deleteWorkspace: async (workspaceId) => {
        const id = workspaceId || get().activeWorkspaceId;
        if (!id) throw new Error('No workspace to delete');

        set({ isLoading: true, error: null });
        try {
          await workspaceAPI.delete(id);
          const result = await get().afterWorkspaceRemoved(id);
          set({ isLoading: false });
          logger.info('[WorkspaceStore] Workspace deleted', result);
          return result;
        } catch (error) {
          const msg =
            error.response?.data?.error?.message ||
            error.response?.data?.message ||
            error.userMessage ||
            'Failed to delete workspace';
          set({ isLoading: false, error: msg });
          logger.error('[WorkspaceStore] Delete error:', msg);
          throw new Error(msg);
        }
      },

      leaveWorkspace: async (workspaceId) => {
        const id = workspaceId || get().activeWorkspaceId;
        if (!id) throw new Error('No workspace to leave');

        set({ isLoading: true, error: null });
        try {
          await workspaceAPI.leave(id);
          const result = await get().afterWorkspaceRemoved(id);
          set({ isLoading: false });
          logger.info('[WorkspaceStore] Left workspace', result);
          return result;
        } catch (error) {
          const msg =
            error.response?.data?.error?.message ||
            error.response?.data?.message ||
            error.userMessage ||
            'Failed to leave workspace';
          set({ isLoading: false, error: msg });
          logger.error('[WorkspaceStore] Leave error:', msg);
          throw new Error(msg);
        }
      },

      clearWorkspaceState: () => {
        setCachedWorkspaceId(null);
        set({
          activeWorkspaceId: null,
          activeWorkspace: null,
          error: null,
          isLoading: false,
        });
        storage.removeItem('active_workspace_id');
      },

      // Update member role in store (for socket events, no API call)
      updateMemberRoleInStore: (userId, newRole) => {
        const wid = get().activeWorkspaceId;
        if (!wid) return;
        queryClient.setQueryData(queryKeys.workspaceMembers(wid), (oldMembers) => {
          if (!oldMembers) return oldMembers;
          return oldMembers.map((m) =>
            (m.userId?._id === userId || m.userId === userId || m._id === userId)
              ? { ...m, role: newRole }
              : m
          );
        });
      },

      // Update member profile in store (for socket events, no API call)
      updateMemberProfile: (userId, updates) => {
        set((state) => ({
          presenceMap: updates.onlineStatus ? { ...state.presenceMap, [userId]: updates.onlineStatus } : state.presenceMap,
        }));
        const wid = get().activeWorkspaceId;
        if (!wid) return;
        queryClient.setQueryData(queryKeys.workspaceMembers(wid), (oldMembers) => {
          if (!oldMembers) return oldMembers;
          return oldMembers.map((m) => {
            if (m.userId?._id === userId || m.userId === userId || m._id === userId) {
              const isNested = typeof m.userId === 'object' && m.userId !== null;
              if (isNested) {
                return { ...m, userId: { ...m.userId, ...updates } };
              }
              return { ...m, ...updates };
            }
            return m;
          });
        });
      },

        updatePresenceBatch: (updates) => {
          set((state) => {
            const nextMap = { ...state.presenceMap };
            let changed = false;
            for (const [uid, newStatus] of Object.entries(updates)) {
              const currentStatus = nextMap[uid];
              // Protect active realtime status from being clobbered by stale offline DB data in API payloads
              if (newStatus === 'offline' && (currentStatus === 'online' || currentStatus === 'away')) {
                continue;
              }
              if (currentStatus !== newStatus) {
                nextMap[uid] = newStatus;
                changed = true;
              }
            }
            return changed ? { presenceMap: nextMap } : state;
          });
        },

      clearError: () => set({ error: null }),

      fetchMembers: async (workspaceId) => {
        if (!workspaceId) return;
        set({ isLoading: true, error: null });
        try {
          const { data } = await workspaceAPI.getMembers(workspaceId);
          const members = data.data?.members || data.data || [];
          set({ members, isLoading: false });
          logger.info('[WorkspaceStore] Fetched members:', members.length);
          return members;
        } catch (error) {
          const msg = error.response?.data?.error?.message || error.response?.data?.message || error.userMessage || 'Failed to fetch members';
          set({ isLoading: false, error: msg });
          logger.error('[WorkspaceStore] Fetch members error:', msg);
          throw error;
        }
      },
    }),
    {
      name: 'flowtask-workspace-storage',
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({
        activeWorkspaceId: state.activeWorkspaceId,
        activeWorkspace: state.activeWorkspaceId ? state.activeWorkspace : null,
      }),
      onRehydrateStorage: () => (state) => {
        // After persist rehydration, prime API header cache immediately
        const workspaceId = state?.activeWorkspaceId;
        if (workspaceId) {
          setCachedWorkspaceId(workspaceId);
          storage.setItem('active_workspace_id', workspaceId).catch(() => {});
        }
      },
    }
  )
);
