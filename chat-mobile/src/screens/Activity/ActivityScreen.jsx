import React, { useCallback, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { MessageSquare, AtSign, MessageCircle } from 'lucide-react-native';
import { useNotificationStore } from "../../stores/notificationStore";
import { useThemeStore } from "../../stores/themeStore";
import { AppAvatar, AppScreen } from "../../components/common";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "dms", label: "DMs" },
  { key: "mentions", label: "Mentions" },
  { key: "threads", label: "Threads" },
];


const ActivityRow = React.memo(({ item, colors, navigation }) => {
  const senderName = item.senderName || item.sender?.name || "Someone";
  const sender = { name: senderName, avatar: item.senderAvatar || item.sender?.avatar };
  
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
    const { deepLink, sourceId } = item;
    const tId = deepLink?.threadId || item.threadId;
    const cId = deepLink?.channelId || item.channelId || item.conversationId;
    const mId = deepLink?.messageId || sourceId;

    if (isThread || tId) {
      navigation.navigate('ThreadDetail', { threadId: tId, highlightedMessageId: mId });
    } else if (cId) {
      navigation.navigate('Chat', { channelId: cId, messageId: mId });
    }
  };

  return (
    <TouchableOpacity onPress={handlePress} style={[arStyles.container, !item.isRead && !item.read && { backgroundColor: colors.backgroundSecondary || (colors.primary + '08') }]} activeOpacity={0.7}>
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
        
        {body ? (
          <Text style={[arStyles.preview, { color: colors.textPrimary }]} numberOfLines={2}>
            {body}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

const arStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  avatarContainer: {
    position: 'relative',
    width: 40,
    height: 40,
  },
  badge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
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
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  time: {
    fontSize: 12,
  },
  repliedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  repliedText: {
    fontSize: 10,
    fontWeight: "600",
  },
  context: {
    fontSize: 13,
    marginBottom: 2,
  },
  preview: {
    fontSize: 15,
    lineHeight: 20,
  },
});


const ActivityScreen = ({ navigation }) => {
  if (!navigation) navigation = { navigate: () => {} };

  const { colors, effectiveTheme } = useThemeStore();
  const {
    notifications, unreadCount, fetchNotifications, markAllAsRead,
    isLoading, hasMore, cursor,
  } = useNotificationStore();

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
        <Text style={[styles.title, { color: colors.textPrimary }]}>Activity</Text>
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
        contentContainerStyle={{ paddingBottom: 40 }}
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
            <ActivityIndicator size="small" color={colors.primary} style={{ paddingVertical: 20 }} />
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
  },
  markRead: {
    fontSize: 14,
    fontWeight: "600",
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  tabText: {
    fontSize: 13,
  },
  separator: {
    height: 1,
  },
  empty: {
    alignItems: "center",
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 15,
  },
});

export default ActivityScreen;
