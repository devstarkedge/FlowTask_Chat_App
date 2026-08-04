export const createSyncSlice = (set, get) => ({
  isOnline: true,
  isSyncing: false,
  connectionStatus: 'connected', // 'connected' | 'disconnected' | 'connecting'

  setOnlineStatus: (isOnline) => set({ isOnline }),
  setSyncStatus: (isSyncing) => set({ isSyncing }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus })
});
