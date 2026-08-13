import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar, Platform } from 'react-native';
import { useThemeStore } from '../../stores/themeStore';

/**
 * AppScreen — top-level screen wrapper with safe area + status bar.
 *
 * Default edges on Android include 'bottom' so content never overlaps
 * the navigation bar (3-button, gesture, or edge-to-edge).
 *
 * Screens that manage bottom inset themselves (e.g. via KeyboardAwareContainer)
 * should pass edges={['top','left','right']} to avoid double-applying the inset.
 */
const AppScreen = ({ children, style, edges, statusBarProps = {} }) => {
  const colors = useThemeStore((s) => s.colors);
  const effectiveTheme = useThemeStore((s) => s.effectiveTheme);
  const barStyle = effectiveTheme === 'dark' ? 'light-content' : 'dark-content';

  const defaultEdges = Platform.OS === 'android'
    ? ['top', 'left', 'right', 'bottom']
    : ['top', 'bottom'];

  const safeEdges = edges || defaultEdges;

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: colors.background }, style]} edges={safeEdges}>
      <StatusBar
        barStyle={barStyle}
        backgroundColor={colors.background}
        translucent
        {...statusBarProps}
      />
      {children}
    </SafeAreaView>
  );
};

export default AppScreen;
