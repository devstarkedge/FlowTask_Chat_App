import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Headphones, Copy } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { huddlePeople } from '../features/huddle/utils/huddlePeople';
import { useHuddleStore } from '../stores/huddleStore';
import { useChatStore } from '../stores/chatStore';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useHuddleUiStore } from '../stores/huddleUiStore';
import ENV from '../config/environment';
import { scale, verticalScale, moderateScale } from '../utils/responsive';

export default function HuddlePanel({ channelId }) {
  const colors = useThemeStore((s) => s.colors);
  const user = useAuthStore((s) => s.user);
  const state = useHuddleStore((s) => s.byChannel[channelId]);
  const session = useHuddleStore((s) => s.session);
  const error = useHuddleStore((s) => s.error);
  const busy = useHuddleStore((s) => s.busy);
  const act = useHuddleStore((s) => s.act);
  const load = useHuddleStore((s) => s.load);
  const status = useChatStore((s) => s.connectionStatus);

  useEffect(() => {
    if (channelId && status === 'connected') load(channelId);
  }, [channelId, status, load]);

  const joined = session?.channelId === channelId;
  const isHuddleActive = Boolean(state?.huddle);

  const handleCopyLink = async () => {
    try {
      const workspaceId = useWorkspaceStore.getState().activeWorkspaceId;
      const url = `${ENV.CLIENT_URL}/workspace/${workspaceId}/channel/${channelId}?huddle=1`;
      await Clipboard.setStringAsync(url);
      Toast.show({ type: 'success', text1: 'Huddle link copied to clipboard' });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Could not copy link' });
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          borderColor: colors.border,
          backgroundColor: colors.background,
        },
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.titleRow}>
          <Headphones size={16} color={isHuddleActive ? '#00856b' : colors.textPrimary} />
          <Text
            style={[
              styles.titleText,
              { color: isHuddleActive ? '#00856b' : colors.textPrimary },
            ]}
          >
            {isHuddleActive ? 'Huddle active' : 'Huddle'}
          </Text>
          {isHuddleActive && <View style={styles.liveDot} />}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            onPress={handleCopyLink}
            style={[styles.copyBtn, { borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel="Copy Huddle link"
          >
            <Copy size={12} color={colors.textSecondary} style={{ marginRight: scale(4) }} />
            <Text style={[styles.copyBtnText, { color: colors.textSecondary }]}>Copy link</Text>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={busy || status !== 'connected'}
            onPress={() => useHuddleUiStore.getState().openPanel({ channelId, label: 'Huddle' })}
            style={[
              styles.mainBtn,
              {
                backgroundColor: isHuddleActive || joined ? '#00856b' : colors.primary,
              },
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.mainBtnText}>
              {busy ? 'Working…' : joined ? 'Open Huddle' : isHuddleActive ? 'Join' : 'Start'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {isHuddleActive && (
        <Text style={[styles.participantsText, { color: colors.textSecondary }]}>
          {huddlePeople(state.participants, session?.id).map((p) => p.name).join(', ') ||
            'Waiting for participants'}
        </Text>
      )}

      {joined && String(state?.huddle?.startedBy) === String(user?._id) && (
        <TouchableOpacity
          disabled={busy}
          onPress={() => act('end', channelId)}
          style={{ marginTop: verticalScale(4) }}
        >
          <Text style={{ color: colors.error || '#ef4444', fontSize: moderateScale(12) }}>
            End huddle
          </Text>
        </TouchableOpacity>
      )}

      {session && !joined && (
        <TouchableOpacity
          onPress={() => act('leave', session.channelId)}
          style={{ marginTop: verticalScale(4) }}
        >
          <Text style={{ color: colors.primary, fontSize: moderateScale(12) }}>
            Leave other huddle
          </Text>
        </TouchableOpacity>
      )}

      {error && (
        <Text accessibilityRole="alert" style={{ color: colors.error || '#ef4444', fontSize: 12 }}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(8),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
  },
  titleText: {
    fontSize: moderateScale(13.5),
    fontWeight: '600',
  },
  liveDot: {
    width: scale(7),
    height: scale(7),
    borderRadius: scale(3.5),
    backgroundColor: '#10b981',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(4),
    paddingHorizontal: scale(8),
    borderRadius: moderateScale(6),
    borderWidth: StyleSheet.hairlineWidth,
  },
  copyBtnText: {
    fontSize: moderateScale(11.5),
    fontWeight: '500',
  },
  mainBtn: {
    paddingVertical: verticalScale(4),
    paddingHorizontal: scale(10),
    borderRadius: moderateScale(6),
  },
  mainBtnText: {
    color: '#ffffff',
    fontSize: moderateScale(12),
    fontWeight: '600',
  },
  participantsText: {
    fontSize: moderateScale(12),
    marginTop: verticalScale(3),
  },
});
