import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useThemeStore } from '../stores/themeStore';
import Avatar from './Avatar';

/**
 * Shared DM list row used in both HomeScreen DM section and DMListScreen.
 * Renders identical avatar, name, last message, presence, and unread badge.
 *
 * @param {object}   props.channel      - DM channel object (from channelStore)
 * @param {Function} props.onPress      - Called with (channel) when row is tapped
 * @param {number}   [props.unreadCount=0] - Unread message count for badge
 * @param {object}   [props.containerStyle] - Optional outer container style override
 * @param {boolean}  [props.touchable=true] - When false, renders without TouchableOpacity (for use inside another touchable)
 */
const DMListItem = React.memo(({ channel, onPress, unreadCount = 0, containerStyle, touchable = true }) => {
  const { colors } = useThemeStore();

  // Build the same dmUser object used across the app
  const dmUser = {
    _id: channel.dmRecipientId,
    name: channel.name,
    avatar: channel.avatar,
    onlineStatus: channel.onlineStatus || 'offline',
  };

  const content = (
    <>
      <Avatar user={dmUser} size={44} showStatus />

      <View style={styles.info}>
        <Text
          style={[
            styles.name,
            { color: colors.textPrimary },
            unreadCount > 0 && styles.unreadName,
          ]}
          numberOfLines={1}
        >
          {dmUser.name}
        </Text>
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

  return (
    <TouchableOpacity
      style={[styles.row, containerStyle, { backgroundColor: colors.background }]}
      onPress={() => onPress?.(channel)}
      activeOpacity={0.6}
    >
      {content}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
  },
  unreadName: {
    fontWeight: '700',
  },
  lastMessage: {
    fontSize: 13,
    marginTop: 2,
  },
  unreadBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: {
    fontSize: 12,
    fontWeight: '700',
  },
});

export default DMListItem;
