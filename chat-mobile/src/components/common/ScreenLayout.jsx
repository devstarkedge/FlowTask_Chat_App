import React from 'react';
import { View, StatusBar, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../stores/themeStore';

/**
 * ScreenLayout — unified screen wrapper.
 * Consolidates SafeAreaView + StatusBar + themed background.
 *
 * Props:
 *  - children: React nodes
 *  - style: additional container style
 *  - edges: SafeAreaView edges array (default: ['top', 'left', 'right'])
 *  - backgroundColor: override background color
 *  - statusBarStyle: 'light-content' | 'dark-content' (auto-resolved from theme)
 */
const ScreenLayout = React.memo(({ children, style, edges, backgroundColor, statusBarStyle }) => {
  const effectiveTheme = useThemeStore((s) => s.effectiveTheme);
  const colors = useThemeStore((s) => s.colors);

  const resolvedBarStyle =
    statusBarStyle || (effectiveTheme === 'dark' ? 'light-content' : 'dark-content');

  const safeEdges = edges || ['top', 'left', 'right'];

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: backgroundColor || colors.background }, style]}
      edges={safeEdges}
    >
      <StatusBar barStyle={resolvedBarStyle} backgroundColor={backgroundColor || colors.background} />
      {children}
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default ScreenLayout;
