import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
      const userJson = await AsyncStorage.getItem('chat_user');
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
      const { user, accessToken, refreshToken } = data.data;
      
      await secureSet('chat_access_token', accessToken);
      await secureSet('chat_refresh_token', refreshToken);
      await AsyncStorage.setItem('chat_user', JSON.stringify(user));
      
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
      await AsyncStorage.setItem('chat_user', JSON.stringify(user));
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
    try {
      const refreshToken = get().refreshToken;
      if (refreshToken) {
        authAPI.logout(refreshToken).catch(() => {});
      }
    } catch {}
    
    // Clear API cache
    clearApiCache();

    // Clear auth data from storage
    await secureMultiRemove([
      'chat_access_token',
      'chat_refresh_token',
      'flowtask_token',
    ]);
    await AsyncStorage.removeItem('chat_user');
    
    // Clear auth store state
    set({ accessToken: null, refreshToken: null, user: null, error: null });

    // Clear all other stores to prevent data leakage between sessions
    try {
      // Unregister push notifications before clearing state
      const { unregisterPushNotifications } = await import('../services/pushNotificationService');
      await unregisterPushNotifications().catch(() => {});

      const { useChannelStore } = await import('./channelStore');
      const { useChatStore } = await import('./chatStore');
      const { useThreadStore } = await import('./threadStore');
      const { useLaterStore } = await import('./laterStore');
      const { useDraftStore } = await import('./draftStore');
      const { useScheduledStore } = await import('./scheduledStore');
      const { useWorkspaceStore } = await import('./workspaceStore');
      const { useUIStore } = await import('./uiStore');

      useChannelStore.setState({ channels: [], activeChannelId: null, unreads: {} });
      useChatStore.setState({ messagesByChannel: {}, hasMore: {}, typingByChannel: {}, connectionStatus: 'disconnected' });
      useThreadStore.getState().clearThreads?.();
      useLaterStore.getState().clearSavedMessages?.();
      useDraftStore.getState().clearAllDrafts?.();
      useScheduledStore.getState().clearScheduledMessages?.();
      useWorkspaceStore.getState().clearWorkspaceState?.();
      useUIStore.setState({ isDrawerOpen: false });
    } catch {
      // Non-critical — stores will be re-initialized on next login
    }
  },

  clearError: () => set({ error: null }),
}));
