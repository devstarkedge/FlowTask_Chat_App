import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { getTheme } from '../theme/colors';
import api from '../services/api';

const THEME_STORAGE_KEY = '@flowtask_theme';

const getSystemTheme = () => Appearance.getColorScheme() || 'light';
const getEffectiveTheme = (mode) => (mode === 'system' ? getSystemTheme() : mode);

export const useThemeStore = create((set, get) => ({
  mode: 'system',
  accentColor: 'blue',
  customColor: null, // hex string when accentColor === 'custom'
  workspaceTheme: null,
  effectiveTheme: getSystemTheme(),
  colors: getTheme(getSystemTheme(), 'blue', null),
  isInitialized: false,

  init: async () => {
    try {
      const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Support legacy customColors key
        const mode = parsed.mode || 'system';
        const accentColor = parsed.accentColor || 'blue';
        const customColor = parsed.customColor || parsed.customColors?.primary || null;
        const effectiveTheme = getEffectiveTheme(mode);
        set({
          mode,
          accentColor,
          customColor,
          effectiveTheme,
          colors: getTheme(effectiveTheme, accentColor, customColor, null),
          isInitialized: true,
        });
      } else {
        set({ isInitialized: true });
      }
    } catch (error) {
      console.error('Failed to load theme:', error);
      set({ isInitialized: true });
    }

    // Fetch theme from backend (only if authenticated)
    try {
      const { useAuthStore } = await import('./authStore');
      const token = useAuthStore.getState().accessToken;
      if (token) {
        const response = await api.get('/users/preferences/theme');
        if (response.data?.success && response.data.data?.theme) {
          const serverTheme = response.data.data.theme;
          if (serverTheme.mode || serverTheme.accentColor || serverTheme.customColor || serverTheme.customTheme) {
            const mode = serverTheme.mode || get().mode;
            const accentColor = serverTheme.accentColor || get().accentColor;
            const customColor =
              serverTheme.customColor ||
              serverTheme.customTheme?.primary ||
              get().customColor;
            const effectiveTheme = getEffectiveTheme(mode);
            set({
              mode,
              accentColor,
              customColor,
              effectiveTheme,
              colors: getTheme(effectiveTheme, accentColor, customColor, null),
            });
            await get().saveToStorage();
          }
        }
      }
    } catch (error) {
      console.warn('Failed to fetch theme from server:', error.message);
    }

    // Listen to system theme changes
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (get().mode === 'system') {
        const { accentColor, customColor, workspaceTheme } = get();
        set({
          effectiveTheme: colorScheme || 'light',
          colors: getTheme(colorScheme || 'light', accentColor, customColor, workspaceTheme),
        });
      }
    });

    return subscription;
  },

  setMode: async (mode) => {
    const effectiveTheme = getEffectiveTheme(mode);
    const { accentColor, customColor, workspaceTheme } = get();
    set({
      mode,
      effectiveTheme,
      colors: getTheme(effectiveTheme, accentColor, customColor, workspaceTheme),
    });
    await get().saveToStorage();
    await get().syncToBackend();
  },

  setAccentColor: async (accentColor) => {
    const { effectiveTheme, customColor, workspaceTheme } = get();
    set({
      accentColor,
      colors: getTheme(effectiveTheme, accentColor, customColor, workspaceTheme),
    });
    await get().saveToStorage();
    await get().syncToBackend();
  },

  /** Set a custom color hex and switch accentColor to 'custom' */
  setCustomColor: async (hex) => {
    const { effectiveTheme, workspaceTheme } = get();
    set({
      accentColor: 'custom',
      customColor: hex,
      colors: getTheme(effectiveTheme, 'custom', hex, workspaceTheme),
    });
    await get().saveToStorage();
    await get().syncToBackend();
  },

  /** Live preview while dragging the picker (no persist / no sync) */
  previewCustomColor: (hex) => {
    const { effectiveTheme, workspaceTheme } = get();
    set({
      customColor: hex,
      colors: getTheme(effectiveTheme, 'custom', hex, workspaceTheme),
    });
  },

  cancelPreview: () => {
    const { effectiveTheme, accentColor, customColor, workspaceTheme } = get();
    // If user hadn't picked custom before, revert to blue
    const revertAccent = accentColor === 'custom' && !customColor ? 'blue' : accentColor;
    set({
      accentColor: revertAccent,
      colors: getTheme(effectiveTheme, revertAccent, customColor, workspaceTheme),
    });
  },

  setWorkspaceTheme: async (workspaceTheme) => {
    const { effectiveTheme, accentColor, customColor } = get();
    set({
      workspaceTheme,
      colors: getTheme(effectiveTheme, accentColor, customColor, workspaceTheme),
    });
  },

  saveToStorage: async () => {
    const { mode, accentColor, customColor } = get();
    await AsyncStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ mode, accentColor, customColor })
    );
  },

  syncToBackend: async () => {
    try {
      const { mode, accentColor, customColor } = get();
      const payload = {
        theme: {
          mode,
          accentColor,
          customColor: customColor || null,
          customTheme: customColor ? { primary: customColor } : {},
        },
      };
      await api.put('/users/preferences/theme', payload);
    } catch (error) {
      console.error('[THEME] Failed to sync theme to backend:', error.response?.data || error.message);
    }
  },

  toggleTheme: () => {
    const newMode = get().effectiveTheme === 'dark' ? 'light' : 'dark';
    get().setMode(newMode);
  },
}));
