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
import { useNotificationStore } from "../../stores/notificationStore";
import { useThemeStore } from "../../stores/themeStore";
import { AppAvatar, AppScreen } from "../../components/common";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "mentions", label: "Mentions" },
  { key: "replies", label: "Replies" },
];

// ─── Activity Row (Slack mobile: blue unread bar, avatar, text, time) ────────

const ActivityRow = React.memo(({ item, colors }) => {
  const senderName = item.senderName || item.sender?.name || "Someone";
  const sender = { name: senderName, avatar: item.senderAvatar || item.sender?.avatar };
  const isUnread = !item.read && !item.isRead;

  const channelName = item.channelName || item.channel?.name || "";
  const body = item.body || item.content || item.message || "";

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
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }, [item.createdAt]);

  const typeLabel = item.type === "mention" ? "mentioned you"
    : item.type === "reaction" ? "reacted to your message"
    : item.type === "reply" ? "replied to your thread"
    : item.type === "dm" ? "sent you a DM"
    : "posted";

  return (
    <View style={arStyles.container}>
      {/* Unread indicator (thin blue bar) */}
      {isUnread && (
        <View style={[arStyles.unreadBar, { backgroundColor: colors.primary }]} />
      )}
      <View style={arStyles.row}>
        <AppAvatar user={sender} size={28} showStatus={false} />
        <View style={arStyles.textCol}>
          <Text style={arStyles.body} numberOfLines={2}>
            <Text style={{ fontWeight: "700", color: colors.textPrimary }}>
              {sender.name}{" "}
            </Text>
            <Text style={{ color: colors.textSecondary }}>
              {typeLabel}
            </Text>
            {channelName ? (
              <Text style={{ color: colors.textSecondary }}>
                {" "}in{" "}
                <Text style={{ fontWeight: "600", color: colors.textPrimary }}>
                  #{channelName}
                </Text>
              </Text>
            ) : null}
          </Text>
          {body ? (
            <Text style={[arStyles.preview, { color: colors.textTertiary }]} numberOfLines={1}>
              {body}
            </Text>
          ) : null}
        </View>
        <Text style={[arStyles.time, { color: colors.textTertiary }]}>{timeStr}</Text>
      </View>
    </View>
  );
});

const arStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
  },
  unreadBar: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
    marginVertical: 4,
    marginLeft: 8,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  body: {
    fontSize: 14,
    lineHeight: 19,
  },
  preview: {
    fontSize: 13,
    lineHeight: 17,
  },
  time: {
    fontSize: 12,
    marginTop: 2,
  },
});

// ─── Main Component ──────────────────────────────────────────────────────────

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
    ({ item }) => <ActivityRow item={item} colors={colors} />,
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
                isActive && [styles.tabActive, { borderBottomColor: colors.primary }],
              ]}
              onPress={() => handleFilterChange(f.key)}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: isActive ? colors.primary : colors.textTertiary,
                    fontWeight: isActive ? "700" : "500",
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
    paddingVertical: 4,
  },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 13,
  },
  separator: {
    height: 1,
    marginLeft: 56,
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
