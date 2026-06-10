/**
 * useThemeColors — optimized selector for theme colors with shallow comparison.
 *
 * Instead of `const { colors } = useThemeStore()` which subscribes to the
 * entire store, this hook uses zustand's `useShallow` to prevent unnecessary
 * re-renders when other store fields change.
 *
 * Usage:
 *   const colors = useThemeColors();
 */
import { useShallow } from 'zustand/react/shallow';
import { useThemeStore } from '../stores/themeStore';

export const useThemeColors = () =>
  useThemeStore(useShallow((state) => state.colors));
