import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeStore } from '../../stores/themeStore';
import HeaderBackButton from './HeaderBackButton';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';


/**
 * ScreenHeader — standardized back-button + title + optional right action.
 *
 * Props:
 *  - title: string
 *  - onBack: () => void
 *  - rightAction: React node (optional)
 *  - subtitle: string (optional)
 */
const ScreenHeader = React.memo(({ title, onBack, rightAction, subtitle }) => {
  const colors = useThemeStore((s) => s.colors);

  return (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <HeaderBackButton onPress={onBack} />

      <View style={styles.titleContainer}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textTertiary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {rightAction || <View style={styles.spacer} />}
    </View>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    borderBottomWidth: 1,
    gap: 16,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: moderateScale(17),
    fontWeight: '700',
  },
  subtitle: {
    fontSize: moderateScale(12),
    marginTop: verticalScale(2),
  },
  spacer: {
    width: scale(40),
  },
});

export default ScreenHeader;
