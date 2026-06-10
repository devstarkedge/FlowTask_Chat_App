/**
 * useColors — convenience alias for useThemeColors.
 * Returns the full colors object from the theme store.
 *
 * Usage:
 *   const colors = useColors();
 */
import { useShallow } from 'zustand/react/shallow';
import { useThemeStore } from '../stores/themeStore';

const useColors = () =>
  useThemeStore(useShallow((state) => state.colors));

export default useColors;
