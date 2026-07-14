import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useThemeStore } from '../../stores/themeStore';

const HeaderBackButton = ({ onPress, style, iconColor }) => {
  const { colors } = useThemeStore();
  
  return (
    <TouchableOpacity 
      style={[styles.headerBackButton, { backgroundColor: colors.card }, style]} 
      onPress={onPress} 
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <ChevronLeft size={24} color={iconColor || colors.textPrimary} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  headerBackButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
});

export default HeaderBackButton;
