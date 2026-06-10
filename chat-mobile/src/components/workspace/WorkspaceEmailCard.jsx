import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Mail, Info, Check } from 'lucide-react-native';
import { useThemeStore } from '../../stores/themeStore';
import { useAuthStore } from '../../stores/authStore';

/**
 * WorkspaceEmailCard
 * Displays the currently logged-in user's email and a signed-in status badge.
 * Matches Slack's "Add workspaces" screen account section.
 */
const WorkspaceEmailCard = ({ onInfoPress }) => {
  const { colors } = useThemeStore();
  const user = useAuthStore((s) => s.user);

  return (
    <View style={styles.wrapper}>
      {/* Email Row */}
      <View style={styles.emailRow}>
        <Mail size={20} color={colors.textSecondary} />
        <Text
          style={[styles.emailText, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {user?.email || ''}
        </Text>
        {onInfoPress && (
          <TouchableOpacity onPress={onInfoPress} hitSlop={10}>
            <Info size={20} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Status Card */}
      <View
        style={[
          styles.statusCard,
          { backgroundColor: colors.backgroundTertiary ?? colors.backgroundSecondary },
        ]}
      >
        <View
          style={[
            styles.checkBox,
            { backgroundColor: colors.border },
          ]}
        >
          <Check size={14} color={colors.textSecondary} strokeWidth={2.5} />
        </View>
        <Text style={[styles.statusText, { color: colors.textPrimary }]}>
          You're signed in to all workspaces for this email
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
  },
  emailText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 12,
    marginBottom: 4,
  },
  checkBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  statusText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
});

export default WorkspaceEmailCard;
