import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeStore } from '../../stores/themeStore';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';

/**
 * Standardized IconButton component for perfectly centered circular actions (e.g. Back, Close, etc.)
 */
const IconButton = ({ 
  icon: Icon,
  onPress, 
  variant = 'ghost', 
  size = 40,
  iconSize = 24,
  disabled = false, 
  style, 
  iconColor,
  hitSlop = 10,
}) => {
  const { colors } = useThemeStore();

  let bg, borderColor, defaultIconColor;

  switch (variant) {
    case 'primary':
      bg = colors.primary;
      borderColor = colors.primary;
      defaultIconColor = '#FFFFFF';
      break;
    case 'card':
      bg = colors.card;
      borderColor = colors.border;
      defaultIconColor = colors.textPrimary;
      break;
    case 'ghost':
    default:
      bg = 'transparent';
      borderColor = 'transparent';
      defaultIconColor = colors.textPrimary;
      break;
  }

  const containerSize = moderateScale(size);

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { 
          backgroundColor: bg, 
          borderColor,
          width: containerSize,
          height: containerSize,
          borderRadius: containerSize / 2,
        },
        variant === 'card' && styles.cardBorder,
        disabled && styles.disabled,
        style
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      hitSlop={{ top: hitSlop, bottom: hitSlop, left: hitSlop, right: hitSlop }}
    >
      <Icon size={moderateScale(iconSize)} color={iconColor || defaultIconColor} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBorder: {
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  disabled: {
    opacity: 0.5,
  }
});

export default IconButton;
