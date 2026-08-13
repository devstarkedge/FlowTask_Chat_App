import React from 'react';
import { StatusBar, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../stores/themeStore';

/**
 * ScreenLayout — unified screen wrapper.
 *
 * Default edges include 'bottom' on Android so content never slides under
 * the 3-button / gesture / edge-to-edge navigation bar.
 *
 * Screens that use KeyboardAwareContainer for bottom inset management
 * (Chat, ThreadDetail) should pass edges={['top','left','right']} explicitly
 * so the two layers don't double-apply the bottom inset.
 */
const ScreenLayout = React.memo(({ children, style, edges, backgroundColor, statusBarStyle }) => {
  const effectiveTheme = useThemeStore((s) => s.effectiveTheme);
  const colors = useThemeStore((s) => s.colors);

  const resolvedBarStyle =
    statusBarStyle || (effectiveTheme === 'dark' ? 'light-content' : 'dark-content');

  // On Android: include 'bottom' by default so nav bar is always covered.
  // Screens with KeyboardAwareContainer pass their own edges to opt out.
  const defaultEdges = Platform.OS === 'android'
    ? ['top', 'left', 'right', 'bottom']
    : ['top', 'left', 'right'];

  const safeEdges = edges || defaultEdges;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: backgroundColor || colors.background }, style]}
      edges={safeEdges}
    >
      <StatusBar
        barStyle={resolvedBarStyle}
        backgroundColor={backgroundColor || colors.background}
        translucent
      />
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
