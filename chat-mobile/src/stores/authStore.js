import { create } from 'zustand';
import storage from '../services/storage';
import { authAPI } from '../services/api';
import { primeApiCache, setCachedToken, clearApiCache } from '../services/api';
import { secureSet, secureGet, secureMultiRemove } from '../utils/secureStorage';

export const useAuthStore = create((set, get) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  isLoading: false,
  isInitialized: false,
  error: null,
  flowtaskEnabled: true,

  // Initialize store from storage
  init: async () => {
    try {
      const accessToken = await secureGet('chat_access_token');
      const refreshToken = await secureGet('chat_refresh_token');
      const userJson = await storage.getItem('chat_user');
      const user = userJson ? JSON.parse(userJson) : null;
      
      // Prime the synchronous API interceptor cache
      await primeApiCache();

      set({ 
        accessToken, 
        refreshToken, 
        user, 
        isInitialized: true 
      });
    } catch (err) {
      set({ isInitialized: true });
    }
  },

  setTokens: async (accessToken, refreshToken) => {
    await secureSet('chat_access_token', accessToken);
    if (refreshToken) await secureSet('chat_refresh_token', refreshToken);
    setCachedToken(accessToken);
    set({ accessToken, refreshToken: refreshToken || get().refreshToken });
  },

  loginNative: async ({ email, password }) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await authAPI.login({ email, password });
      const { user, accessToken, refreshToken, flowTaskToken } = data.data;
      
      await secureSet('chat_access_token', accessToken);
      await secureSet('chat_refresh_token', refreshToken);
      if (flowTaskToken) await secureSet('flowtask_token', flowTaskToken);
      await storage.setItem('chat_user', JSON.stringify(user));
      
      setCachedToken(accessToken);
      set({ accessToken, refreshToken, user, isLoading: false });
      return data;
    } catch (error) {
      const msg = error.response?.data?.error?.message || 'Login failed';
      set({ isLoading: false, error: msg });
      throw error;
    }
  },

  loginFlowTask: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await authAPI.loginFlowTask(token);
      const { user, accessToken, refreshToken, flowTaskToken } = data.data;
      
      await secureSet('chat_access_token', accessToken);
      await secureSet('chat_refresh_token', refreshToken);
      await storage.setItem('chat_user', JSON.stringify(user));
      if (flowTaskToken) await secureSet('flowtask_token', flowTaskToken);
      
      setCachedToken(accessToken);
      set({ accessToken, refreshToken, user, isLoading: false });
      return data;
    } catch (error) {
      const msg = error.response?.data?.error?.message || 'FlowTask login failed';
      set({ isLoading: false, error: msg });
      throw error;
    }
  },

  register: async (userData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await authAPI.register(userData);
      set({ isLoading: false });
      return data;
    } catch (error) {
      const msg = error.response?.data?.error?.message || 'Registration failed';
      set({ isLoading: false, error: msg });
      throw error;
    }
  },

  logout: async () => {
    console.log('[Logout] Starting complete logout cleanup...');
    try {
      const refreshToken = get().refreshToken;
      if (refreshToken) {
        console.log('[Logout] Dispatched server logout request for token expiration');
        authAPI.logout(refreshToken).catch(() => {});
      }
    } catch (e) {
      console.log('[Logout] Server logout notification error (non-blocking):', e.message);
    }
    
    // Clear API cache
    console.log('[Logout] Clearing API cache...');
    clearApiCache();

    // Clear auth data from storage
    console.log('[Logout] Clearing Secure Store keys...');
    await secureMultiRemove([
      'chat_access_token',
      'chat_refresh_token',
      'flowtask_token',
      'pending_invite_code',
    ]).catch((err) => console.log('[Logout] Secure store clearing error:', err?.message));
    console.log('[Logout] Secure Store keys cleared.');

    console.log('[Logout] Clearing all AsyncStorage keys...');
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const keys = await AsyncStorage.getAllKeys();
      console.log('[Logout] Found AsyncStorage keys to remove:', keys);
      if (keys.length > 0) {
        await AsyncStorage.multiRemove(keys);
      }
      console.log('[Logout] AsyncStorage successfully cleared.');
    } catch (err) {
      console.log('[Logout] AsyncStorage clearing error:', err?.message);
    }
    
    // Clear auth store state
    console.log('[Logout] Resetting auth store state in memory...');
    set({ accessToken: null, refreshToken: null, user: null, error: null });
    console.log('[Logout] Auth store reset.');

    // Clear all other stores to prevent data leakage between sessions
    try {
      console.log('[Logout] Unregistering push notifications...');
      const { unregisterPushNotifications } = await import('../services/pushNotificationService');
      await unregisterPushNotifications().catch((err) => {
        console.log('[Logout] Push notification unregistration failed:', err?.message);
      });
      console.log('[Logout] Push notification token and listeners successfully cleared.');

      console.log('[Logout] Resetting in-memory Zustand store states...');
      const { useChannelStore } = await import('./channelStore');
      const { useChatStore } = await import('./chatStore');
      const { useThreadStore } = await import('./threadStore');
      const { useLaterStore } = await import('./laterStore');
      const { useDraftStore } = await import('./draftStore');
      const { useScheduledStore } = await import('./scheduledStore');
      const { useWorkspaceStore } = await import('./workspaceStore');
      const { useUIStore } = await import('./uiStore');
      const { useNotificationStore } = await import('./notificationStore');

      useChannelStore.setState({ activeChannelId: null, unreads: {} });
      console.log('[Logout] Channel store reset.');
      useChatStore.setState({ messagesByChannel: {}, hasMore: {}, typingByChannel: {}, connectionStatus: 'disconnected' });
      console.log('[Logout] Chat store reset.');
      
      if (useThreadStore.getState().clearThreads) {
        useThreadStore.getState().clearThreads();
        console.log('[Logout] Thread store reset.');
      }
      if (useLaterStore.getState().clearSavedMessages) {
        useLaterStore.getState().clearSavedMessages();
        console.log('[Logout] Later store reset.');
      }
      if (useDraftStore.getState().clearAllDrafts) {
        useDraftStore.getState().clearAllDrafts();
        console.log('[Logout] Draft store reset.');
      }
      if (useScheduledStore.getState().clearScheduledMessages) {
        useScheduledStore.getState().clearScheduledMessages();
        console.log('[Logout] Scheduled store reset.');
      }
      if (useWorkspaceStore.getState().clearWorkspaceState) {
        useWorkspaceStore.getState().clearWorkspaceState();
        console.log('[Logout] Workspace store reset.');
      }
      if (useNotificationStore.getState().clearNotifications) {
        useNotificationStore.getState().clearNotifications();
        console.log('[Logout] Notification store reset.');
      }
      useUIStore.setState({ isDrawerOpen: false });
      console.log('[Logout] UI store reset.');
      console.log('[Logout] Complete logout cleanup finished successfully.');
    } catch (e) {
      console.log('[Logout] Store state reset warning:', e?.message);
    }
  },

  // Update user role (for socket events, no API call)
  updateUserRole: (newRole, workspaceId) => {
    set((state) => {
      if (!state.user) return state;
      const updatedUser = { ...state.user, role: newRole };
      return { user: updatedUser };
    });
  },

  updateUser: (updates) => {
    set((state) => {
      if (!state.user) return state;
      const updatedUser = { ...state.user, ...updates };
      storage.setItem('chat_user', JSON.stringify(updatedUser)).catch(() => {});
      return { user: updatedUser };
    });
  },

  clearError: () => set({ error: null }),
}));
