import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useThemeStore } from '../stores/themeStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { usePreferencesStore } from '../stores/preferencesStore';
import { AppAvatar } from './common';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Archive, BellOff, CheckCircle, Clock } from 'lucide-react-native';
import { useChannelStore } from '../stores/channelStore';
import { useNotificationPrefStore } from '../stores/notificationPrefStore';
import Toast from 'react-native-toast-message';
import { scale, verticalScale, moderateScale } from '../utils/responsive';

const DMListItem = React.memo(({ channel, onPress, unreadCount = 0, containerStyle, touchable = true }) => {
  const { colors } = useThemeStore();
  const { swipeDmLeft, swipeDmRight } = usePreferencesStore();
  const markAsRead = useChannelStore(s => s.markAsRead);
  const isMuted = useNotificationPrefStore(s => !!s.mutedChannels?.[channel._id]);
  const toggleChannelMute = useNotificationPrefStore(s => s.toggleChannelMute);
  const swipeableRef = React.useRef(null);

  const rawTargetId = channel.dmRecipientId;
  const targetId = typeof rawTargetId === 'object' ? rawTargetId?._id || rawTargetId?.id : rawTargetId;
  const targetIdStr = targetId?.toString ? targetId.toString() : targetId;
  const liveOnlineStatus = useWorkspaceStore(s => s.presenceMap?.[targetIdStr]);

  const dmUser = {
    _id: channel.dmRecipientId,
    name: channel.name,
    avatar: channel.avatar,
    onlineStatus: liveOnlineStatus || channel.onlineStatus || 'offline',
  };

  const content = (
    <>
      <AppAvatar user={dmUser} size={44} showStatus />

      <View style={styles.info}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text
            style={[
              styles.name,
              { color: colors.textPrimary, flex: 1 },
              unreadCount > 0 && styles.unreadName,
            ]}
            numberOfLines={1}
          >
            {dmUser.name}
          </Text>
          {isMuted && (
            <BellOff size={14} color={colors.textSecondary} />
          )}
        </View>
        {!!channel.lastMessagePreview && (
          <Text
            style={[styles.lastMessage, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {channel.lastMessagePreview}
          </Text>
        )}
      </View>

      {unreadCount > 0 && (
        <View style={[styles.unreadBadge, { backgroundColor: colors.badgeBackground }]}>
          <Text style={[styles.unreadText, { color: colors.badgeText }]}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </>
  );

  if (!touchable) {
    return (
      <View style={[styles.row, containerStyle]}>
        {content}
      </View>
    );
  }

  const getActionIcon = (actionStr, color) => {
    switch(actionStr) {
      case 'Mark as Read/Unread': return <CheckCircle size={24} color={color} />;
      case 'Archive': return <Archive size={24} color={color} />;
      case 'Mute/Unmute': return <BellOff size={24} color={color} />;
      case 'Remind me': return <Clock size={24} color={color} />;
      default: return <CheckCircle size={24} color={color} />;
    }
  };

  const renderLeftActions = (progress, dragX) => {
    if (!swipeDmLeft || swipeDmLeft === 'None' || swipeDmLeft === 'Nothing') return null;
    return (
      <View style={[styles.swipeAction, styles.swipeLeft, { backgroundColor: colors.primary }]}>
        {getActionIcon(swipeDmLeft, '#FFF')}
      </View>
    );
  };

  const renderRightActions = (progress, dragX) => {
    if (!swipeDmRight || swipeDmRight === 'None' || swipeDmRight === 'Nothing') return null;
    return (
      <View style={[styles.swipeAction, styles.swipeRight, { backgroundColor: colors.statusDanger || '#ef4444' }]}>
        {getActionIcon(swipeDmRight, '#FFF')}
      </View>
    );
  };

  const handleSwipeAction = async (actionStr) => {
    switch(actionStr) {
      case 'Mark as Read/Unread':
        if (unreadCount > 0) {
          markAsRead(channel._id);
          Toast.show({ type: 'success', text1: 'Marked as read' });
        } else {
          Toast.show({ type: 'info', text1: 'Already read' });
        }
        break;
      case 'Archive':
        Toast.show({ type: 'success', text1: 'Archived' });
        break;
      case 'Mute/Unmute':
        try {
          const newMuteState = !isMuted;
          await toggleChannelMute(channel._id, newMuteState);
          Toast.show({ type: 'success', text1: newMuteState ? 'Muted conversation' : 'Unmuted conversation' });
        } catch (e) {
          Toast.show({ type: 'error', text1: 'Failed to update mute state' });
        }
        break;
      case 'Remind me':
        Toast.show({ type: 'success', text1: 'Reminder set' });
        break;
    }
    setTimeout(() => {
      swipeableRef.current?.close();
    }, 300);
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      onSwipeableLeftOpen={() => handleSwipeAction(swipeDmLeft)}
      onSwipeableRightOpen={() => handleSwipeAction(swipeDmRight)}
    >
      <TouchableOpacity
        style={[styles.row, containerStyle, { backgroundColor: colors.background }]}
        onPress={() => onPress?.(channel)}
        activeOpacity={0.6}
      >
        {content}
      </TouchableOpacity>
    </Swipeable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    gap: 12,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: moderateScale(16),
    fontWeight: '600',
  },
  unreadName: {
    fontWeight: '700',
  },
  lastMessage: {
    fontSize: moderateScale(13),
    marginTop: verticalScale(2),
  },
  unreadBadge: {
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(4),
    borderRadius: moderateScale(12),
    minWidth: scale(24),
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: {
    fontSize: moderateScale(12),
    fontWeight: '700',
  },
  swipeAction: {
    justifyContent: 'center',
    width: scale(75),
  },
  swipeLeft: {
    alignItems: 'flex-start',
    paddingLeft: scale(20),
  },
  swipeRight: {
    alignItems: 'flex-end',
    paddingRight: scale(20),
  },
});

export default DMListItem;
