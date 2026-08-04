import React from 'react';
import { View, StyleSheet, Animated, Platform } from 'react-native';
import { useThemeStore } from '../../stores/themeStore';
import useKeyboard from '../../hooks/useKeyboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * KeyboardAwareContainer
 * 
 * Replaces KeyboardAvoidingView with Context-based padding calculation.
 * If a screen needs customized keyboard handling (e.g., scroll insets instead of padding),
 * it can consume useKeyboard() directly instead of wrapping children in this container.
 */
const KeyboardAwareContainer = ({ children, style, disablePadding = false, bottomSafeContext = true }) => {
  const colors = useThemeStore(state => state.colors);
  const { animatedKeyboardHeight, keyboardHeight } = useKeyboard();
  const insets = useSafeAreaInsets();

  React.useEffect(() => {
    if (__DEV__) {
      console.log(`[PIPELINE] KeyboardAwareContainer: received keyboardHeight = ${keyboardHeight}`);
    }
  }, [keyboardHeight]);

  // If bottomSafeContext is true, the parent (e.g. AppScreen) already pushes the content up
  // by insets.bottom. So when the keyboard opens, we only need to pad by (keyboardHeight - insets.bottom).
  // If false, the screen extends to the absolute bottom of the device, so we need the FULL keyboard height.
  const paddingBottom = React.useMemo(() => {
    if (disablePadding) return 0;
    
    // On iOS, AppScreen always applies insets.bottom, so we subtract it from keyboard height to avoid double padding.
    // On Android, we dynamically remove insets.bottom from AppScreen when the keyboard opens, so we need the FULL keyboard height.
    const shouldSubtractInsets = Platform.OS === 'ios' && bottomSafeContext;

    return animatedKeyboardHeight.interpolate(
      shouldSubtractInsets 
        ? {
            inputRange: [0, Math.max(1, insets.bottom), 9999],
            outputRange: [0, 0, 9999 - insets.bottom],
            extrapolate: 'clamp'
          }
        : {
            inputRange: [0, 9999],
            outputRange: [0, 9999],
            extrapolate: 'clamp'
          }
    );
  }, [disablePadding, bottomSafeContext, animatedKeyboardHeight, insets.bottom]);

  return Platform.OS === 'android' ? (
    <View style={[{ flex: 1, maxHeight: '100%', backgroundColor: colors.background }, style, { paddingBottom: disablePadding ? 0 : keyboardHeight }]}>
      {children}
    </View>
  ) : (
    <Animated.View style={[{ flex: 1, maxHeight: '100%', backgroundColor: colors.background }, style, { paddingBottom }]}>
      {children}
    </Animated.View>
  );
};

export default KeyboardAwareContainer;
