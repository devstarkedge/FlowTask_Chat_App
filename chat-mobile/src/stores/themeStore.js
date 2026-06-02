import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { getTheme } from '../theme/colors';
import api from '../services/api';

const THEME_STORAGE_KEY = '@flowtask_theme';

const getSystemTheme = () => {
  return Appearance.getColorScheme() || 'light';
};

const getEffectiveTheme = (mode) => {
  if (mode === 'system') return getSystemTheme();
  return mode;
};

export const useThemeStore = create((set, get) => ({
  mode: 'system',
  sidebarTheme: 'aubergine',
  accentColor: 'blue',
  customColors: {},
  workspaceTheme: null,
  effectiveTheme: getSystemTheme(),
  colors: getTheme(getSystemTheme(), 'aubergine', 'blue'),
  isInitialized: false,

  init: async () => {
    try {
      const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (stored) {
        const { mode, sidebarTheme, accentColor, customColors } = JSON.parse(stored);
        const effectiveTheme = getEffectiveTheme(mode);
        set({
          mode,
          sidebarTheme,
          accentColor: accentColor || 'blue',
          customColors: customColors || {},
          effectiveTheme,
          colors: getTheme(effectiveTheme, sidebarTheme, accentColor || 'blue', customColors || {}, null),
          isInitialized: true,
        });
      } else {
        set({ isInitialized: true });
      }
    } catch (error) {
      console.error('Failed to load theme:', error);
      set({ isInitialized: true });
    }

    // Listen to system theme changes
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (get().mode === 'system') {
        const { sidebarTheme, accentColor, customColors, workspaceTheme } = get();
        set({
          effectiveTheme: colorScheme || 'light',
          colors: getTheme(colorScheme || 'light', sidebarTheme, accentColor, customColors, workspaceTheme),
        });
      }
    });

    return subscription;
  },

  setMode: async (mode) => {
    const effectiveTheme = getEffectiveTheme(mode);
    const { sidebarTheme, accentColor, customColors, workspaceTheme } = get();
    set({
      mode,
      effectiveTheme,
      colors: getTheme(effectiveTheme, sidebarTheme, accentColor, customColors, workspaceTheme),
    });
    await get().saveToStorage();
    await get().syncToBackend();
  },

  setSidebarTheme: async (sidebarTheme) => {
    const { effectiveTheme, accentColor, customColors, workspaceTheme } = get();
    set({
      sidebarTheme,
      colors: getTheme(effectiveTheme, sidebarTheme, accentColor, customColors, workspaceTheme),
    });
    await get().saveToStorage();
    await get().syncToBackend();
  },

  setAccentColor: async (accentColor) => {
    const { effectiveTheme, sidebarTheme, customColors, workspaceTheme } = get();
    set({
      accentColor,
      colors: getTheme(effectiveTheme, sidebarTheme, accentColor, customColors, workspaceTheme),
    });
    await get().saveToStorage();
    await get().syncToBackend();
  },

  setCustomColors: async (customColors) => {
    const { effectiveTheme, sidebarTheme, accentColor, workspaceTheme } = get();
    set({
      customColors,
      colors: getTheme(effectiveTheme, sidebarTheme, accentColor, customColors, workspaceTheme),
    });
    await get().saveToStorage();
    await get().syncToBackend();
  },

  setWorkspaceTheme: async (workspaceTheme) => {
    const { effectiveTheme, sidebarTheme, accentColor, customColors } = get();
    set({
      workspaceTheme,
      colors: getTheme(effectiveTheme, sidebarTheme, accentColor, customColors, workspaceTheme),
    });
  },

  saveToStorage: async () => {
    const { mode, sidebarTheme, accentColor, customColors } = get();
    await AsyncStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ mode, sidebarTheme, accentColor, customColors })
    );
  },

  syncToBackend: async () => {
    try {
      const { mode, sidebarTheme, accentColor, customColors } = get();
      await api.put('/users/preferences/theme', {
        theme: {
          mode,
          sidebarTheme,
          accentColor,
          customColors,
        },
      });
    } catch (error) {
      console.warn('Failed to sync theme to backend:', error);
    }
  },

  toggleTheme: () => {
    const newMode = get().effectiveTheme === 'dark' ? 'light' : 'dark';
    get().setMode(newMode);
  },
}));
