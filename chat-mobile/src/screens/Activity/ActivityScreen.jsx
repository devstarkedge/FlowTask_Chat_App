/**
 * ActivityScreen — fetches real notification data from backend.
 * Matches web app NotificationPanel with filter tabs, mark as read,
 * pagination, and navigation to source messages.
 */
import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { useThemeStore } from '../../stores/themeStore';
import { useNotificationStore } from '../../stores/notificationStore';
import Avatar from '../../components/Avatar';
import {
  Bell,
  MessageSquare,
  Heart,
  AtSign,
  Hash,
  CheckCheck,
  User,
  AlertCircle,
  RefreshCw,
} from 'lucide-react-native';

const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
};

const getNotificationIcon = (type, colors) => {
  const t = (type || '').toLowerCase();
  if (t.includes('mention')) return <AtSign size={16} color={colors.primary} />;
  if (t.includes('reaction')) return <Heart size={16} color={colors.error || '#e53935'} />;
  if (t.includes('thread')) return <MessageSquare size={16} color={colors.success || '#43a047'} />;
  if (t.includes('dm') || t.includes('direct')) return <User size={16} color={colors.primary} />;
  return <Bell size={16} color={colors.textSecondary} />;
};

const getNotificationText = (notification) => {
  // Try various text fields the server might send
  return (
    notification.message ||
    notification.text ||
    notification.content ||
    notification.body ||
    `${notification.senderName || 'Someone'} ${notification.action || 'interacted with'} ${notification.targetType || 'a message'}`
  );
};

const ActivityScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    hasMore,
    cursor,
    activeFilter,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    setFilter,
    getFilteredNotifications,
  } = useNotificationStore();

  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();
  }, []);

  const filteredNotifications = getFilteredNotifications();

  const onRefresh = useCallback(async () => {
    await fetchNotifications();
    await fetchUnreadCount();
  }, []);

  const handlePressNotification = useCallback((notification) => {
    // Mark as read
    if (!notification.read) {
      markAsRead(notification._id);
    }

    // Navigate to source
    const channelId = notification.channelId?._id || notification.channelId;
    const channelName = notification.channelId?.name || notification.channelName;
    if (channelId) {
      navigation.navigate('Chat', {
        channelId,
        channelName: channelName || 'Chat',
        messageId: notification.messageId?._id || notification.messageId,
      });
    }
  }, [navigation, markAsRead]);

  const renderNotification = useCallback(({ item }) => {
    const sender = item.sender || item.senderId;

    return (
      <TouchableOpacity
        style={[styles.activityItem, {
          backgroundColor: item.read ? 'transparent' : (colors.cardBackground || 'rgba(74,158,255,0.04)'),
        }]}
        onPress={() => handlePressNotification(item)}
        activeOpacity={0.7}
      >
        {/* Icon or avatar */}
        {sender && (typeof sender === 'object' && sender.name) ? (
          <Avatar user={sender} size={36} showStatus={false} />
        ) : (
          <View style={[styles.iconContainer, { backgroundColor: colors.cardBackground || 'rgba(255,255,255,0.05)' }]}>
            {getNotificationIcon(item.type || item.notificationType, colors)}
          </View>
        )}

        {/* Content */}
        <View style={styles.activityInfo}>
          <Text style={[styles.activityText, { color: colors.textPrimary }]} numberOfLines={2}>
            {getNotificationText(item)}
          </Text>
          <View style={styles.activityMeta}>
            {(item.channelId?.name || item.channelName) && (
              <View style={styles.channelBadge}>
                <Hash size={10} color={colors.textTertiary} />
                <Text style={[styles.channelName, { color: colors.textTertiary }]}>
                  {item.channelId?.name || item.channelName}
                </Text>
              </View>
            )}
            <Text style={[styles.activityTime, { color: colors.textTertiary }]}>
              {formatDate(item.createdAt)}
            </Text>
          </View>
        </View>

        {/* Unread dot */}
        {!item.read && (
          <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
        )}
      </TouchableOpacity>
    );
  }, [colors, handlePressNotification]);

  const styles = createStyles(colors);
  const filters = [
    { key: 'all', label: 'All' },
    { key: 'mentions', label: 'Mentions' },
    { key: 'reactions', label: 'Reactions' },
    { key: 'threads', label: 'Threads' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.effectiveTheme === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Activity</Text>
        {unreadCount > 0 && (
          <View style={[styles.badgeContainer, { backgroundColor: colors.primary }]}>
            <Text style={styles.badgeText}>{unreadCount}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllAsRead} style={styles.markAllButton}>
            <CheckCheck size={18} color={colors.primary} />
            <Text style={[styles.markAllText, { color: colors.primary }]}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={[styles.filterContainer, { borderBottomColor: colors.border }]}>
        {filters.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[
              styles.filterTab,
              activeFilter === f.key && { borderBottomColor: colors.primary },
            ]}
            onPress={() => setFilter(f.key)}
          >
            <Text
              style={[
                styles.filterText,
                { color: activeFilter === f.key ? colors.primary : colors.textSecondary },
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {error && filteredNotifications.length === 0 ? (
        <View style={styles.centerContainer}>
          <AlertCircle size={48} color={colors.error || '#e53935'} />
          <Text style={[styles.emptyText, { color: colors.textPrimary }]}>
            Something went wrong
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            {error}
          </Text>
          <TouchableOpacity
            onPress={() => { fetchNotifications(); fetchUnreadCount(); }}
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
          >
            <RefreshCw size={14} color="#fff" />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : isLoading && filteredNotifications.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : filteredNotifications.length === 0 ? (
        <View style={styles.centerContainer}>
          <Bell size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No activity yet
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textTertiary }]}>
            Mentions, reactions, and thread replies will appear here
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredNotifications}
          renderItem={renderNotification}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (hasMore && !isLoading) {
              fetchNotifications(cursor);
            }
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isLoading ? (
              <ActivityIndicator style={{ margin: 16 }} color={colors.primary} />
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  badgeContainer: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  markAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  markAllText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  filterTab: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
  },
  listContainer: {
    padding: 12,
    gap: 4,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityInfo: {
    flex: 1,
  },
  activityText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  activityMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  channelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  channelName: {
    fontSize: 12,
  },
  activityTime: {
    fontSize: 12,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    marginTop: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ActivityScreen;
