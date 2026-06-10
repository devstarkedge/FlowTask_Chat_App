import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useThemeStore } from '../../stores/themeStore';

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
      <TouchableOpacity style={styles.backButton} onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <ArrowLeft size={22} color={colors.textPrimary} />
      </TouchableOpacity>

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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  spacer: {
    width: 40,
  },
});

export default ScreenHeader;
