import React, { useMemo } from 'react';
import { View, Animated, Platform } from 'react-native';
import { useThemeStore } from '../../stores/themeStore';
import useKeyboard from '../../hooks/useKeyboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * KeyboardAwareContainer
 *
 * Android bottom padding:
 *  - keyboard closed → insets.bottom (nav bar / gesture inset)
 *  - keyboard open   → bottomOffset from KeyboardProvider
 *    (= measured overlap of app root with the IME — never double-counts resize)
 *
 * iOS: animated keyboard height, minus safe-area when parent already applies it.
 */
const KeyboardAwareContainer = ({
  children,
  style,
  disablePadding = false,
  bottomSafeContext = true,
}) => {
  const colors = useThemeStore((state) => state.colors);
  const { animatedKeyboardHeight, keyboardVisible, bottomOffset } = useKeyboard();
  const insets = useSafeAreaInsets();

  const androidPaddingBottom = useMemo(() => {
    if (disablePadding) return 0;
    if (keyboardVisible) return Math.max(0, bottomOffset);
    return bottomSafeContext ? 0 : Math.max(0, insets.bottom);
  }, [disablePadding, keyboardVisible, bottomOffset, bottomSafeContext, insets.bottom]);

  const iosPaddingBottom = useMemo(() => {
    if (disablePadding) return 0;

    if (!bottomSafeContext) {
      return animatedKeyboardHeight.interpolate({
        inputRange: [0, Math.max(1, insets.bottom), 9999],
        outputRange: [insets.bottom, insets.bottom, 9999],
        extrapolate: 'clamp',
      });
    }

    return animatedKeyboardHeight.interpolate({
      inputRange: [0, Math.max(1, insets.bottom), 9999],
      outputRange: [0, 0, 9999 - insets.bottom],
      extrapolate: 'clamp',
    });
  }, [disablePadding, bottomSafeContext, animatedKeyboardHeight, insets.bottom]);

  if (Platform.OS === 'android') {
    return (
      <View
        style={[
          { flex: 1, backgroundColor: colors.background },
          style,
          { paddingBottom: androidPaddingBottom },
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        { flex: 1, backgroundColor: colors.background },
        style,
        { paddingBottom: iosPaddingBottom },
      ]}
    >
      {children}
    </Animated.View>
  );
};

export default React.memo(KeyboardAwareContainer);
