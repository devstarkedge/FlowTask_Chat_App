import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { workspaceAPI } from '../services/api';

export const useWorkspaceStore = create(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceId: null,
      activeWorkspace: null,
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
          console.error('[WorkspaceStore] Fetch error:', msg);
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
          await AsyncStorage.setItem('active_workspace_id', workspaceId);
          console.log('[WorkspaceStore] Switched to workspace:', workspace.name);
          
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
          
          console.log('[WorkspaceStore] Context refreshed successfully');
        } catch (error) {
          console.error('[WorkspaceStore] Failed to refresh context:', error);
        }
      },

      clearWorkspaceState: () => {
        set({
          workspaces: [],
          activeWorkspaceId: null,
          activeWorkspace: null,
          error: null,
        });
        AsyncStorage.removeItem('active_workspace_id');
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'flowtask-workspace-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        activeWorkspaceId: state.activeWorkspaceId,
        activeWorkspace: state.activeWorkspace,
      }),
    }
  )
);
