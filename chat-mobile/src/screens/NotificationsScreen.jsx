/**
 * NotificationsScreen — notification preferences + feed.
 * Slack-like: preference controls at top, notification list below.
 */
import React, { useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeStore } from "../stores/themeStore";
import { useNotificationStore } from "../stores/notificationStore";
import { useNotificationPrefStore } from "../stores/notificationPrefStore";
import { formatRelativeTime } from "../utils/dateUtils";
import { AppAvatar } from "../components/common";
import {
  Bell,
  BellOff,
  Heart,
  AtSign,
  MessageSquare,
  CheckCheck,
  ArrowLeft,
  Volume2,
  VolumeX,
} from "lucide-react-native";

// ─── Notification Level Option ────────────────────────────────────────────────

const LevelOption = React.memo(
  ({ label, description, isActive, onPress, colors, icon: Icon }) => (
    <TouchableOpacity
      style={[
        levelStyles.option,
        {
          backgroundColor: isActive ? colors.primary + "15" : colors.card,
          borderColor: isActive ? colors.primary : colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Icon size={18} color={isActive ? colors.primary : colors.textSecondary} />
      <View style={levelStyles.textWrap}>
        <Text
          style={[
            levelStyles.label,
            { color: isActive ? colors.primary : colors.textPrimary },
          ]}
        >
          {label}
        </Text>
        <Text style={[levelStyles.desc, { color: colors.textTertiary }]}>
          {description}
        </Text>
      </View>
    </TouchableOpacity>
  )
);

const levelStyles = StyleSheet.create({
  option: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 12,
    marginBottom: 8,
  },
  textWrap: { flex: 1 },
  label: { fontSize: 14, fontWeight: "600" },
  desc: { fontSize: 12, marginTop: 2 },
});

// ─── Get notification icon ───────────────────────────────────────────────────

const getIcon = (type, colors) => {
  const t = (type || "").toLowerCase();
  if (t.includes("mention")) return <AtSign size={16} color={colors.primary} />;
  if (t.includes("reaction")) return <Heart size={16} color={colors.error} />;
  if (t.includes("thread"))
    return <MessageSquare size={16} color={colors.success} />;
  return <Bell size={16} color={colors.textSecondary} />;
};

// ─── Main Screen ─────────────────────────────────────────────────────────────

const NotificationsScreen = ({ navigation }) => {
  const { colors, effectiveTheme } = useThemeStore();
  const {
    notifications,
    unreadCount,
    isLoading,
    hasMore,
    cursor,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
  } = useNotificationStore();

  const {
    level,
    isPaused,
    isLoading: prefsLoading,
    fetchPreferences,
    updateLevel,
    pauseNotifications,
    resumeNotifications,
  } = useNotificationPrefStore();

  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();
    fetchPreferences();
  }, []);

  const handlePress = useCallback(
    (item) => {
      if (!item.read) markAsRead(item._id);
      const channelId = item.channelId?._id || item.channelId;
      if (channelId) {
        navigation.navigate("Chat", {
          channelId,
          channelName: item.channelId?.name || item.channelName || "Chat",
        });
      }
    },
    [navigation, markAsRead]
  );

  const renderItem = useCallback(
    ({ item }) => {
      const sender = item.sender || item.senderId;
      return (
        <TouchableOpacity
          style={[
            itemStyles.row,
            { borderBottomColor: colors.border },
            !item.read && { backgroundColor: colors.card },
          ]}
          onPress={() => handlePress(item)}
          activeOpacity={0.6}
        >
          {/* Unread bar */}
          {!item.read && (
            <View style={[itemStyles.unreadBar, { backgroundColor: colors.primary }]} />
          )}
          {sender && typeof sender === "object" && sender.name ? (
            <AppAvatar user={sender} size={36} showStatus={false} />
          ) : (
            <View
              style={[
                itemStyles.iconWrap,
                { backgroundColor: colors.backgroundSecondary || colors.card },
              ]}
            >
              {getIcon(item.type || item.notificationType, colors)}
            </View>
          )}
          <View style={itemStyles.info}>
            <Text
              style={[
                itemStyles.text,
                { color: colors.textPrimary },
                !item.read && { fontWeight: "600" },
              ]}
              numberOfLines={2}
            >
              {item.message || item.text || item.content || "Notification"}
            </Text>
            <Text style={[itemStyles.time, { color: colors.textTertiary }]}>
              {formatRelativeTime(item.createdAt)}
            </Text>
          </View>
        </TouchableOpacity>
      );
    },
    [colors, handlePress]
  );

  // Preference section as ListHeader
  const ListHeader = (
    <View>
      {/* Notification Level */}
      <View style={[styles.section, { borderBottomColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          NOTIFICATION LEVEL
        </Text>
        <LevelOption
          icon={Volume2}
          label="All messages"
          description="Get notified for every message"
          isActive={level === "all"}
          onPress={() => updateLevel("all")}
          colors={colors}
        />
        <LevelOption
          icon={AtSign}
          label="Mentions only"
          description="Only when someone mentions you"
          isActive={level === "mentions"}
          onPress={() => updateLevel("mentions")}
          colors={colors}
        />
        <LevelOption
          icon={VolumeX}
          label="Nothing"
          description="No notifications at all"
          isActive={level === "nothing"}
          onPress={() => updateLevel("nothing")}
          colors={colors}
        />
      </View>

      {/* DND / Pause */}
      <View style={[styles.section, { borderBottomColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          DO NOT DISTURB
        </Text>
        {isPaused ? (
          <TouchableOpacity
            style={[styles.dndButton, { backgroundColor: colors.primary }]}
            onPress={resumeNotifications}
          >
            <Bell size={16} color="#fff" />
            <Text style={[styles.dndText, { color: "#fff" }]}>
              Resume notifications
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.dndRow}>
            {[30, 60, 120].map((mins) => (
              <TouchableOpacity
                key={mins}
                style={[
                  styles.dndChip,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
                onPress={() => pauseNotifications(mins)}
                activeOpacity={0.7}
              >
                <BellOff size={14} color={colors.textSecondary} />
                <Text style={[styles.dndChipText, { color: colors.textSecondary }]}>
                  {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Mark all read */}
      {unreadCount > 0 && (
        <View style={[styles.markAllRow, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={markAllAsRead} style={styles.markAllBtn}>
            <CheckCheck size={16} color={colors.primary} />
            <Text style={[styles.markAllText, { color: colors.primary }]}>
              Mark all as read
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={8}
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Notifications
        </Text>
        {unreadCount > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={styles.badgeText}>{unreadCount}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={11}
        removeClippedSubviews={Platform.OS !== "web"}
        onEndReached={() => {
          if (hasMore && !isLoading) fetchNotifications(cursor);
        }}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              fetchNotifications();
              fetchUnreadCount();
              fetchPreferences();
            }}
            tintColor={colors.primary}
          />
        }
        ListFooterComponent={
          isLoading ? (
            <ActivityIndicator style={{ margin: 16 }} color={colors.primary} />
          ) : null
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Bell size={40} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No notifications
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
};

const itemStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 0.5,
    overflow: "hidden",
  },
  unreadBar: {
    width: 3,
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  info: { flex: 1 },
  text: { fontSize: 14, lineHeight: 20, marginBottom: 4 },
  time: { fontSize: 12 },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  backButton: { padding: 4 },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  section: {
    padding: 16,
    borderBottomWidth: 0.5,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  dndRow: {
    flexDirection: "row",
    gap: 8,
  },
  dndChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  dndChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  dndButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  dndText: {
    fontSize: 14,
    fontWeight: "600",
  },
  markAllRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  markAllText: {
    fontSize: 13,
    fontWeight: "600",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
  },
});

export default NotificationsScreen;
