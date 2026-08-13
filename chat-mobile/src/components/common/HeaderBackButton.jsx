import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useThemeStore } from '../../stores/themeStore';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';


const HeaderBackButton = ({ onPress, style, iconColor }) => {
  const { colors } = useThemeStore();
  
  return (
    <TouchableOpacity 
      style={[styles.headerBackButton, { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border }, style]} 
      onPress={onPress} 
      hitSlop={{ top: verticalScale(10), bottom: verticalScale(10), left: scale(10), right: scale(10) }}
    >
      <ChevronLeft size={24} color={iconColor || colors.textPrimary} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  headerBackButton: {
    width: scale(44),
    height: verticalScale(44),
    borderRadius: moderateScale(22),
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: scale(0), height: verticalScale(2) },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
});

export default HeaderBackButton;
