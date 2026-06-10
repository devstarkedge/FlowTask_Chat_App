import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeStore } from '../../stores/themeStore';

/**
 * EmptyState — centered empty placeholder with icon, title, optional subtitle and action.
 *
 * Props:
 *  - icon: Lucide icon component (e.g. Bookmark, MessageSquare)
 *  - iconSize: number (default: 48)
 *  - title: string
 *  - subtitle: string (optional)
 *  - actionLabel: string (optional) — renders a button
 *  - onAction: () => void (optional)
 */
const EmptyState = React.memo(({ icon: Icon, iconSize = 48, title, subtitle, actionLabel, onAction }) => {
  const colors = useThemeStore((s) => s.colors);

  return (
    <View style={styles.container}>
      {Icon ? <Icon size={iconSize} color={colors.textTertiary} /> : null}
      <Text style={[styles.title, { color: colors.textSecondary }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.textTertiary }]}>{subtitle}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.primary }]}
          onPress={onAction}
          activeOpacity={0.8}
        >
          <Text style={[styles.actionLabel, { color: colors.textInverse }]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
  },
  actionButton: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default EmptyState;
