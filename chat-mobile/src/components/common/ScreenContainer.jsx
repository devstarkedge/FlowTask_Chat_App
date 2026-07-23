import React from 'react';
import { View, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useThemeStore } from '../../stores/themeStore';

/**
 * ScreenContainer
 *
 * A wrapper component that provides keyboard avoidance across iOS and Android.
 * On Android, Expo/React Native uses `windowSoftInputMode="adjustResize"`, so
 * KeyboardAvoidingView behavior should be undefined to avoid double-resizing.
 * On iOS, `behavior="padding"` is used with configurable `keyboardVerticalOffset`.
 */
const ScreenContainer = ({ children, style, keyboardVerticalOffset = 0, behavior }) => {
  const colors = useThemeStore(state => state.colors);
  const isIOS = Platform.OS === 'ios';

  const effectiveBehavior = behavior !== undefined 
    ? behavior 
    : (isIOS ? 'padding' : undefined);

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }, style]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={effectiveBehavior}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {children}
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
});

export default ScreenContainer;
