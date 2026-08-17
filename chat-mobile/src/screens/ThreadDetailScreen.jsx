import React, { useCallback, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import KeyboardAwareContainer from '../components/common/KeyboardAwareContainer';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { useThemeStore } from '../stores/themeStore';
import { useChatStore } from '../stores/chatStore';
import { useThreadStore } from '../stores/threadStore';
import { laterAPI, threadAPI, pinsAPI } from '../services/api';
import { formatRelativeTimeLong, formatMessageTime } from '../utils/dateUtils';
import { ScreenLayout, AppAvatar, HeaderBackButton, MobileFileCard } from '../components/common';
import RichText from '../components/RichText';
import ReactionBar from '../components/ReactionBar';
import EmojiPickerModal from '../components/EmojiPickerModal';
import ReminderModal from '../components/ReminderModal';
import ForwardMessageModal from '../components/ForwardMessageModal';
import MessageActionSheet from '../components/MessageActionSheet';
import MessageComposer from '../components/MessageComposer';
import ReplyQuotePreview from '../components/ReplyQuotePreview';
import GifRenderer from '../components/GifRenderer';
import AudioMessagePlayer from '../components/AudioMessagePlayer';
import { resolveMessageSenderName, resolveReplyToSenderName, resolveReplyToContent, resolveReplyToAttachment, hasValidReplyTo } from '../utils/replyUtils';
import { useChannelStore } from '../stores/channelStore';
import VideoMessagePlayer from '../components/VideoMessagePlayer';
import { Bookmark, Share, MoreVertical } from 'lucide-react-native';
import { useThreadDetails } from '../hooks/useThreadDetails';

const ThreadDetailScreen = ({ route, navigation }) => {
  const {
    rootMessageId,
    channelId,
    channelName,
    rootContent,
    rootHtmlContent,
    rootAttachments,
    rootContentType,
    rootGifMeta,
    rootAudioMeta,
    rootVideoMeta,
    replyCount: initialReplyCount,
    rootAuthor,
    rootCreatedAt,
    highlightedMessageId,
  } = route.params;

  const { colors } = useThemeStore();
  const membersByChannel = useChannelStore((s) => s.membersByChannel);
  const channelMembers = membersByChannel?.[channelId] || [];
  const [activeHighlightId, setActiveHighlightId] = useState(highlightedMessageId || null);
  const threadDetails = useThreadDetails({ rootMessageId, channelId, highlightedMessageId });

  const {
    user,
    replies,
    rootMessageLive,
    isLoadingReplies,
    threadHasMore,
    fetchThreadReplies,
    addReaction,
    removeReaction,
    toggleSaveMessage,
    isMessageSaved,
    replyText,
    setReplyText,
    editingMessage,
    setEditingMessage,
    replyingTo,
    setReplyingTo,
    actionMenuTarget,
    setActionMenuTarget,
    actionAttachmentTarget,
    setActionAttachmentTarget,
    reminderTarget,
    setReminderTarget,
    forwardTarget,
    setForwardTarget,
    flatListRef,
    getAttachments,
    handleSendReply,
    getAuthorId,
    resolveAuthor,
  } = threadDetails;

  const setEmojiPickerTarget = threadDetails.setEmojiPickerTarget;
  const emojiPickerTarget = threadDetails.emojiPickerTarget;

  const showMessageActions = useCallback((item, attachment = null) => {
    setActionMenuTarget(item);
    setActionAttachmentTarget(attachment);
  }, []);

  const effectiveRoot = rootMessageLive || {
    _id: rootMessageId,
    content: rootContent,
    htmlContent: rootHtmlContent,
    attachments: rootAttachments || [],
    contentType: rootContentType,
    gifMeta: rootGifMeta,
    audioMeta: rootAudioMeta,
    videoMeta: rootVideoMeta,
    senderSnapshot: rootAuthor,
    authorId: rootAuthor,
    createdAt: rootCreatedAt || new Date().toISOString(),
    replyCount: initialReplyCount,
  };

  const renderReply = useCallback(({ item, index }) => {
    const sender = resolveAuthor(item);
    const name = sender?.name || sender?.email || 'Unknown';
    const isMe = getAuthorId(item) === user?._id;
    const itemAttachments = getAttachments(item);
    const isHighlighted = item._id === activeHighlightId;

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
          <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { user: sender, channelId })}>
            <AppAvatar user={sender} size={36} showStatus={false} />
          </TouchableOpacity>
          <View style={styles.messageContent}>
            <View style={styles.messageHeader}>
              <Text style={[styles.authorName, { color: colors.textPrimary }]}>{name}</Text>
              <Text style={[styles.timeText, { color: colors.textTertiary }]}>
                {formatRelativeTimeLong(item.createdAt).replace(' minutes', 'm').replace(' hours', 'h').replace(' days', 'd')}
              </Text>
            </View>
            {hasValidReplyTo(item.replyTo, item.parentMessageId) && (
              <ReplyQuotePreview
                replyTo={{
                  ...item.replyTo,
                  senderName: resolveReplyToSenderName(
                    item.replyTo,
                    String(item.replyTo?.messageId || item.parentMessageId) === String(rootMessageId)
                      ? effectiveRoot
                      : replies.find(
                          (r) =>
                            String(r._id) ===
                            String(item.replyTo?.messageId || item.parentMessageId)
                        ),
                    channelMembers
                  ),
                  content: resolveReplyToContent(
                    item.replyTo,
                    String(item.replyTo?.messageId || item.parentMessageId) === String(rootMessageId)
                      ? effectiveRoot
                      : replies.find(
                          (r) =>
                            String(r._id) ===
                            String(item.replyTo?.messageId || item.parentMessageId)
                        )
                  ),
                  attachment: resolveReplyToAttachment(
                    item.replyTo,
                    String(item.replyTo?.messageId || item.parentMessageId) === String(rootMessageId)
                      ? effectiveRoot
                      : replies.find(
                          (r) =>
                            String(r._id) ===
                            String(item.replyTo?.messageId || item.parentMessageId)
                        )
                  ) || item.replyTo?.attachment,
                }}
                colors={colors}
                variant="thread"
                onPress={() => {
                  const parentId = item.replyTo?.messageId || item.parentMessageId;
                  if (!parentId) return;
                  // Highlight parent reply in the list, or the root if it matches
                  if (String(parentId) === String(rootMessageId)) {
                    setActiveHighlightId(parentId);
                    setTimeout(() => setActiveHighlightId(null), 2000);
                    return;
                  }
                  const idx = replies.findIndex((r) => String(r._id) === String(parentId));
                  if (idx === -1) return;
                  setActiveHighlightId(parentId);
                  setTimeout(() => {
                    flatListRef.current?.scrollToIndex({
                      index: idx,
                      animated: true,
                      viewPosition: 0.4,
                    });
                  }, 50);
                  setTimeout(() => setActiveHighlightId(null), 2500);
                }}
              />
            )}
            <View style={{ maxHeight: verticalScale(250), overflow: 'hidden' }}>
              {item.contentType === 'audio' || item.type === 'audio' ? (
                <AudioMessagePlayer 
                  audioUrl={item.audioUrl || item.audioMeta?.audioUrl || itemAttachments[0]?.url || itemAttachments[0]?.secureUrl} 
                  duration={item.duration || item.audioMeta?.duration} 
                  colors={colors} 
                  isMe={isMe} 
                />
              ) : item.contentType === 'video' || item.type === 'video' ? (
                <VideoMessagePlayer 
                  videoUrl={item.videoUrl || item.videoMeta?.videoUrl || itemAttachments[0]?.url || itemAttachments[0]?.secureUrl} 
                  thumbnailUrl={item.thumbnailUrl || item.videoMeta?.thumbnailUrl || itemAttachments[0]?.thumbnailUrl} 
                  width={item.width || item.videoMeta?.width}
                  height={item.height || item.videoMeta?.height}
                  colors={colors} 
                />
              ) : item.contentType === 'gif' && item.gifMeta ? (
                <GifRenderer item={item} contentColor={colors.textPrimary} styles={styles} />
              ) : !!(item.htmlContent || item.content) && (
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
                    <MobileFileCard key={file._id || i} file={file} colors={colors} isUploading={item.pending || item.status === 'pending'} onLongPress={() => showMessageActions(item, file)} />
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
  }, [colors, user, replies, getAttachments, activeHighlightId, showMessageActions, resolveAuthor, addReaction, removeReaction, setEmojiPickerTarget, navigation, channelId, rootMessageId, flatListRef, channelMembers, effectiveRoot]);

  const styles = createStyles(colors);
  
  let effectiveRootSender = resolveAuthor(effectiveRoot);
  if (!effectiveRootSender.name && !effectiveRootSender.email && rootAuthor) {
    effectiveRootSender = resolveAuthor({ authorId: rootAuthor, senderSnapshot: rootAuthor });
  }
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(54);
  const rootDateStr = new Date(effectiveRoot.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const rootTimeStr = formatMessageTime(effectiveRoot.createdAt);
  const effectiveRootAttachments = getAttachments(effectiveRoot);

  return (
    // KeyboardAwareContainer owns bottom inset — exclude 'bottom' from ScreenLayout
    // to prevent double-applying the nav bar gap on all Android navigation modes.
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View
        style={[styles.header, { borderBottomColor: colors.border }]}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <HeaderBackButton onPress={() => navigation.goBack()} />
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>Thread</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {channelName ? `#${channelName}` : 'Message'}
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAwareContainer
        disablePadding={false}
        bottomSafeContext={Platform.OS === 'ios'}
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
            <View style={[styles.rootSection, activeHighlightId === effectiveRoot._id && { backgroundColor: colors.primary + '20' }]}>
              <View style={styles.rootMessageRow}>
                <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { user: effectiveRootSender, channelId })}>
                  <AppAvatar user={effectiveRootSender} size={42} showStatus={false} />
                </TouchableOpacity>
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
                  <Text style={[styles.rootDateTime, { color: colors.textSecondary }]}>{rootDateStr} at {rootTimeStr}</Text>
                </View>
              </View>

              <View style={styles.rootTextContainer}>
                {effectiveRoot.contentType === 'audio' || effectiveRoot.type === 'audio' ? (
                  <AudioMessagePlayer 
                    audioUrl={effectiveRoot.audioUrl || effectiveRoot.audioMeta?.audioUrl || effectiveRootAttachments[0]?.url || effectiveRootAttachments[0]?.secureUrl} 
                    duration={effectiveRoot.duration || effectiveRoot.audioMeta?.duration} 
                    colors={colors} 
                    isMe={effectiveRootSender?._id === user?._id} 
                  />
                ) : effectiveRoot.contentType === 'video' || effectiveRoot.type === 'video' ? (
                  <VideoMessagePlayer 
                    videoUrl={effectiveRoot.videoUrl || effectiveRoot.videoMeta?.videoUrl || effectiveRootAttachments[0]?.url || effectiveRootAttachments[0]?.secureUrl} 
                    thumbnailUrl={effectiveRoot.thumbnailUrl || effectiveRoot.videoMeta?.thumbnailUrl || effectiveRootAttachments[0]?.thumbnailUrl} 
                    width={effectiveRoot.width || effectiveRoot.videoMeta?.width}
                    height={effectiveRoot.height || effectiveRoot.videoMeta?.height}
                    colors={colors} 
                  />
                ) : effectiveRoot.contentType === 'gif' && effectiveRoot.gifMeta ? (
                  <GifRenderer item={effectiveRoot} contentColor={colors.textPrimary} styles={styles} />
                ) : !!(effectiveRoot.htmlContent || effectiveRoot.content) && (
                  <RichText
                    html={effectiveRoot.htmlContent || (/<[a-z][\s\S]*>/i.test(effectiveRoot.content) ? effectiveRoot.content : undefined)}
                    text={effectiveRoot.content}
                    mentions={effectiveRoot.mentions}
                    onMentionPress={(userId) => { navigation.navigate('UserProfile', { user: { _id: userId }, channelId }); }}
                    colors={{ ...colors, textPrimary: colors.textPrimary }}
                    baseStyle={{ color: colors.textPrimary, fontSize: moderateScale(16), lineHeight: 24 }}
                  />
                )}
                {(!effectiveRoot.htmlContent && !effectiveRoot.content && effectiveRootAttachments.length > 0) && (
                  <Text style={{ color: colors.textSecondary, fontStyle: 'italic', fontSize: moderateScale(15) }}>[Media attached]</Text>
                )}
              </View>
              {effectiveRootAttachments.length > 0 && (
                 <View style={{ marginTop: verticalScale(8), width: '100%', gap: 4, paddingHorizontal: scale(16) }}>
                    {effectiveRootAttachments.map((file, i) => (
                      <MobileFileCard key={file._id || i} file={file} colors={colors} isUploading={effectiveRoot.pending || effectiveRoot.status === 'pending'} onLongPress={() => showMessageActions(effectiveRoot, file)} />
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

        <MessageComposer
          channelId={channelId}
          channelName={channelName}
          colors={colors}
          text={replyText}
          onChangeText={setReplyText}
          members={channelMembers}
          onSend={(content, options) => {
            handleSendReply(content, options);
            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
          }}
          editingMessage={editingMessage}
          replyingTo={replyingTo}
          onCancelEdit={() => { setEditingMessage(null); setReplyText(''); }}
          onCancelReply={() => setReplyingTo(null)}
        />
      </KeyboardAwareContainer>

      <EmojiPickerModal visible={!!emojiPickerTarget} onClose={() => setEmojiPickerTarget(null)} onSelect={(emoji) => { if (emojiPickerTarget) { addReaction(emojiPickerTarget, emoji); } setEmojiPickerTarget(null); }} colors={colors} />

      <ReminderModal visible={!!reminderTarget} onClose={() => setReminderTarget(null)} onSetReminder={async (reminderAt) => { if (reminderTarget) { try { await laterAPI.updateReminder(reminderTarget, { reminderAt }); } catch (err) { console.error('Failed to set reminder:', err); } } }} colors={colors} />

      <MessageActionSheet
        visible={!!actionMenuTarget}
        onClose={() => {
          setActionMenuTarget(null);
          setActionAttachmentTarget(null);
        }}
        message={actionMenuTarget}
        attachment={actionAttachmentTarget}
        colors={colors}
        user={user}
        isSaved={isMessageSaved?.(actionMenuTarget?._id, actionAttachmentTarget)}
        onReact={(emoji) => { if (actionMenuTarget) addReaction(actionMenuTarget._id, emoji); }}
        onOpenEmojiPicker={() => setEmojiPickerTarget(actionMenuTarget?._id)}
        onForward={() => {
          if (actionAttachmentTarget) {
            setForwardTarget({ ...actionMenuTarget, forwardAttachment: actionAttachmentTarget });
          } else {
            setForwardTarget(actionMenuTarget);
          }
        }}
        onPin={async (msg) => {
          try {
            if (msg.isPinned) {
              await pinsAPI.unpin(msg._id);
              Toast.show({ type: 'success', text1: 'Message unpinned' });
            } else {
              await pinsAPI.pin(msg._id);
              Toast.show({ type: 'success', text1: 'Message pinned' });
            }
          } catch (error) {
            Toast.show({ type: 'error', text1: msg.isPinned ? 'Failed to unpin message' : 'Failed to pin message' });
          }
          setActionMenuTarget(null);
        }}
        onSave={() => toggleSaveMessage?.(actionMenuTarget?._id, channelId, actionAttachmentTarget)}
        onRemind={() => setReminderTarget(actionMenuTarget?._id)}
        onReply={() => {
          const msg = actionMenuTarget;
          const resolvedName = resolveMessageSenderName(msg, channelMembers) || 'Someone';
          setReplyingTo({
            ...msg,
            senderSnapshot: {
              ...(msg?.senderSnapshot || {}),
              name: resolvedName,
              avatar: msg?.senderSnapshot?.avatar || msg?.authorId?.avatar || null,
            },
            attachmentContext: actionAttachmentTarget,
          });
          setActionMenuTarget(null);
          setActionAttachmentTarget(null);
        }}
        onEdit={() => { setEditingMessage(actionMenuTarget); setReplyText(actionMenuTarget.htmlContent || actionMenuTarget.content || ''); setActionMenuTarget(null); setReplyingTo(null); }}
        onDelete={() => {
          const msg = actionMenuTarget;
          const targetId = msg._id;
          const isRoot = targetId === rootMessageId;
          const isAttachment = !!actionAttachmentTarget;
          setTimeout(() => {
            Alert.alert(
              isAttachment ? 'Delete Image' : 'Delete Message',
              isAttachment ? 'Are you sure you want to delete this image?' : 'Are you sure you want to delete this message?',
              [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  setActionMenuTarget(null);
                  try {
                    if (isAttachment) {
                      const remainingRefs = (msg.fileReferences || [])
                        .filter(r => {
                          const rId = r.fileId?._id || r.fileId || r._id;
                          const targetId = actionAttachmentTarget._id;
                          return rId !== targetId;
                        })
                        .map(r => r.fileId?._id || r.fileId || r._id);

                      if (isRoot) {
                        await editMessage(rootMessageId, channelId, msg.content, msg.htmlContent, remainingRefs);
                      } else {
                        await useThreadStore.getState().editThreadReply(rootMessageId, msg._id, msg.content, msg.htmlContent, remainingRefs);
                      }
                      Toast.show({ type: 'success', text1: 'Image deleted' });
                    } else {
                      if (isRoot) {
                        const { deleteMessage: del } = useChatStore.getState();
                        await del(targetId, channelId);
                        navigation.goBack();
                      } else {
                        await useThreadStore.getState().deleteThreadReply(rootMessageId, targetId);
                      }
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
        onToggleNotifications={async () => {
          try {
            const tId = actionMenuTarget.threadId || actionMenuTarget._id;
            await threadAPI.mute(tId);
            Toast.show({ type: 'success', text1: 'Notifications muted for this thread' });
          } catch (error) {
            Toast.show({ type: 'error', text1: 'Failed to mute notifications' });
          }
          setActionMenuTarget(null);
          setActionAttachmentTarget(null);
        }}
      />

      <ForwardMessageModal visible={!!forwardTarget} onClose={() => setForwardTarget(null)} message={forwardTarget} colors={colors} />
    </ScreenLayout>
  );
};

const createStyles = (colors) => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: scale(12), paddingVertical: verticalScale(12), borderBottomWidth: 1 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: moderateScale(18), fontWeight: '700' },
  headerSubtitle: { fontSize: moderateScale(13), marginTop: verticalScale(2) },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  repliesList: { paddingBottom: verticalScale(24) },
  rootSection: { paddingTop: verticalScale(16) },
  rootMessageRow: { flexDirection: 'row', paddingHorizontal: scale(16), marginBottom: verticalScale(12) },
  rootMessageContent: { flex: 1, marginLeft: scale(12) },
  rootMessageHeaderLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rootAuthorName: { fontSize: moderateScale(16), fontWeight: '700' },
  rootDateTime: { fontSize: moderateScale(13), marginTop: verticalScale(2) },
  rootTextContainer: { paddingHorizontal: scale(16), marginBottom: verticalScale(12) },
  repliesDivider: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingHorizontal: scale(16), paddingVertical: verticalScale(12) },
  repliesCount: { fontSize: moderateScale(15), fontWeight: '700' },
  dividerActions: { flexDirection: 'row', gap: 16 },
  actionIcon: { padding: moderateScale(4) },
  dateSeparator: { flexDirection: 'row', alignItems: 'center', marginVertical: verticalScale(16), paddingHorizontal: scale(16) },
  dateLine: { flex: 1, height: scale(1) },
  datePill: { paddingHorizontal: scale(12), paddingVertical: verticalScale(4), borderRadius: moderateScale(12), borderWidth: 1, marginHorizontal: scale(12) },
  dateText: { fontSize: moderateScale(12), fontWeight: '600' },
  messageRow: { flexDirection: 'row', paddingHorizontal: scale(16), marginBottom: verticalScale(16) },
  messageContent: { flex: 1, marginLeft: scale(10) },
  messageHeader: { flexDirection: 'row', alignItems: 'baseline', marginBottom: verticalScale(4) },
  authorName: { fontSize: moderateScale(15), fontWeight: '700', marginRight: scale(8) },
  timeText: { fontSize: moderateScale(12) }
});

export default ThreadDetailScreen;
