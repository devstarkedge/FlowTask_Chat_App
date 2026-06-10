import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useThemeStore } from '../../stores/themeStore';

/**
 * LoadingState — centered loading spinner with theme color.
 *
 * Props:
 *  - size: 'small' | 'large' (default: 'large')
 *  - style: additional container style
 */
const LoadingState = React.memo(({ size = 'large', style }) => {
  const colors = useThemeStore((s) => s.colors);

  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator size={size} color={colors.primary} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default LoadingState;
