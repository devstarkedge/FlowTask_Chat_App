/**
 * NotificationsScreen — displays notifications from the backend.
 * Uses the same notificationStore as the Activity tab.
 */
import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useThemeStore } from '../stores/themeStore';
import { useNotificationStore } from '../stores/notificationStore';
import Avatar from '../components/Avatar';
import {
  Bell,
  Heart,
  AtSign,
  MessageSquare,
  CheckCheck,
  Hash,
} from 'lucide-react-native';

const formatDate = (dateString) => {
  if (!dateString) return '';
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString();
};

const getIcon = (type, colors) => {
  const t = (type || '').toLowerCase();
  if (t.includes('mention')) return <AtSign size={16} color={colors.primary} />;
  if (t.includes('reaction')) return <Heart size={16} color={colors.error || '#e53935'} />;
  if (t.includes('thread')) return <MessageSquare size={16} color={colors.success || '#43a047'} />;
  return <Bell size={16} color={colors.textSecondary} />;
};

const NotificationsScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
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

  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();
  }, []);

  const handlePress = useCallback((item) => {
    if (!item.read) markAsRead(item._id);
    const channelId = item.channelId?._id || item.channelId;
    if (channelId) {
      navigation.navigate('Chat', {
        channelId,
        channelName: item.channelId?.name || item.channelName || 'Chat',
      });
    }
  }, [navigation, markAsRead]);

  const renderItem = useCallback(({ item }) => (
    <TouchableOpacity
      style={[styles.item, {
        backgroundColor: item.read ? 'transparent' : (colors.cardBackground || 'rgba(74,158,255,0.04)'),
      }]}
      onPress={() => handlePress(item)}
      activeOpacity={0.7}
    >
      {getIcon(item.type || item.notificationType, colors)}
      <View style={styles.info}>
        <Text style={[styles.text, { color: colors.textPrimary }]} numberOfLines={2}>
          {item.message || item.text || item.content || 'Notification'}
        </Text>
        <Text style={[styles.time, { color: colors.textTertiary }]}>
          {formatDate(item.createdAt)}
        </Text>
      </View>
      {!item.read && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
    </TouchableOpacity>
  ), [colors, handlePress]);

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header actions */}
      {unreadCount > 0 && (
        <View style={[styles.headerActions, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={markAllAsRead} style={styles.markAllBtn}>
            <CheckCheck size={16} color={colors.primary} />
            <Text style={[styles.markAllText, { color: colors.primary }]}>Mark all as read</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        onEndReached={() => {
          if (hasMore && !isLoading) fetchNotifications(cursor);
        }}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => { fetchNotifications(); fetchUnreadCount(); }}
            tintColor={colors.primary}
          />
        }
        ListFooterComponent={
          isLoading ? <ActivityIndicator style={{ margin: 16 }} color={colors.primary} /> : null
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Bell size={48} color={colors.border} />
              <Text style={styles.emptyText}>No notifications</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    headerActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderBottomWidth: 1,
    },
    markAllBtn: {
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
    list: { padding: 12, gap: 4 },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 12,
      gap: 12,
    },
    info: { flex: 1 },
    text: { fontSize: 14, lineHeight: 20, marginBottom: 4 },
    time: { fontSize: 12 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 120, gap: 12 },
    emptyText: { fontSize: 15, color: colors.textTertiary },
  });

export default NotificationsScreen;
