import React from 'react';
import { StatusBar } from 'react-native';
import { useThemeStore } from '../stores/themeStore';

export const ThemeContext = React.createContext(null);

const ThemeProvider = ({ children }) => {
  const colors = useThemeStore((s) => s.colors);
  const effectiveTheme = useThemeStore((s) => s.effectiveTheme);
  const barStyle = effectiveTheme === 'dark' ? 'light-content' : 'dark-content';

  return (
    <ThemeContext.Provider value={{ colors, effectiveTheme }}>
      <StatusBar barStyle={barStyle} backgroundColor={colors.primary} />
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeProvider;
