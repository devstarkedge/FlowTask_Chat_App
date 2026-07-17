import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Plus } from 'lucide-react-native';
import { useThemeStore } from '../../stores/themeStore';
import { moderateScale, verticalScale, scale } from '../../utils/responsive';

const FAB = ({ onPress, style, icon: Icon = Plus }) => {
  const { colors } = useThemeStore();

  return (
    <TouchableOpacity
      style={[
        styles.fab,
        {
          backgroundColor: colors.primary,
          shadowColor: colors.shadow || "#000",
        },
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Icon size={24} color={colors.textOnPrimary} strokeWidth={2.5} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: verticalScale(20),
    right: scale(20),
    width: moderateScale(56),
    height: moderateScale(56),
    borderRadius: moderateScale(28),
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: verticalScale(4) },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
});

export default React.memo(FAB);
