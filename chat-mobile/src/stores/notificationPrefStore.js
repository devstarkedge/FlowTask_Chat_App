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

  mutedChannels: {},

  fetchPreferences: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await notificationPrefAPI.get();
      const prefs = data?.data || data || {};
      const mutedMap = {};

      const extractMutes = (overrides) => {
        if (!overrides) return;
        if (overrides instanceof Map) {
          for (const [id, val] of overrides.entries()) {
            if (val?.muted || val?.paused) {
              if (!val.muteUntil || new Date(val.muteUntil) > new Date()) {
                mutedMap[String(id)] = true;
              }
            }
          }
          return;
        }
        if (typeof overrides === 'object') {
          Object.keys(overrides).forEach((id) => {
            const val = overrides[id];
            if (val?.muted || val?.paused) {
              if (!val.muteUntil || new Date(val.muteUntil) > new Date()) {
                mutedMap[String(id)] = true;
              }
            }
          });
        }
      };

      // Extract from all sections (dms, channels, groups)
      extractMutes(prefs.dms?.overrides);
      extractMutes(prefs.channels?.overrides);
      extractMutes(prefs.groups?.overrides);

      // Legacy fallback if channels was stored as flat map
      if (prefs.channels && typeof prefs.channels === 'object') {
        Object.keys(prefs.channels).forEach((key) => {
          if (key !== 'overrides' && key !== 'defaultLevel') {
            const val = prefs.channels[key];
            if (val?.muted || val?.paused) mutedMap[String(key)] = true;
          }
        });
      }

      set({
        preferences: prefs,
        mutedChannels: mutedMap,
        level: prefs.level || prefs.notificationLevel || 'all',
        isPaused: !!prefs.isPaused || !!prefs.pause?.active || !!prefs.pausedUntil,
        pauseUntil: prefs.pause?.resumeAt || prefs.pausedUntil || null,
        isLoading: false,
      });
    } catch (error) {
      logger.error('Failed to fetch notification preferences:', error);
      set({ isLoading: false, error: error.message });
    }
  },

  toggleChannelMute: async (channelId, isMuted, section = null) => {
    const idStr = String(channelId);
    set((state) => ({
      mutedChannels: { ...state.mutedChannels, [idStr]: isMuted },
    }));

    try {
      let sectionKey = section;
      if (!sectionKey) {
        try {
          const { useChannelStore } = require('./channelStore');
          const channel = useChannelStore.getState().channels?.find((c) => String(c._id) === idStr);
          if (channel?.type === 'dm' || channel?.isDM) {
            sectionKey = 'dms';
          } else if (channel?.type === 'private' || channel?.type === 'team') {
            sectionKey = 'groups';
          } else {
            sectionKey = 'channels';
          }
        } catch (_) {
          sectionKey = 'channels';
        }
      }

      await notificationPrefAPI.updateChannel(channelId, {
        muted: isMuted,
        paused: isMuted,
        section: sectionKey,
      });
    } catch (error) {
      logger.error('Failed to update channel mute preferences:', error);
      set((state) => ({
        mutedChannels: { ...state.mutedChannels, [idStr]: !isMuted },
      }));
      throw error;
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
