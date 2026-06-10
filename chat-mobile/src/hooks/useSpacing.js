/**
 * useSpacing — returns the spacing design tokens from the theme store.
 *
 * Usage:
 *   const spacing = useSpacing();
 *   // spacing.sm, spacing.md, etc.
 */
import { useShallow } from 'zustand/react/shallow';
import { useThemeStore } from '../stores/themeStore';

const useSpacing = () =>
  useThemeStore(useShallow((state) => state.colors.spacing));

export default useSpacing;
