import React, { useCallback, useState, useMemo } from "react";
import { scale, verticalScale, moderateScale } from '../../utils/responsive';

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { MessageSquare, AtSign, MessageCircle } from 'lucide-react-native';
import { useNotificationStore } from "../../stores/notificationStore";
import { useThemeStore } from "../../stores/themeStore";
import { AppAvatar, AppScreen } from "../../components/common";
import ReplyQuotePreview from "../../components/ReplyQuotePreview";
import { hasValidReplyTo } from "../../utils/replyUtils";
import { useTranslation } from "../../utils/i18n";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "dms", label: "DMs" },
  { key: "mentions", label: "Mentions" },
  { key: "threads", label: "Threads" },
];


import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Archive, BellOff, CheckCircle, Clock, Trash2 } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { usePreferencesStore } from "../../stores/preferencesStore";

const ActivityRow = React.memo(({ item, colors, navigation }) => {
  const senderName = item.senderName || item.sender?.name || "Someone";
  const sender = { name: senderName, avatar: item.senderAvatar || item.sender?.avatar };

  const markAsRead = React.useRef(useNotificationStore.getState().markAsRead).current;
  const { swipeActivityLeft, swipeActivityRight } = usePreferencesStore();
  const swipeableRef = React.useRef(null);
  
  const channelName = item.channelName || item.channel?.name || "";
  const body = item.body || item.content || item.message || item.messagePreview || "";

  // Time formatting
  const timeStr = useMemo(() => {
    if (!item.createdAt) return "";
    const date = new Date(item.createdAt);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return "now";
    if (diffMin < 60) return `${diffMin}m`;
    if (diffHrs < 24) return `${diffHrs}h`;
    if (diffDays === 1) return "1d ago";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }, [item.createdAt]);

  const isThread = item.type === "thread_reply" || item.type?.includes("thread");
  const isDM = item.type === "dm" || item.type?.includes("direct");
  const isMention = item.type === "mention";

  const contextStr = isThread && isDM ? "Thread in Direct Message" 
    : isThread ? `Thread in #${channelName || 'channel'}`
    : isDM ? "Direct Message"
    : isMention ? `Mention in #${channelName || 'channel'}`
    : channelName ? `channel in #${channelName}`
    : "Notification";

  const handlePress = () => {
    // Mark notification as read immediately
    if (!item.isRead && !item.read && markAsRead) {
      markAsRead(item._id);
    }

    const { deepLink, sourceId, messageId } = item;
    let tId = deepLink?.threadId || item.threadId;
    const cId = deepLink?.channelId || item.channelId || item.conversationId;
    const mId = deepLink?.messageId || sourceId || messageId;

    if (isThread && !tId) {
      tId = messageId || sourceId;
    }

    if (isThread || tId) {
      navigation.navigate('Chat', {
        channelId: cId,
        channelName: item.channelName || item.channel?.name || '',
        threadId: tId,
        highlightedMessageId: mId,
      });
    } else if (cId) {
      navigation.navigate('Chat', { channelId: cId, messageId: mId });
    }
  };

  const getActionIcon = (actionStr, color) => {
    switch(actionStr) {
      case 'Mark as Read/Unread': return <CheckCircle size={24} color={color} />;
      case 'Clear/Restore': return <Trash2 size={24} color={color} />;
      case 'Remind me': return <Clock size={24} color={color} />;
      default: return <CheckCircle size={24} color={color} />;
    }
  };

  const renderLeftActions = () => {
    if (!swipeActivityLeft || swipeActivityLeft === 'None' || swipeActivityLeft === 'Nothing') return null;
    return (
      <View style={[arStyles.swipeAction, arStyles.swipeLeft, { backgroundColor: colors.primary }]}>
        {getActionIcon(swipeActivityLeft, '#FFF')}
      </View>
    );
  };

  const renderRightActions = () => {
    if (!swipeActivityRight || swipeActivityRight === 'None' || swipeActivityRight === 'Nothing') return null;
    return (
      <View style={[arStyles.swipeAction, arStyles.swipeRight, { backgroundColor: colors.statusDanger || '#ef4444' }]}>
        {getActionIcon(swipeActivityRight, '#FFF')}
      </View>
    );
  };

  const handleSwipeAction = (actionStr) => {
    switch(actionStr) {
      case 'Mark as Read/Unread':
        if (!item.isRead && !item.read && markAsRead) {
          markAsRead(item._id);
          Toast.show({ type: 'success', text1: 'Marked as read' });
        } else {
          Toast.show({ type: 'info', text1: 'Already read' });
        }
        break;
      case 'Clear/Restore':
        Alert.alert(
          "Delete Activity",
          "Are you sure you want to delete this activity?",
          [
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => {
                swipeableRef.current?.close();
              }
            },
            {
              text: "Delete",
              style: "destructive",
              onPress: () => {
                if (useNotificationStore.getState()?.deleteNotification) {
                  useNotificationStore.getState().deleteNotification(item._id);
                } else if (useNotificationStore.getState()?.clearNotifications) {
                  useNotificationStore.setState((state) => ({
                    notifications: state.notifications.filter(n => n._id !== item._id)
                  }));
                }
                Toast.show({ type: 'success', text1: 'Notification deleted' });
              }
            }
          ]
        );
        return;
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
      onSwipeableLeftOpen={() => handleSwipeAction(swipeActivityLeft)}
      onSwipeableRightOpen={() => handleSwipeAction(swipeActivityRight)}
    >
      <TouchableOpacity 
        onPress={handlePress} 
        style={[
          arStyles.container, 
          { backgroundColor: (!item.isRead && !item.read) ? (colors.backgroundSecondary || (colors.primary + '08')) : colors.background }
        ]} 
        activeOpacity={0.7}
      >
        <View style={arStyles.avatarContainer}>
          <AppAvatar user={sender} size={40} showStatus={false} />
          <View style={[arStyles.badge, { backgroundColor: colors.background, borderColor: colors.background }]}>
            {isMention ? <AtSign size={10} color={colors.textPrimary} />
              : isThread ? <MessageSquare size={10} color={colors.textPrimary} />
              : <MessageCircle size={10} color={colors.textPrimary} />
            }
          </View>
        </View>

        <View style={arStyles.textCol}>
          <View style={arStyles.headerRow}>
            <Text style={[arStyles.nameText, { color: colors.textPrimary }]} numberOfLines={1}>
              {sender.name} {isDM && isThread ? "and you" : ""}
            </Text>
            <View style={arStyles.timeRow}>
              <Text style={[arStyles.time, { color: colors.textTertiary }]}>{timeStr}</Text>
              {isThread && (
                <View style={[arStyles.repliedBadge, { backgroundColor: '#dcfce7' }]}>
                  <Text style={[arStyles.repliedText, { color: '#166534' }]}>Replied</Text>
                </View>
              )}
            </View>
          </View>
          <Text style={[arStyles.context, { color: colors.textSecondary }]}>{contextStr}</Text>

          {hasValidReplyTo(item.replyTo) ? (
            <ReplyQuotePreview
              replyTo={item.replyTo}
              colors={colors}
              variant="activity"
            />
          ) : null}
          
          {body ? (
            <Text style={[arStyles.preview, { color: colors.textPrimary }]} numberOfLines={2}>
              {body}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
});

const arStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    gap: 12,
  },
  avatarContainer: {
    position: 'relative',
    width: scale(40),
    height: scale(40),
  },
  badge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: scale(18),
    height: scale(18),
    borderRadius: moderateScale(9),
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  textCol: {
    flex: 1,
    gap: 4,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  nameText: {
    fontSize: moderateScale(15),
    fontWeight: "700",
    flex: 1,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  time: {
    fontSize: moderateScale(12),
  },
  repliedBadge: {
    paddingHorizontal: scale(6),
    paddingVertical: verticalScale(2),
    borderRadius: moderateScale(4),
  },
  repliedText: {
    fontSize: moderateScale(10),
    fontWeight: "600",
  },
  context: {
    fontSize: moderateScale(13),
    marginBottom: verticalScale(2),
  },
  preview: {
    fontSize: moderateScale(15),
    lineHeight: 20,
  },
  swipeAction: {
    justifyContent: 'center',
    width: scale(75),
    height: '100%',
  },
  swipeLeft: {
    alignItems: 'center',
  },
  swipeRight: {
    alignItems: 'center',
  },
});


const ActivityScreen = ({ navigation }) => {
  if (!navigation) navigation = { navigate: () => {} };

  const { colors, effectiveTheme } = useThemeStore();
  const {
    notifications, unreadCount, fetchNotifications, markAllAsRead,
    isLoading, hasMore, cursor,
  } = useNotificationStore();
  const { t } = useTranslation();

  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [didInitialFetch, setDidInitialFetch] = useState(false);

  // Fetch on mount
  React.useEffect(() => {
    if (!didInitialFetch) {
      setDidInitialFetch(true);
      fetchNotifications();
      useNotificationStore.getState().fetchUnreadCount();
    }
  }, [didInitialFetch, fetchNotifications]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  }, [fetchNotifications]);

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore && cursor) {
      fetchNotifications(cursor);
    }
  }, [isLoading, hasMore, cursor, fetchNotifications]);

  const handleFilterChange = useCallback(
    (key) => {
      setActiveFilter(key);
      useNotificationStore.getState().setFilter(key);
      fetchNotifications();
    },
    [fetchNotifications]
  );

  const renderItem = useCallback(
    ({ item }) => <ActivityRow item={item} colors={colors} navigation={navigation} />,
    [colors]
  );

  return (
    <AppScreen style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t("Activity")}</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllAsRead} hitSlop={8}>
            <Text style={[styles.markRead, { color: colors.primary }]}>
              Mark all read
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter tabs — minimal text links */}
      <View style={styles.tabs}>
        {FILTERS.map((f) => {
          const isActive = activeFilter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[
                styles.tab,
                isActive ? [styles.tabActive, { backgroundColor: colors.primary, borderColor: colors.primary }] 
                         : [styles.tabInactive, { backgroundColor: colors.background, borderColor: colors.border }],
              ]}
              onPress={() => handleFilterChange(f.key)}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: isActive ? '#FFFFFF' : colors.textSecondary,
                    fontWeight: isActive ? "600" : "500",
                  },
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List */}
      <FlatList
        data={notifications || []}
        keyExtractor={(item) => item._id || String(item.createdAt)}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        contentContainerStyle={{ paddingBottom: verticalScale(40) }}
        ItemSeparatorComponent={<View style={[styles.separator, { backgroundColor: colors.border }]} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          !isLoading && !refreshing ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                No activity yet
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          isLoading && !refreshing ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ paddingVertical: verticalScale(20) }} />
          ) : null
        }
      />
    </AppScreen>
  );
};


const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    borderBottomWidth: 1,
  },
  title: {
    fontSize: moderateScale(17),
    fontWeight: "800",
  },
  markRead: {
    fontSize: moderateScale(14),
    fontWeight: "600",
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(12),
    gap: 8,
  },
  tab: {
    paddingVertical: verticalScale(6),
    paddingHorizontal: scale(14),
    borderRadius: moderateScale(16),
    borderWidth: 1,
  },
  tabText: {
    fontSize: moderateScale(13),
  },
  separator: {
    height: scale(1),
  },
  empty: {
    alignItems: "center",
    paddingTop: verticalScale(60),
  },
  emptyText: {
    fontSize: moderateScale(15),
  },
});

export default ActivityScreen;