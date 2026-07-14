import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import storage from '../services/storage';
import logger from '../utils/logger';
import { workspaceAPI, setCachedWorkspaceId } from '../services/api';

export const useWorkspaceStore = create(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceId: null,
      activeWorkspace: null,
      members: [],
      isLoading: false,
      error: null,

      fetchWorkspaces: async () => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await workspaceAPI.mine();
          const workspaces = data.data?.workspaces || [];
          set({ workspaces, isLoading: false });

          // Auto-select if no active workspace
          const { activeWorkspaceId } = get();
          if (!activeWorkspaceId && workspaces.length > 0) {
            await get().switchWorkspace(workspaces[0]._id);
          } else if (activeWorkspaceId) {
            const active = workspaces.find((w) => w._id === activeWorkspaceId);
            if (active) {
              set({ activeWorkspace: active });
            } else if (workspaces.length > 0) {
              await get().switchWorkspace(workspaces[0]._id);
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
        const { workspaces } = get();
        const workspace = workspaces.find((w) => w._id === workspaceId);
        if (workspace) {
          set({
            activeWorkspaceId: workspaceId,
            activeWorkspace: workspace,
          });
          await storage.setItem('active_workspace_id', workspaceId);
          // CRITICAL: Update in-memory API cache so X-Workspace-Id header is sent
          setCachedWorkspaceId(workspaceId);
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
          useChannelStore.getState().channels = [];
          useChatStore.getState().messagesByChannel = {};
          
          // Reconnect socket
          await connectSocket();
          
          // Refresh all data
          await Promise.all([
            useChannelStore.getState().fetchChannels(),
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
          const workspace = data.data?.workspace || data.data;
          set({ isLoading: false });
          return workspace;
        } catch (error) {
          const msg = error.response?.data?.error?.message || error.response?.data?.message || error.userMessage || 'Failed to join workspace';
          set({ isLoading: false, error: msg });
          logger.error('[WorkspaceStore] Join error:', msg);
          throw new Error(msg);
        }
      },

      leaveWorkspace: async (workspaceId) => {
        set({ isLoading: true, error: null });
        try {
          await workspaceAPI.leave(workspaceId);
          const { workspaces, activeWorkspaceId } = get();
          const updatedWorkspaces = workspaces.filter(w => w._id !== workspaceId);
          set({ workspaces: updatedWorkspaces, isLoading: false });
          
          if (activeWorkspaceId === workspaceId) {
            if (updatedWorkspaces.length > 0) {
              await get().switchWorkspace(updatedWorkspaces[0]._id);
            } else {
              get().clearWorkspaceState();
            }
          }
        } catch (error) {
          const msg = error.response?.data?.error?.message || error.response?.data?.message || error.userMessage || 'Failed to leave workspace';
          set({ isLoading: false, error: msg });
          logger.error('[WorkspaceStore] Leave error:', msg);
          throw new Error(msg);
        }
      },

      clearWorkspaceState: () => {
        set({
          workspaces: [],
          activeWorkspaceId: null,
          activeWorkspace: null,
          error: null,
        });
        storage.removeItem('active_workspace_id');
      },

      // Update member role in store (for socket events, no API call)
      updateMemberRoleInStore: (userId, newRole) => {
        set((state) => ({
          members: state.members.map((m) =>
            (m.userId?._id === userId || m.userId === userId || m._id === userId)
              ? { ...m, role: newRole }
              : m
          ),
        }))
      },

      // Update member profile in store (for socket events, no API call)
      updateMemberProfile: (userId, updates) => {
        set((state) => ({
          members: state.members.map((m) =>
            (m.userId?._id === userId || m.userId === userId || m._id === userId)
              ? { ...m, ...updates }
              : m
          ),
        }))
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'flowtask-workspace-storage',
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({
        activeWorkspaceId: state.activeWorkspaceId,
        activeWorkspace: state.activeWorkspace,
      }),
    }
  )
);
