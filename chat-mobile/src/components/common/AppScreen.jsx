import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar, Platform } from 'react-native';
import { useThemeStore } from '../../stores/themeStore';

const AppScreen = ({ children, style, edges = ['top', 'bottom'], statusBarProps = {} }) => {
  const colors = useThemeStore((s) => s.colors);
  const effectiveTheme = useThemeStore((s) => s.effectiveTheme);
  const barStyle = effectiveTheme === 'dark' ? 'light-content' : 'dark-content';

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: colors.background }, style]} edges={edges}>
      <StatusBar 
        barStyle={barStyle} 
        backgroundColor={colors.background} 
        {...statusBarProps} 
      />
      {children}
    </SafeAreaView>
  );
};

export default AppScreen;
