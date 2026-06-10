import { create } from 'zustand';
import { notificationPrefAPI } from '../services/api';
import logger from '../utils/logger';

export const useNotificationPrefStore = create((set, get) => ({
  preferences: null,
  isLoading: false,
  isPaused: false,
  pauseUntil: null,
  level: 'all', // 'all' | 'mentions' | 'nothing'
  error: null,

  fetchPreferences: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await notificationPrefAPI.get();
      const prefs = data.data || data;
      set({
        preferences: prefs,
        level: prefs.level || prefs.notificationLevel || 'all',
        isPaused: !!prefs.isPaused || !!prefs.pausedUntil,
        pauseUntil: prefs.pausedUntil || null,
        isLoading: false,
      });
    } catch (error) {
      logger.error('Failed to fetch notification preferences:', error);
      set({ isLoading: false, error: error.message });
    }
  },

  updateLevel: async (level) => {
    set({ level, isLoading: true });
    try {
      await notificationPrefAPI.update({ level, notificationLevel: level });
      set((state) => ({
        preferences: { ...state.preferences, level },
        isLoading: false,
      }));
    } catch (error) {
      logger.error('Failed to update notification level:', error);
      set({ isLoading: false, error: error.message });
    }
  },

  pauseNotifications: async (duration) => {
    set({ isLoading: true });
    try {
      await notificationPrefAPI.pause({ duration });
      set({
        isPaused: true,
        pauseUntil: new Date(Date.now() + duration * 60000).toISOString(),
        isLoading: false,
      });
    } catch (error) {
      logger.error('Failed to pause notifications:', error);
      set({ isLoading: false, error: error.message });
    }
  },

  resumeNotifications: async () => {
    set({ isLoading: true });
    try {
      await notificationPrefAPI.resume();
      set({
        isPaused: false,
        pauseUntil: null,
        isLoading: false,
      });
    } catch (error) {
      logger.error('Failed to resume notifications:', error);
      set({ isLoading: false, error: error.message });
    }
  },
}));
