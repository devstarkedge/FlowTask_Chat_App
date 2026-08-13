import React from 'react';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useThemeStore } from '../../stores/themeStore';
import useKeyboardBottomInset from '../../hooks/useKeyboardBottomInset';

/**
 * KeyboardAwareContainer — production-ready keyboard + nav-bar inset handler.
 *
 * Android navigation modes handled:
 *  - 3-button nav  → insets.bottom ≈ 48 dp
 *  - Gesture nav   → insets.bottom ≈ 16–24 dp
 *  - Edge-to-edge  → insets.bottom reported by WindowInsets (any value)
 *
 * Logic:
 *  bottomSafeContext = true  → parent SafeAreaView already consumed insets.bottom
 *    keyboard closed → paddingBottom = 0          (parent already has the gap)
 *    keyboard open   → paddingBottom = max(0, keyboardHeight - insets.bottom)
 *
 *  bottomSafeContext = false → no parent consuming bottom inset (most Android screens)
 *    keyboard closed → paddingBottom = insets.bottom   (protect content from nav bar)
 *    keyboard open   → paddingBottom = keyboardHeight  (keyboard sits above nav bar)
 */
const KeyboardAwareContainer = ({
  children,
  style,
  disablePadding = false,
  bottomSafeContext = false, // default false — Android screens need bottom inset
}) => {
  const colors = useThemeStore((state) => state.colors);
  const { keyboardHeightShared, insetsBottom } = useKeyboardBottomInset();

  const animatedStyle = useAnimatedStyle(() => {
    if (disablePadding) return { paddingBottom: 0 };

    // keyboardHeightShared is negative (RNKC convention), negate to get positive height
    const kbHeight = Math.max(0, -keyboardHeightShared.value);

    let paddingBottom;
    if (bottomSafeContext) {
      // Parent SafeAreaView already reserves insets.bottom — only add keyboard overshoot
      paddingBottom = kbHeight > 0 ? Math.max(0, kbHeight - insetsBottom) : 0;
    } else {
      // No parent inset — always ensure content clears the nav bar
      paddingBottom = kbHeight > 0 ? kbHeight : insetsBottom;
    }

    return { paddingBottom };
  }, [disablePadding, bottomSafeContext, insetsBottom]);

  return (
    <Animated.View
      style={[{ flex: 1, backgroundColor: colors.background }, style, animatedStyle]}
    >
      {children}
    </Animated.View>
  );
};

export default React.memo(KeyboardAwareContainer);
