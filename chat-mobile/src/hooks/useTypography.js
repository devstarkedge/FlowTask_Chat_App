/**
 * useTypography — returns fontSizes and fontWeights from the theme store.
 *
 * Usage:
 *   const { fontSizes, fontWeights } = useTypography();
 */
import { useShallow } from 'zustand/react/shallow';
import { useThemeStore } from '../stores/themeStore';

const useTypography = () =>
  useThemeStore(
    useShallow((state) => ({
      fontSizes: state.colors.fontSizes,
      fontWeights: state.colors.fontWeights,
    }))
  );

export default useTypography;
