import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import storage from '../services/storage';
import api from '../services/api';

export const usePreferencesStore = create(
  persist(
    (set) => ({
      // Notifications
      notifMobileNotifications: true,
      notifLetYouKnowAbout: 'Everything',
      notifThreads: true,
      notifNewHuddles: true,
      notifIncomingMsgs: true,
      notifKeywords: 'None',
      
      notifDmsGroups: true,
      notifChannels: false,

      // Appearance
      emojiSkinTone: 'Default',
      
      // Accessibility
      swipeDmLeft: 'Mark as Read/Unread',
      swipeDmRight: 'Mute/Unmute',
      swipeActivityLeft: 'Mark as Read/Unread',
      swipeActivityRight: 'Clear/Restore',

      // Audio, Video & Images
      optimizeMedia: true,
      huddlesMusic: true,

      // Language & Region
      language: 'English (US)',
      timeZoneAuto: true,
      time24Hour: false,

      // Privacy & Security
      discoverability: true,

      // Device & Troubleshooting
      browserApp: 'In-App',

      // Setters
      setPreference: async (key, value) => {
        set({ [key]: value });
        try {
          await api.put('/users/preferences', { [key]: value });
        } catch (e) {
          // Silent fallback
        }
      },
      togglePreference: async (key) => {
        set((state) => ({ [key]: !state[key] }));
        try {
          const value = usePreferencesStore.getState()[key];
          await api.put('/users/preferences', { [key]: value });
        } catch (e) {
          // Silent fallback
        }
      },
      
      init: async () => {
        try {
          // First hydrate from backend to sync cross-device
          const response = await api.get('/users/preferences');
          if (response.data && response.data.success) {
            set((state) => ({ ...state, ...response.data.data }));
          }
        } catch (e) {
          // If network fails, Zustand persist layer handles local cache automatically
        }
      },
    }),
    {
      name: 'flowtask-preferences-storage',
      storage: createJSONStorage(() => storage),
    }
  )
);
