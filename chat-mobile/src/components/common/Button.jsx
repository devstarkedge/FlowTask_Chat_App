import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useThemeStore } from '../../stores/themeStore';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';

/**
 * Standardized Button component for primary, secondary (ghost), and danger actions.
 */
const Button = ({ 
  title, 
  onPress, 
  variant = 'primary', 
  disabled = false, 
  loading = false, 
  style, 
  textStyle,
  icon: Icon,
  fullWidth = false,
}) => {
  const { colors } = useThemeStore();

  let bg, borderColor, textColor;

  switch (variant) {
    case 'ghost':
      bg = 'transparent';
      borderColor = colors.border;
      textColor = colors.textPrimary;
      break;
    case 'danger':
      bg = colors.danger || '#ef4444';
      borderColor = colors.danger || '#ef4444';
      textColor = '#FFFFFF';
      break;
    case 'primary':
    default:
      bg = colors.primary;
      borderColor = colors.primary;
      textColor = '#FFFFFF';
      break;
  }

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: bg, borderColor },
        variant === 'ghost' && styles.ghostBorder,
        disabled && styles.disabled,
        fullWidth && styles.fullWidth,
        style
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <>
          {Icon && <Icon size={20} color={textColor} style={styles.icon} />}
          <Text style={[styles.text, { color: textColor }, textStyle]}>
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(16),
    borderRadius: moderateScale(8),
    minHeight: verticalScale(48),
  },
  fullWidth: {
    width: '100%',
  },
  ghostBorder: {
    borderWidth: 1,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: moderateScale(15),
    fontWeight: '600',
  },
  icon: {
    marginRight: scale(8),
  }
});

export default Button;
