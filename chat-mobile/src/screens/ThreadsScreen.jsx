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
import { formatRelativeTimeLong } from '../utils/dateUtils';
import { ScreenLayout, ScreenHeader, LoadingState, EmptyState, MobileFileCard } from '../components/common';
import AppAvatar from '../components/common/AppAvatar';
import RichText from '../components/RichText';
import { MessageSquare } from 'lucide-react-native';
import logger from '../utils/logger';
import { useAuthStore } from '../stores/authStore';
import { scale, verticalScale, moderateScale } from '../utils/responsive';


const ThreadsScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const threads = useThreadStore(state => state.threads);
  const isLoading = useThreadStore(state => state.isLoading);
  const threadsPage = useThreadStore(state => state.threadsPage);
  const threadsHasMore = useThreadStore(state => state.threadsHasMore);
  const fetchThreads = useThreadStore(state => state.fetchThreads);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const currentUser = useAuthStore(state => state.user);

  const getAttachments = useCallback((msg) => {
    if (!msg) return [];
    const refs = msg.fileReferences || [];
    if (refs.length > 0) {
      return refs
        .map((ref) => {
          if (!ref.fileId) return null;
          const file = ref.fileId;
          return {
            _id: file._id,
            name: file.originalName || file.fileName || file.name || 'File',
            fileName: file.originalName || file.fileName || file.name || 'File',
            url: file.url || file.secureUrl,
            thumbnailUrl: file.thumbnailUrl,
            mimeType: file.mimeType,
            fileSize: file.fileSize || file.size || file.fileSizeBytes || 0,
          };
        })
        .filter(Boolean);
    }
    return msg.attachments || msg.files || [];
  }, []);

  const fetchThreadsRef = useRef(fetchThreads);
  fetchThreadsRef.current = fetchThreads;

  useEffect(() => {
    fetchThreadsRef.current();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchThreads(1);
    setRefreshing(false);
  }, [fetchThreads]);

  const handleLoadMore = useCallback(async () => {
    if (!threadsHasMore || loadingMore || isLoading) return;
    setLoadingMore(true);
    await fetchThreads(threadsPage + 1);
    setLoadingMore(false);
  }, [threadsHasMore, loadingMore, isLoading, threadsPage, fetchThreads]);

  const handleThreadPress = useCallback((thread) => {
    const rootMsg = thread.rootMessageId || {};
    const author = rootMsg.senderSnapshot?.name ? rootMsg.senderSnapshot : rootMsg.authorId;
    navigation.navigate('ThreadDetail', { 
      rootMessageId: rootMsg._id || rootMsg,
      channelId: thread.channelId?._id || thread.channelId,
      channelName: thread.channelId?.name || 'Unknown Channel',
      rootContent: rootMsg.content || '',
      rootHtmlContent: rootMsg.htmlContent || '',
      rootAttachments: getAttachments(rootMsg),
      replyCount: thread.replyCount || 0,
      rootAuthor: author,
      rootCreatedAt: rootMsg.createdAt,
    });
  }, [navigation, getAttachments]);

  const resolveAuthor = useCallback((msg) => {
    if (!msg) return { _id: null };
    const a = msg.authorId;
    if (a && typeof a === 'object' && (a.name || a.email || a.avatar)) return a;
    if (msg.senderSnapshot?.name) return msg.senderSnapshot;
    return { _id: typeof a === 'string' ? a : a?._id };
  }, []);

  const renderMessage = useCallback((msg, isRoot = false, channelId = null) => {
    if (!msg) return null;
    const author = resolveAuthor(msg);
    const name = author.name || author.email || 'Unknown';
    const attachments = getAttachments(msg);
    
    return (
      <View style={styles.messageRow}>
        <AppAvatar user={author} size={36} showStatus={false} />
        <View style={styles.messageContent}>
          <View style={styles.messageHeader}>
            <Text style={[styles.authorName, { color: colors.textPrimary }]}>{name}</Text>
            <Text style={[styles.timeText, { color: colors.textTertiary }]}>
              {formatRelativeTimeLong(msg.createdAt)}
            </Text>
          </View>
          <View style={{ maxHeight: verticalScale(80), overflow: 'hidden' }}>
            {!!(msg.htmlContent || msg.content) && (
              <RichText
                html={msg.htmlContent || (/<[a-z][\s\S]*>/i.test(msg.content) ? msg.content : undefined)}
                text={msg.content}
                mentions={msg.mentions}
                onMentionPress={(userId) => {
                  navigation.navigate('UserProfile', { user: { _id: userId }, channelId });
                }}
                colors={{ ...colors, textPrimary: colors.textPrimary }}
                baseStyle={{ color: colors.textPrimary, fontSize: moderateScale(15), lineHeight: 22 }}
              />
            )}
            {(!msg.htmlContent && !msg.content && attachments.length > 0) && (
              <Text style={{ color: colors.textSecondary, fontStyle: 'italic', fontSize: moderateScale(14) }}>
                [Media attached]
              </Text>
            )}
          </View>
          {attachments.length > 0 && (
             <View style={{ marginTop: verticalScale(4), width: '100%', gap: 4 }}>
                {attachments.map((file, i) => (
                  <MobileFileCard key={file._id || i} file={file} colors={colors} />
                ))}
             </View>
          )}
        </View>
      </View>
    );
  }, [colors, getAttachments]);

  const renderThreadItem = useCallback(({ item }) => {
    const channelName = item.channelId?.name || 'Unknown';
    const isDM = item.channelId?.type === 'direct';
    const dmLabel = isDM ? (channelName.includes(currentUser?.name) ? 'Just you' : 'Direct message') : '';

    return (
      <View style={styles.threadGroup}>
        {/* Thread Header (Channel Name) */}
        <View style={styles.threadChannelHeader}>
          <Text style={[styles.channelTitle, { color: colors.textPrimary }]}>
            ● {channelName}
          </Text>
          {!!dmLabel && (
            <Text style={[styles.channelSubtitle, { color: colors.textTertiary }]}>
              {dmLabel}
            </Text>
          )}
        </View>

        {/* Root Message */}
        {renderMessage(item.rootMessageId, true, item.channelId?._id || item.channelId)}

        {/* Latest Replies */}
        {(item.latestReplies || []).map((reply) => (
          <View key={reply._id} style={styles.replyWrapper}>
            {renderMessage(reply, false, item.channelId?._id || item.channelId)}
          </View>
        ))}

        {/* Reply Button */}
        <View style={styles.replyButtonContainer}>
          <TouchableOpacity 
            style={[styles.replyButton, { borderColor: colors.border }]} 
            onPress={() => handleThreadPress(item)}
          >
            <Text style={[styles.replyButtonText, { color: colors.textPrimary }]}>Reply</Text>
          </TouchableOpacity>
        </View>
        
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
      </View>
    );
  }, [colors, currentUser, handleThreadPress, renderMessage]);

  const styles = createStyles(colors);

  return (
    <ScreenLayout>
      <ScreenHeader title="Threads" onBack={() => navigation.goBack()} />

      {/* Content */}
      <View style={[styles.subHeader, { backgroundColor: colors.background }]}>
        <Text style={[styles.subHeaderText, { color: colors.textSecondary }]}>No new replies</Text>
      </View>

      {isLoading ? (
        <LoadingState />
      ) : threads.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No threads found" />
      ) : (
        <FlatList
          data={threads}
          renderItem={renderThreadItem}
          keyExtractor={(item, index) => item._id ?? String(index)}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <LoadingState /> : null}
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
    paddingBottom: verticalScale(40),
  },
  subHeader: {
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: verticalScale(16),
  },
  subHeaderText: {
    fontSize: moderateScale(14),
    fontWeight: '500',
  },
  threadGroup: {
    marginBottom: verticalScale(16),
  },
  threadChannelHeader: {
    paddingHorizontal: scale(16),
    marginBottom: verticalScale(12),
  },
  channelTitle: {
    fontSize: moderateScale(16),
    fontWeight: '700',
    marginBottom: verticalScale(2),
  },
  channelSubtitle: {
    fontSize: moderateScale(13),
  },
  messageRow: {
    flexDirection: 'row',
    paddingHorizontal: scale(16),
    marginBottom: verticalScale(12),
  },
  messageContent: {
    flex: 1,
    marginLeft: scale(10),
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: verticalScale(4),
  },
  authorName: {
    fontSize: moderateScale(15),
    fontWeight: '700',
    marginRight: scale(8),
  },
  timeText: {
    fontSize: moderateScale(12),
  },
  messageText: {
    fontSize: moderateScale(15),
    lineHeight: 22,
  },
  replyWrapper: {
    marginTop: verticalScale(4),
  },
  replyButtonContainer: {
    paddingHorizontal: scale(16),
    paddingLeft: scale(62), // align with text
    marginTop: verticalScale(4),
    marginBottom: verticalScale(16),
  },
  replyButton: {
    borderWidth: 1,
    borderRadius: moderateScale(6),
    paddingVertical: verticalScale(6),
    paddingHorizontal: scale(16),
    alignSelf: 'flex-start',
  },
  replyButtonText: {
    fontSize: moderateScale(14),
    fontWeight: '600',
  },
  divider: {
    height: verticalScale(1),
    width: '100%',
    marginTop: verticalScale(8),
  }
});

export default ThreadsScreen;
