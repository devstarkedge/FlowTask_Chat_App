import React from 'react';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useThemeStore } from '../../stores/themeStore';
import useKeyboardBottomInset from '../../hooks/useKeyboardBottomInset';

/**
 * KeyboardAwareContainer
 *
 * Bottom padding, driven by react-native-keyboard-controller's native
 * keyboard height (identical on Android and iOS — no platform branch):
 *  - keyboard closed → bottomSafeContext ? 0 : insets.bottom
 *  - keyboard open   → bottomSafeContext ? max(0, height - insets.bottom) : max(insets.bottom, height)
 *    (bottomSafeContext = true means a parent SafeAreaView already reserves insets.bottom)
 */
const KeyboardAwareContainer = ({
  children,
  style,
  disablePadding = false,
  bottomSafeContext = true,
}) => {
  const colors = useThemeStore((state) => state.colors);
  const { keyboardHeightShared, insetsBottom } = useKeyboardBottomInset();

  const animatedStyle = useAnimatedStyle(() => {
    if (disablePadding) return { paddingBottom: 0 };

    const height = Math.max(0, -keyboardHeightShared.value);
    const paddingBottom = bottomSafeContext
      ? Math.max(0, height - insetsBottom)
      : Math.max(insetsBottom, height);

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
