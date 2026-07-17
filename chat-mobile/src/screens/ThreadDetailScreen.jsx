import React, { useState, useEffect, useRef, useCallback } from 'react';
import { scale, verticalScale, moderateScale } from '../utils/responsive';

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
  Share as RNShare,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { useThreadStore } from '../stores/threadStore';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { useChatStore } from '../stores/chatStore';
import { useLaterStore } from '../stores/laterStore';
import { laterAPI, messageAPI, threadAPI } from '../services/api';
import { formatRelativeTimeLong, formatMessageTime } from '../utils/dateUtils';
import { ScreenLayout, AppAvatar, HeaderBackButton, MobileFileCard } from '../components/common';
import RichText from '../components/RichText';
import ReactionBar from '../components/ReactionBar';
import EmojiPickerModal from '../components/EmojiPickerModal';
import ReminderModal from '../components/ReminderModal';
import ForwardMessageModal from '../components/ForwardMessageModal';
import MessageActionSheet from '../components/MessageActionSheet';
import MessageComposer from '../components/MessageComposer';
import {
  ArrowLeft,
  Headphones,
  Bookmark,
  Share,
  MoreVertical,
} from 'lucide-react-native';

const ThreadDetailScreen = ({ route, navigation }) => {
  const {
    rootMessageId,
    channelId,
    channelName,
    rootContent,
    rootHtmlContent,
    rootAttachments,
    replyCount: initialReplyCount,
    rootAuthor,
    rootCreatedAt,
    highlightedMessageId,
  } = route.params;

  const { colors } = useThemeStore();
  const { user } = useAuthStore();
  const {
    threadRepliesByRoot,
    fetchThreadReplies,
    sendThreadReply,
    isLoadingReplies,
    threadHasMore,
  } = useThreadStore();
  const { addReaction, removeReaction } = useChatStore();
  // Also subscribe to chatStore messages so root message reactions update in real time
  const rootMessageLive = useChatStore((s) =>
    (s.messagesByChannel[channelId] || []).find(m => m._id === rootMessageId)
  );
  const toggleSaveMessage = useLaterStore((s) => s.toggleSaveMessage);
  const isMessageSaved = useLaterStore((s) => s.isMessageSaved);

  const [replyText, setReplyText] = useState('');
  const [editingMessage, setEditingMessage] = useState(null);
  const [emojiPickerTarget, setEmojiPickerTarget] = useState(null);
  const [actionMenuTarget, setActionMenuTarget] = useState(null);
  const [reminderTarget, setReminderTarget] = useState(null);
  const [forwardTarget, setForwardTarget] = useState(null);
  const flatListRef = useRef(null);

  const showMessageActions = useCallback((item) => {
    setActionMenuTarget(item);
  }, []);

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

  // Subscribe to real-time reply updates
  const rawReplies = useThreadStore((s) => s.threadRepliesByRoot[rootMessageId]);
  const replies = rawReplies || [];

  useEffect(() => {
    fetchThreadReplies(rootMessageId);
  }, [rootMessageId]);

  useEffect(() => {
    if (highlightedMessageId && replies.length > 0) {
      const index = replies.findIndex((r) => r._id === highlightedMessageId);
      if (index !== -1 && flatListRef.current) {
        // Delay to allow layout
        setTimeout(() => {
          try {
            flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
          } catch (e) {
            console.log("Could not scroll to reply:", e);
          }
        }, 500);
      }
    }
  }, [highlightedMessageId, replies.length > 0]);

  const handleSendReply = async (content, options) => {
    try {
      if (editingMessage) {
        if (editingMessage._id === rootMessageId) {
          // Editing root message
          const { editMessage } = useChatStore.getState();
          await editMessage(rootMessageId, channelId, content, options?.htmlContent);
        } else {
          // Editing reply
          await useThreadStore.getState().editThreadReply(rootMessageId, editingMessage._id, content, options?.htmlContent);
        }
        setEditingMessage(null);
      } else {
        await sendThreadReply(rootMessageId, channelId, content, options);
      }
    } catch (err) {
      console.error('Failed to send reply:', err);
      Toast.show({ type: 'error', text1: 'Failed to send reply' });
    }
  };

  const effectiveRoot = rootMessageLive || {
    _id: rootMessageId,
    content: rootContent,
    htmlContent: rootHtmlContent,
    attachments: rootAttachments || [],
    senderSnapshot: rootAuthor,
    authorId: rootAuthor,
    createdAt: rootCreatedAt || new Date().toISOString(),
    replyCount: initialReplyCount,
  };

  const getAuthorId = (msg) => {
    if (!msg) return null;
    if (typeof msg.authorId === "string") return msg.authorId;
    return msg.authorId?._id || msg.senderSnapshot?._id || null;
  };

  const resolveAuthor = useCallback((msg) => {
    if (!msg) return { _id: null };
    const a = msg.authorId;
    if (a && typeof a === 'object' && (a.name || a.email || a.avatar)) return a;
    if (msg.senderSnapshot?.name) return msg.senderSnapshot;
    return { _id: typeof a === 'string' ? a : a?._id };
  }, []);

  const renderReply = useCallback(({ item, index }) => {
    const sender = resolveAuthor(item);
    const name = sender?.name || sender?.email || 'Unknown';
    const isMe = getAuthorId(item) === user?._id;
    const itemAttachments = getAttachments(item);
    const isHighlighted = item._id === highlightedMessageId;

    const prevItem = replies[index - 1];
    let showToday = false;
    if (!prevItem && new Date(item.createdAt).toDateString() === new Date().toDateString()) {
      showToday = true;
    }

    return (
      <View key={item._id}>
        {showToday && (
          <View style={styles.dateSeparator}>
            <View style={[styles.dateLine, { backgroundColor: colors.border }]} />
            <View style={[styles.datePill, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.dateText, { color: colors.textSecondary }]}>Today</Text>
            </View>
            <View style={[styles.dateLine, { backgroundColor: colors.border }]} />
          </View>
        )}
        <TouchableOpacity 
          style={[styles.messageRow, isHighlighted && { backgroundColor: colors.primary + '20' }]}
          onLongPress={() => showMessageActions(item)}
          activeOpacity={0.85}
          delayLongPress={300}
        >
          <AppAvatar user={sender} size={36} showStatus={false} />
          <View style={styles.messageContent}>
            <View style={styles.messageHeader}>
              <Text style={[styles.authorName, { color: colors.textPrimary }]}>{name}</Text>
              <Text style={[styles.timeText, { color: colors.textTertiary }]}>
                {formatRelativeTimeLong(item.createdAt).replace(' minutes', 'm').replace(' hours', 'h').replace(' days', 'd')}
              </Text>
            </View>
            <View style={{ maxHeight: verticalScale(250), overflow: 'hidden' }}>
              {!!(item.htmlContent || item.content) && (
                <RichText
                  html={item.htmlContent || (/<[a-z][\s\S]*>/i.test(item.content) ? item.content : undefined)}
                  text={item.content}
                  mentions={item.mentions}
                  onMentionPress={(userId) => {
                    navigation.navigate('UserProfile', { user: { _id: userId }, channelId });
                  }}
                  colors={{ ...colors, textPrimary: colors.textPrimary }}
                  baseStyle={{ color: colors.textPrimary, fontSize: moderateScale(15), lineHeight: 22 }}
                />
              )}
              {(!item.htmlContent && !item.content && itemAttachments.length > 0) && (
                <Text style={{ color: colors.textSecondary, fontStyle: 'italic', fontSize: moderateScale(14) }}>
                  [Media attached]
                </Text>
              )}
            </View>
            {itemAttachments.length > 0 && (
               <View style={{ marginTop: verticalScale(4), width: '100%', gap: 4 }}>
                  {itemAttachments.map((file, i) => (
                    <MobileFileCard key={file._id || i} file={file} colors={colors} />
                  ))}
               </View>
            )}
            <ReactionBar
              reactions={item.reactions}
              messageId={item._id}
              currentUserId={user?._id}
              onAddReaction={(emoji) => addReaction(item._id, emoji)}
              onRemoveReaction={(emoji) => removeReaction(item._id, emoji)}
              onOpenPicker={() => setEmojiPickerTarget(item._id)}
              colors={colors}
            />
          </View>
        </TouchableOpacity>
      </View>
    );
  }, [colors, user, replies, getAttachments]);

  const styles = createStyles(colors);
  
  let effectiveRootSender = resolveAuthor(effectiveRoot);
  if (!effectiveRootSender.name && !effectiveRootSender.email && rootAuthor) {
    effectiveRootSender = resolveAuthor({ authorId: rootAuthor, senderSnapshot: rootAuthor });
  }
  const rootDateStr = new Date(effectiveRoot.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const rootTimeStr = formatMessageTime(effectiveRoot.createdAt);
  const effectiveRootAttachments = getAttachments(effectiveRoot);

  return (
    <ScreenLayout>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <HeaderBackButton onPress={() => navigation.goBack()} />
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            Thread
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {channelName ? `#${channelName}` : 'Message'}
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
            }, 500);
          }}
          data={replies}
          renderItem={renderReply}
          keyExtractor={(item, index) => item._id ?? String(index)}
          contentContainerStyle={styles.repliesList}
          initialNumToRender={15}
          onEndReached={() => {
            if (threadHasMore[rootMessageId] && !isLoadingReplies) {
              const oldest = replies[0];
              if (oldest) fetchThreadReplies(rootMessageId, oldest._id);
            }
          }}
          ListHeaderComponent={
            <View style={[styles.rootSection, highlightedMessageId === effectiveRoot._id && { backgroundColor: colors.primary + '20' }]}>
              <View style={styles.rootMessageRow}>
                <AppAvatar user={effectiveRootSender} size={42} showStatus={false} />
                <View style={styles.rootMessageContent}>
                  <View style={styles.rootMessageHeaderLine}>
                    <Text style={[styles.rootAuthorName, { color: colors.textPrimary }]}>
                    {effectiveRootSender?.name || effectiveRootSender?.email || 'Unknown'}
                    </Text>
                    <TouchableOpacity onPress={() => {
                      const saved = isMessageSaved?.(effectiveRoot._id);
                      toggleSaveMessage?.(effectiveRoot._id);
                      if (!saved) {
                        setTimeout(() => setReminderTarget(effectiveRoot._id), 200);
                      }
                    }}>
                      <Bookmark size={20} color={isMessageSaved?.(effectiveRoot._id) ? colors.warning : colors.textSecondary} fill={isMessageSaved?.(effectiveRoot._id) ? colors.warning : 'transparent'} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.rootDateTime, { color: colors.textSecondary }]}>
                    {rootDateStr} at {rootTimeStr}
                  </Text>
                </View>
              </View>

              <View style={styles.rootTextContainer}>
                {!!(effectiveRoot.htmlContent || effectiveRoot.content) && (
                  <RichText
                    html={effectiveRoot.htmlContent || (/<[a-z][\s\S]*>/i.test(effectiveRoot.content) ? effectiveRoot.content : undefined)}
                    text={effectiveRoot.content}
                    mentions={effectiveRoot.mentions}
                    onMentionPress={(userId) => {
                      navigation.navigate('UserProfile', { user: { _id: userId }, channelId });
                    }}
                    colors={{ ...colors, textPrimary: colors.textPrimary }}
                    baseStyle={{ color: colors.textPrimary, fontSize: moderateScale(16), lineHeight: 24 }}
                  />
                )}
                {(!effectiveRoot.htmlContent && !effectiveRoot.content && effectiveRootAttachments.length > 0) && (
                  <Text style={{ color: colors.textSecondary, fontStyle: 'italic', fontSize: moderateScale(15) }}>
                    [Media attached]
                  </Text>
                )}
              </View>
              {effectiveRootAttachments.length > 0 && (
                 <View style={{ marginTop: verticalScale(8), width: '100%', gap: 4, paddingHorizontal: scale(16) }}>
                    {effectiveRootAttachments.map((file, i) => (
                      <MobileFileCard key={file._id || i} file={file} colors={colors} />
                    ))}
                 </View>
              )}

              <View style={{ flexDirection: 'row', paddingHorizontal: scale(16), marginTop: verticalScale(12) }}>
                <ReactionBar
                  reactions={effectiveRoot.reactions}
                  messageId={effectiveRoot._id}
                  currentUserId={user?._id}
                  onAddReaction={(emoji) => addReaction(effectiveRoot._id, emoji)}
                  onRemoveReaction={(emoji) => removeReaction(effectiveRoot._id, emoji)}
                  onOpenPicker={() => setEmojiPickerTarget(effectiveRoot._id)}
                  colors={colors}
                />
              </View>

              <View style={[styles.repliesDivider, { borderTopColor: colors.border }]}>
                <Text style={[styles.repliesCount, { color: colors.textPrimary }]}>
                  {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                </Text>
                <View style={styles.dividerActions}>
                  <TouchableOpacity style={styles.actionIcon} onPress={() => setForwardTarget(effectiveRoot)}>
                    <Share size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionIcon} onPress={() => showMessageActions(effectiveRoot)}>
                    <MoreVertical size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          }
        />

        {/* Input */}
        {/* Input using MessageComposer */}
        <MessageComposer
          channelId={channelId}
          channelName={channelName}
          colors={colors}
          text={replyText}
          onChangeText={setReplyText}
          onSend={handleSendReply}
          editingMessage={editingMessage}
          onCancelEdit={() => { setEditingMessage(null); setReplyText(''); }}
        />
      </KeyboardAvoidingView>

      <EmojiPickerModal
        visible={!!emojiPickerTarget}
        onClose={() => setEmojiPickerTarget(null)}
        onSelect={(emoji) => {
          if (emojiPickerTarget) {
            addReaction(emojiPickerTarget, emoji);
          }
          setEmojiPickerTarget(null);
        }}
        colors={colors}
      />

      {/* Reminder Modal */}
      <ReminderModal
        visible={!!reminderTarget}
        onClose={() => setReminderTarget(null)}
        onSetReminder={async (reminderAt) => {
          if (reminderTarget) {
            try {
              await laterAPI.updateReminder(reminderTarget, { reminderAt });
            } catch (err) {
              console.error('Failed to set reminder:', err);
            }
          }
        }}
        colors={colors}
      />

      {/* Custom Message Actions Modal */}
      <MessageActionSheet
        visible={!!actionMenuTarget}
        onClose={() => setActionMenuTarget(null)}
        message={actionMenuTarget}
        colors={colors}
        user={user}
        isSaved={isMessageSaved?.(actionMenuTarget?._id)}
        onReact={(emoji) => {
          if (actionMenuTarget) addReaction(actionMenuTarget._id, emoji);
        }}
        onOpenEmojiPicker={() => setEmojiPickerTarget(actionMenuTarget?._id)}
        onForward={() => setForwardTarget(actionMenuTarget)}
        onSave={() => toggleSaveMessage?.(actionMenuTarget?._id)}
        onRemind={() => setReminderTarget(actionMenuTarget?._id)}
        onEdit={() => {
          setEditingMessage(actionMenuTarget);
          setReplyText(actionMenuTarget.htmlContent || actionMenuTarget.content || '');
          setActionMenuTarget(null);
        }}
        onDelete={() => {
          const targetId = actionMenuTarget._id;
          const isRoot = targetId === rootMessageId;
          setTimeout(() => {
            Alert.alert('Delete Message', 'Are you sure you want to delete this message?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  setActionMenuTarget(null);
                  try {
                    if (isRoot) {
                      const { deleteMessage: del } = useChatStore.getState();
                      await del(targetId, channelId);
                      navigation.goBack();
                    } else {
                      await useThreadStore.getState().deleteThreadReply(rootMessageId, targetId);
                    }
                  } catch (err) {
                    Toast.show({ type: 'error', text1: 'Failed to delete message' });
                  }
                },
              },
            ]);
          }, 200);
        }}
        onCopyLink={async () => {
          const url = `flowtask://chat/${channelId}/${actionMenuTarget?._id}`;
          await Clipboard.setStringAsync(url);
          Toast.show({ type: 'success', text1: 'Link copied to clipboard' });
        }}
        // onMarkUnread={async () => {
        //   try {
        //     await messageAPI.markUnread(channelId, actionMenuTarget._id);
        //     Toast.show({ type: 'success', text1: 'Marked as unread' });
        //     navigation.navigate("Main", { screen: "ChannelsTab" });
        //   } catch (error) {
        //     Toast.show({ type: 'error', text1: 'Failed to mark unread' });
        //   }
        // }}
        onToggleNotifications={async () => {
          try {
            const tId = actionMenuTarget.threadId || actionMenuTarget._id;
            await threadAPI.mute(tId);
            Toast.show({ type: 'success', text1: 'Notifications muted for this thread' });
          } catch (error) {
            Toast.show({ type: 'error', text1: 'Failed to mute notifications' });
          }
        }}
      />

      {/* Forward Message Modal */}
      <ForwardMessageModal
        visible={!!forwardTarget}
        onClose={() => setForwardTarget(null)}
        message={forwardTarget}
        colors={colors}
      />
    </ScreenLayout>
  );
};

const createStyles = (colors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(12),
    borderBottomWidth: 1,
  },
  backButton: {
    padding: moderateScale(8),
    marginRight: scale(8),
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontSize: moderateScale(18),
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: moderateScale(13),
    marginTop: verticalScale(2),
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerRightIcon: {
    padding: moderateScale(4),
  },
  repliesList: {
    paddingBottom: verticalScale(24),
  },
  rootSection: {
    paddingTop: verticalScale(16),
  },
  rootMessageRow: {
    flexDirection: 'row',
    paddingHorizontal: scale(16),
    marginBottom: verticalScale(12),
  },
  rootMessageContent: {
    flex: 1,
    marginLeft: scale(12),
  },
  rootMessageHeaderLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  rootAuthorName: {
    fontSize: moderateScale(16),
    fontWeight: '700',
  },
  rootDateTime: {
    fontSize: moderateScale(13),
    marginTop: verticalScale(2),
  },
  rootTextContainer: {
    paddingHorizontal: scale(16),
    marginBottom: verticalScale(12),
  },
  rootText: {
    fontSize: moderateScale(16),
    lineHeight: 24,
  },
  reactionPill: {
    marginLeft: scale(16),
    width: scale(36),
    height: scale(36),
    borderRadius: moderateScale(18),
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: verticalScale(24),
  },
  repliesDivider: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
  },
  repliesCount: {
    fontSize: moderateScale(15),
    fontWeight: '700',
  },
  dividerActions: {
    flexDirection: 'row',
    gap: 16,
  },
  actionIcon: {
    padding: moderateScale(4),
  },
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: verticalScale(16),
    paddingHorizontal: scale(16),
  },
  dateLine: {
    flex: 1,
    height: scale(1),
  },
  datePill: {
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(4),
    borderRadius: moderateScale(12),
    borderWidth: 1,
    marginHorizontal: scale(12),
  },
  dateText: {
    fontSize: moderateScale(12),
    fontWeight: '600',
  },
  messageRow: {
    flexDirection: 'row',
    paddingHorizontal: scale(16),
    marginBottom: verticalScale(16),
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
  inputBar: {
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
    paddingBottom: verticalScale(24), // safe area padding
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: moderateScale(24),
    borderWidth: 1,
    paddingHorizontal: scale(12),
    minHeight: verticalScale(48),
  },
  plusButton: {
    padding: moderateScale(8),
    marginRight: scale(4),
  },
  input: {
    flex: 1,
    fontSize: moderateScale(16),
    maxHeight: verticalScale(100),
    paddingVertical: verticalScale(10),
  },
  micButton: {
    padding: moderateScale(8),
  },
  sendButton: {
    padding: moderateScale(8),
    paddingHorizontal: scale(12),
  },
  actionsOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  actionsSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    paddingBottom: verticalScale(24), // safe area
  },
  actionsHeader: {
    padding: moderateScale(16),
    borderBottomWidth: 1,
  },
  actionsTitle: {
    fontSize: moderateScale(16),
    fontWeight: '700',
  },
  actionsSnippet: {
    fontSize: moderateScale(14),
    marginTop: verticalScale(4),
  },
  actionsList: {
    paddingTop: verticalScale(8),
    maxHeight: verticalScale(300),
  },
  actionItem: {
    paddingVertical: verticalScale(14),
    paddingHorizontal: scale(16),
  },
  actionItemText: {
    fontSize: moderateScale(16),
  }
});

export default ThreadDetailScreen;
