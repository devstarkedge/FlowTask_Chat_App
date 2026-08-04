import { useReanimatedKeyboardAnimation, useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Single source of truth for keyboard bottom-inset math, backed by
 * react-native-keyboard-controller's native WindowInsets tracking
 * (Android) / keyboard notifications (iOS) — no measurement guessing.
 *
 * `keyboardHeightShared` is negative (0 .. -height), matching RNKC's
 * translateY convention; consumers building padding should negate it.
 */
export default function useKeyboardBottomInset() {
  const { height: keyboardHeightShared, progress } = useReanimatedKeyboardAnimation();
  const keyboardHeight = useKeyboardState((state) => state.height);
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const insets = useSafeAreaInsets();

  return {
    keyboardHeightShared,
    progress,
    keyboardHeight,
    keyboardVisible,
    insetsBottom: insets.bottom,
  };
}
