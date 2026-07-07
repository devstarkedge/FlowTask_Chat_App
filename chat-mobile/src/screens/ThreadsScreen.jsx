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

const ThreadsScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const threads = useThreadStore(state => state.threads);
  const isLoading = useThreadStore(state => state.isLoading);
  const fetchThreads = useThreadStore(state => state.fetchThreads);
  const [refreshing, setRefreshing] = useState(false);
  const currentUser = useAuthStore(state => state.user);

  const getAttachments = useCallback((msg) => {
    if (!msg) return [];
    if (msg.fileReferences && msg.fileReferences.length > 0 && typeof msg.fileReferences[0] === 'object') {
      return msg.fileReferences;
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
    await fetchThreads();
    setRefreshing(false);
  }, [fetchThreads]);

  const handleThreadPress = useCallback((thread) => {
    let author = typeof thread.rootMessageId?.authorId === 'object' ? thread.rootMessageId.authorId : null;
    if (!author && thread.rootMessageId?.senderSnapshot) {
      author = thread.rootMessageId.senderSnapshot;
    }
    if (!author) {
      author = thread.rootMessageId?.authorId;
    }

    navigation.navigate('ThreadDetail', { 
      rootMessageId: thread.rootMessageId?._id || thread.rootMessageId,
      channelId: thread.channelId?._id || thread.channelId,
      channelName: thread.channelId?.name || 'Unknown Channel',
      rootContent: thread.rootMessageId?.content || '',
      rootHtmlContent: thread.rootMessageId?.htmlContent || '',
      rootAttachments: getAttachments(thread.rootMessageId),
      replyCount: thread.replyCount || 0,
      rootAuthor: author,
    });
  }, [navigation, getAttachments]);

  const renderMessage = useCallback((msg, isRoot = false) => {
    if (!msg) return null;
    
    let author = typeof msg.authorId === 'object' && msg.authorId?.name ? msg.authorId : null;
    if (!author && msg.senderSnapshot?.name) {
      author = msg.senderSnapshot;
    }
    if (!author) {
      author = { _id: typeof msg.authorId === 'string' ? msg.authorId : msg.authorId?._id };
    }
    
    const name = author.name || 'Unknown';
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
          <View style={{ maxHeight: 80, overflow: 'hidden' }}>
            {!!(msg.htmlContent || msg.content) && (
              <RichText
                html={msg.htmlContent || (/<[a-z][\s\S]*>/i.test(msg.content) ? msg.content : undefined)}
                text={msg.content}
                colors={{ ...colors, textPrimary: colors.textPrimary }}
                baseStyle={{ color: colors.textPrimary, fontSize: 15, lineHeight: 22 }}
              />
            )}
            {(!msg.htmlContent && !msg.content && attachments.length > 0) && (
              <Text style={{ color: colors.textSecondary, fontStyle: 'italic', fontSize: 14 }}>
                [Media attached]
              </Text>
            )}
          </View>
          {attachments.length > 0 && (
             <View style={{ marginTop: 4, width: '100%', gap: 4 }}>
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
        {renderMessage(item.rootMessageId, true)}

        {/* Latest Replies */}
        {(item.latestReplies || []).map((reply) => (
          <View key={reply._id} style={styles.replyWrapper}>
            {renderMessage(reply, false)}
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
    </ScreenLayout>
  );
};

const createStyles = (colors) => StyleSheet.create({
  listContainer: {
    paddingBottom: 40,
  },
  subHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 16,
  },
  subHeaderText: {
    fontSize: 14,
    fontWeight: '500',
  },
  threadGroup: {
    marginBottom: 16,
  },
  threadChannelHeader: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  channelTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  channelSubtitle: {
    fontSize: 13,
  },
  messageRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  messageContent: {
    flex: 1,
    marginLeft: 10,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  authorName: {
    fontSize: 15,
    fontWeight: '700',
    marginRight: 8,
  },
  timeText: {
    fontSize: 12,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  replyWrapper: {
    marginTop: 4,
  },
  replyButtonContainer: {
    paddingHorizontal: 16,
    paddingLeft: 62, // align with text
    marginTop: 4,
    marginBottom: 16,
  },
  replyButton: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  replyButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    width: '100%',
    marginTop: 8,
  }
});

export default ThreadsScreen;
