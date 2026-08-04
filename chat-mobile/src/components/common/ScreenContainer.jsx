import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useThemeStore } from '../../stores/themeStore';
import KeyboardAwareContainer from './KeyboardAwareContainer';

/**
 * ScreenContainer
 *
 * A wrapper component that provides keyboard avoidance across iOS and Android
 * using the centralized KeyboardAwareContainer.
 */
const ScreenContainer = ({ children, style, onLayout }) => {
  const colors = useThemeStore(state => state.colors);

  return (
    <View onLayout={onLayout} style={[{ flex: 1, backgroundColor: colors.background }, style]}>
      <KeyboardAwareContainer
        style={styles.keyboardView}
        disablePadding={false}
      >
        {children}
      </KeyboardAwareContainer>
    </View>
  );
};

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
});

export default ScreenContainer;
