import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from '../services/api';

export const useAuthStore = create((set, get) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  isLoading: false,
  isInitialized: false,
  error: null,
  flowtaskEnabled: true, // Default to true as per web client

  // Initialize store from storage
  init: async () => {
    try {
      const accessToken = await AsyncStorage.getItem('chat_access_token');
      const refreshToken = await AsyncStorage.getItem('chat_refresh_token');
      const userJson = await AsyncStorage.getItem('chat_user');
      const user = userJson ? JSON.parse(userJson) : null;
      
      set({ 
        accessToken, 
        refreshToken, 
        user, 
        isInitialized: true 
      });
    } catch (err) {
      console.error('[AuthStore Init Error]', err);
      set({ isInitialized: true });
    }
  },

  setTokens: async (accessToken, refreshToken) => {
    await AsyncStorage.setItem('chat_access_token', accessToken);
    if (refreshToken) await AsyncStorage.setItem('chat_refresh_token', refreshToken);
    set({ accessToken, refreshToken: refreshToken || get().refreshToken });
  },

  loginNative: async ({ email, password }) => {
    console.log('[AuthStore] Native Login Attempt:', { email });
    set({ isLoading: true, error: null });
    try {
      const { data } = await authAPI.login({ email, password });
      console.log('[AuthStore] Login Success Response:', JSON.stringify(data.data, null, 2));
      const { user, accessToken, refreshToken } = data.data;
      
      await AsyncStorage.setItem('chat_access_token', accessToken);
      await AsyncStorage.setItem('chat_refresh_token', refreshToken);
      await AsyncStorage.setItem('chat_user', JSON.stringify(user));
      
      set({ accessToken, refreshToken, user, isLoading: false });
      return data;
    } catch (error) {
      console.error('[AuthStore] Login Error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
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
      
      await AsyncStorage.setItem('chat_access_token', accessToken);
      await AsyncStorage.setItem('chat_refresh_token', refreshToken);
      await AsyncStorage.setItem('chat_user', JSON.stringify(user));
      if (flowTaskToken) await AsyncStorage.setItem('flowtask_token', flowTaskToken);
      
      set({ accessToken, refreshToken, user, isLoading: false });
      return data;
    } catch (error) {
      const msg = error.response?.data?.error?.message || 'FlowTask login failed';
      set({ isLoading: false, error: msg });
      throw error;
    }
  },

  register: async (userData) => {
    console.log('[AuthStore] Registration Attempt Payload:', JSON.stringify(userData, null, 2));
    set({ isLoading: true, error: null });
    try {
      const { data } = await authAPI.register(userData);
      console.log('[AuthStore] Registration Success:', JSON.stringify(data, null, 2));
      set({ isLoading: false });
      return data;
    } catch (error) {
      console.error('[AuthStore] Registration Error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
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
    } catch (err) {}
    
    await AsyncStorage.removeItem('chat_access_token');
    await AsyncStorage.removeItem('chat_refresh_token');
    await AsyncStorage.removeItem('chat_user');
    await AsyncStorage.removeItem('flowtask_token');
    
    set({ accessToken: null, refreshToken: null, user: null, error: null });
  },

  clearError: () => set({ error: null }),
}));
