import React, { useEffect, useState, useRef } from 'react';
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
import { useThreadStore } from '../stores/threadStore';
import { useThemeStore } from '../stores/themeStore';
import { 
  CircleChevronLeft,
  MessageSquare,
  CheckCircle2,
  Circle,
  Lock,
  Hash,
} from 'lucide-react-native';

const ThreadsScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const threads = useThreadStore(state => state.threads);
  const isLoading = useThreadStore(state => state.isLoading);
  const fetchThreads = useThreadStore(state => state.fetchThreads);
  const resolveThread = useThreadStore(state => state.resolveThread);
  const unresolveThread = useThreadStore(state => state.unresolveThread);
  const [filter, setFilter] = useState('all'); // all, unread, resolved
  const [refreshing, setRefreshing] = useState(false);

  const fetchThreadsRef = useRef(fetchThreads);
  fetchThreadsRef.current = fetchThreads;

  useEffect(() => {
    console.log('ThreadsScreen mounted');
    fetchThreadsRef.current();
    return () => console.log('ThreadsScreen unmounted');
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchThreads();
    setRefreshing(false);
  };

  const filteredThreads = threads.filter(thread => {
    if (filter === 'unread') return thread.hasUnread;
    if (filter === 'resolved') return thread.isResolved;
    return true;
  });

  const handleThreadPress = (thread) => {
    navigation.navigate('ThreadDetail', { 
      threadId: thread._id,
      channelId: thread.channelId,
    });
  };

  const handleToggleResolve = async (thread) => {
    try {
      if (thread.isResolved) {
        await unresolveThread(thread._id);
      } else {
        await resolveThread(thread._id);
      }
    } catch (error) {
      console.error('Failed to toggle resolve:', error);
    }
  };

  const renderThreadItem = ({ item }) => {
    const hasUnread = item.hasUnread;
    const isResolved = item.isResolved;
    
    return (
      <TouchableOpacity
        style={[styles.threadItem, { backgroundColor: colors.card }]}
        onPress={() => handleThreadPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.threadHeader}>
          <View style={styles.threadIconContainer}>
            {item.channelId?.type === 'private' ? (
              <Lock size={16} color={colors.textSecondary} />
            ) : (
              <Hash size={16} color={colors.textSecondary} />
            )}
          </View>
          <View style={styles.threadInfo}>
            <Text 
              style={[
                styles.threadTitle, 
                { color: hasUnread ? colors.textPrimary : colors.textSecondary },
                hasUnread && styles.unreadTitle
              ]}
              numberOfLines={1}
            >
              {item.title || 'Thread'}
            </Text>
            <Text style={[styles.channelName, { color: colors.textTertiary }]} numberOfLines={1}>
              #{item.channelId?.name || 'channel'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.resolveButton}
            onPress={() => handleToggleResolve(item)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {isResolved ? (
              <CheckCircle2 size={20} color={colors.success} />
            ) : (
              <Circle size={20} color={colors.textTertiary} />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.threadMeta}>
          <View style={styles.metaItem}>
            <MessageSquare size={14} color={colors.textTertiary} />
            <Text style={[styles.metaText, { color: colors.textTertiary }]}>
              {item.replyCount || 0} {item.replyCount === 1 ? 'reply' : 'replies'}
            </Text>
          </View>
          {item.lastReplyAt && (
            <Text style={[styles.metaText, { color: colors.textTertiary }]}>
              {formatDate(item.lastReplyAt)}
            </Text>
          )}
        </View>

        {hasUnread && (
          <View style={[styles.unreadIndicator, { backgroundColor: colors.primary }]} />
        )}
      </TouchableOpacity>
    );
  };

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.effectiveTheme === 'dark' ? 'light-content' : 'dark-content'} />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
        >
          <CircleChevronLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Threads</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Filter Tabs */}
      <View style={[styles.filterContainer, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[
            styles.filterTab,
            filter === 'all' && { borderBottomColor: colors.primary }
          ]}
          onPress={() => setFilter('all')}
        >
          <Text 
            style={[
              styles.filterText,
              { color: filter === 'all' ? colors.primary : colors.textSecondary }
            ]}
          >
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterTab,
            filter === 'unread' && { borderBottomColor: colors.primary }
          ]}
          onPress={() => setFilter('unread')}
        >
          <Text 
            style={[
              styles.filterText,
              { color: filter === 'unread' ? colors.primary : colors.textSecondary }
            ]}
          >
            Unread
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterTab,
            filter === 'resolved' && { borderBottomColor: colors.primary }
          ]}
          onPress={() => setFilter('resolved')}
        >
          <Text 
            style={[
              styles.filterText,
              { color: filter === 'resolved' ? colors.primary : colors.textSecondary }
            ]}
          >
            Resolved
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : filteredThreads.length === 0 ? (
        <View style={styles.centerContainer}>
          <MessageSquare size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No threads found
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredThreads}
          renderItem={renderThreadItem}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              tintColor={colors.primary} 
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

const formatDate = (dateString) => {
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

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  filterTab: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
    gap: 12,
  },
  threadItem: {
    padding: 16,
    borderRadius: 12,
    position: 'relative',
  },
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  threadIconContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  threadInfo: {
    flex: 1,
  },
  threadTitle: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
  },
  unreadTitle: {
    fontWeight: '700',
  },
  channelName: {
    fontSize: 13,
  },
  resolveButton: {
    padding: 4,
  },
  threadMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: 44,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
  },
  unreadIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
  },
});

export default ThreadsScreen;
