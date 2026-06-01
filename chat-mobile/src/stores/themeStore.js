import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { getTheme } from '../theme/colors';

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
  effectiveTheme: getSystemTheme(),
  colors: getTheme(getSystemTheme(), 'aubergine'),
  isInitialized: false,

  init: async () => {
    try {
      const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (stored) {
        const { mode, sidebarTheme } = JSON.parse(stored);
        const effectiveTheme = getEffectiveTheme(mode);
        set({
          mode,
          sidebarTheme,
          effectiveTheme,
          colors: getTheme(effectiveTheme, sidebarTheme),
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
        set({
          effectiveTheme: colorScheme || 'light',
          colors: getTheme(colorScheme || 'light', get().sidebarTheme),
        });
      }
    });

    return subscription;
  },

  setMode: async (mode) => {
    const effectiveTheme = getEffectiveTheme(mode);
    set({
      mode,
      effectiveTheme,
      colors: getTheme(effectiveTheme, get().sidebarTheme),
    });
    await AsyncStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ mode, sidebarTheme: get().sidebarTheme })
    );
  },

  setSidebarTheme: async (sidebarTheme) => {
    set({
      sidebarTheme,
      colors: getTheme(get().effectiveTheme, sidebarTheme),
    });
    await AsyncStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ mode: get().mode, sidebarTheme })
    );
  },

  toggleTheme: () => {
    const newMode = get().effectiveTheme === 'dark' ? 'light' : 'dark';
    get().setMode(newMode);
  },
}));
