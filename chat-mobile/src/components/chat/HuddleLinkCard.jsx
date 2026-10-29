import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions } from 'react-native';
import { Headphones, Copy, Check } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useAuthStore } from '../../stores/authStore';
import { useHuddleStore } from '../../stores/huddleStore';
import { useHuddleUiStore } from '../../stores/huddleUiStore';
import { queryClient } from '../../queries/queryClient';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(Math.max(SCREEN_WIDTH * 0.74, 270), 320);

export default function HuddleLinkCard({ link, channelId: currentChannelId, channelName: currentChannelName, colors }) {
  const [copied, setCopied] = React.useState(false);

  const ownName = useAuthStore((state) => state.user?.name);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const active = useHuddleStore((state) => Boolean(state.byChannel?.[link?.channelId]?.huddle));
  const participants = useHuddleStore((state) => state.byChannel?.[link?.channelId]?.participants || []);
  const joined = useHuddleStore((state) => state.session?.channelId === link?.channelId);
  const openPanel = useHuddleUiStore((state) => state.openPanel);

  // Look up channel from queryClient cache if available
  const cachedChannels = queryClient.getQueryData(['channels', activeWorkspaceId]) || [];
  const foundChannel = (cachedChannels || []).find(
    (item) => String(item._id || item.id) === String(link?.channelId)
  );

  const isCurrentChannel = String(link?.channelId) === String(currentChannelId);
  const isDM = foundChannel?.type === 'dm' || foundChannel?.type === 'self';

  const names = foundChannel?.dmParticipantNames?.filter((name) => name !== ownName);
  const dmName = isDM && !foundChannel?.dmRecipientId && names?.length
    ? names.join(', ')
    : foundChannel?.name || foundChannel?.dmRecipientName;

  const displayLabel = isDM
    ? (dmName || 'Direct Message')
    : (foundChannel?.name || (isCurrentChannel ? currentChannelName : null) || 'channel');

  const targetPrefix = isDM ? 'With' : 'In';
  const targetFormatted = isDM ? `@${displayLabel}` : `#${displayLabel}`;

  const actionText = joined ? 'Open Huddle' : active ? 'Join Huddle' : 'Start a Huddle';

  const handleOpen = () => {
    openPanel({
      workspaceId: link?.workspaceId || activeWorkspaceId,
      channelId: link?.channelId || currentChannelId,
      label: displayLabel,
    });
  };

  const handleCopyLink = async () => {
    if (link?.href) {
      await Clipboard.setStringAsync(link.href);
      setCopied(true);
      Toast.show({ type: 'success', text1: 'Huddle link copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <View
      style={[
        styles.card,
        {
          width: CARD_WIDTH,
          backgroundColor: colors.card || '#ffffff',
          borderColor: colors.border || '#e2e8f0',
        },
      ]}
    >
      {/* Top Header Row */}
      <View style={styles.header}>
        <View
          style={[
            styles.iconContainer,
            {
              backgroundColor: active ? '#ecfdf5' : '#f0fdf4',
            },
          ]}
        >
          <Headphones size={22} color="#00856b" />
        </View>

        <View style={styles.textContainer}>
          <Text
            style={[styles.title, { color: colors.textPrimary || '#1e293b' }]}
            numberOfLines={1}
          >
            Huddle Invitation
          </Text>

          <Text
            style={[styles.subtitle, { color: colors.textSecondary || '#64748b' }]}
            numberOfLines={1}
          >
            {targetPrefix}{' '}
            <Text style={[styles.targetHighlight, { color: colors.primary || '#6366f1' }]}>
              {targetFormatted}
            </Text>{' '}
            <Text style={styles.brandTag}>· TaskChat</Text>
          </Text>

          {active && (
            <View style={styles.liveBadgeRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>
                Live now{participants.length > 0 ? ` · ${participants.length} in call` : ''}
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={handleCopyLink}
          style={[styles.copyButton, { borderColor: colors.border || '#e2e8f0', backgroundColor: colors.backgroundSecondary || '#f8fafc' }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Copy Huddle link"
        >
          {copied ? (
            <Check size={14} color="#10b981" />
          ) : (
            <Copy size={14} color={colors.textSecondary || '#64748b'} />
          )}
        </TouchableOpacity>
      </View>

      {/* Action CTA Footer */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.backgroundSecondary || '#f8fafc',
            borderTopColor: colors.border || '#e2e8f0',
          },
        ]}
      >
        <TouchableOpacity
          onPress={handleOpen}
          activeOpacity={0.82}
          style={[
            styles.actionButton,
            {
              backgroundColor: joined
                ? colors.primary || '#6366f1'
                : '#00856b',
            },
          ]}
        >
          <Headphones size={16} color="#ffffff" style={{ marginRight: scale(8) }} />
          <Text style={styles.actionButtonText}>{actionText}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: moderateScale(14),
    borderWidth: 1,
    overflow: 'hidden',
    marginVertical: verticalScale(4),
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(14),
    paddingTop: verticalScale(12),
    paddingBottom: verticalScale(12),
    gap: scale(10),
  },
  iconContainer: {
    width: scale(42),
    height: scale(42),
    borderRadius: moderateScale(11),
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  title: {
    fontSize: moderateScale(14.5),
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: verticalScale(2),
  },
  subtitle: {
    fontSize: moderateScale(12),
    lineHeight: 16,
  },
  targetHighlight: {
    fontWeight: '700',
  },
  brandTag: {
    fontSize: moderateScale(11),
    opacity: 0.7,
  },
  liveBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(4),
    gap: scale(5),
  },
  liveDot: {
    width: scale(7),
    height: scale(7),
    borderRadius: scale(3.5),
    backgroundColor: '#10b981',
  },
  liveText: {
    fontSize: moderateScale(11),
    fontWeight: '600',
    color: '#059669',
  },
  copyButton: {
    width: scale(30),
    height: scale(30),
    borderRadius: moderateScale(8),
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(9),
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(9),
    borderRadius: moderateScale(8),
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: moderateScale(13.5),
    fontWeight: '700',
    letterSpacing: 0.1,
  },
});
