import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useThreadStore } from '../stores/threadStore';
import { useThemeStore } from '../stores/themeStore';
import { formatRelativeTime } from '../utils/dateUtils';
import { ScreenLayout, ScreenHeader, FilterTabs, LoadingState, EmptyState } from '../components/common';
import { 
  MessageSquare,
  CheckCircle2,
  Circle,
  Lock,
  Hash,
} from 'lucide-react-native';
import logger from '../utils/logger';

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
    fetchThreadsRef.current();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchThreads();
    setRefreshing(false);
  }, [fetchThreads]);

  const filteredThreads = useMemo(() => threads.filter(thread => {
    if (filter === 'unread') return thread.hasUnread;
    if (filter === 'resolved') return thread.isResolved;
    return true;
  }), [threads, filter]);

  const handleThreadPress = useCallback((thread) => {
    navigation.navigate('ThreadDetail', { 
      threadId: thread._id,
      channelId: thread.channelId,
    });
  }, [navigation]);

  const handleToggleResolve = useCallback(async (thread) => {
    try {
      if (thread.isResolved) {
        await unresolveThread(thread._id);
      } else {
        await resolveThread(thread._id);
      }
    } catch (error) {
      logger.error('Failed to toggle resolve:', error);
    }
  }, [resolveThread, unresolveThread]);

  const renderThreadItem = useCallback(({ item }) => {
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
              {formatRelativeTime(item.lastReplyAt)}
            </Text>
          )}
        </View>

        {hasUnread && (
          <View style={[styles.unreadIndicator, { backgroundColor: colors.primary }]} />
        )}
      </TouchableOpacity>
    );
  }, [colors, handleThreadPress, handleToggleResolve]);

  const styles = createStyles(colors);
  const filterTabs = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread' },
    { key: 'resolved', label: 'Resolved' },
  ];

  return (
    <ScreenLayout>
      <ScreenHeader title="Threads" onBack={() => navigation.goBack()} />
      <FilterTabs tabs={filterTabs} activeTab={filter} onTabChange={setFilter} />

      {/* Content */}
      {isLoading ? (
        <LoadingState />
      ) : filteredThreads.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No threads found" />
      ) : (
        <FlatList
          data={filteredThreads}
          renderItem={renderThreadItem}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              tintColor={colors.primary} 
            />
          }
        />
      )}
    </ScreenLayout>
  );
};

const createStyles = (colors) => StyleSheet.create({
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
});

export default ThreadsScreen;
