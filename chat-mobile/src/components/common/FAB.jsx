import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus } from 'lucide-react-native';
import { useThemeStore } from '../../stores/themeStore';
import { moderateScale, verticalScale, scale } from '../../utils/responsive';

/**
 * Floating action button. When `aboveTabBar` is true (default), the parent
 * scene already clears the system nav via the tab bar. Otherwise we add
 * insets.bottom so the FAB clears 3-button / gesture navigation.
 */
const FAB = ({ onPress, style, icon: Icon = Plus, aboveTabBar = true }) => {
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const bottom = verticalScale(20) + (aboveTabBar ? 0 : insets.bottom);

  return (
    <TouchableOpacity
      style={[
        styles.fab,
        {
          backgroundColor: colors.primary,
          shadowColor: colors.shadow || "#000",
          bottom,
        },
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Icon size={moderateScale(24)} color={colors.textOnPrimary} strokeWidth={2.5} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
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
