import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { useThreadStore } from '../stores/threadStore';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { useChatStore } from '../stores/chatStore';
import { useLaterStore } from '../stores/laterStore';
import { laterAPI, pinsAPI } from '../services/api';
import { formatRelativeTimeLong } from '../utils/dateUtils';
import { ScreenLayout, AppAvatar, MobileFileCard } from '../components/common';
import RichText from '../components/RichText';
import ReactionBar from '../components/ReactionBar';
import EmojiPickerModal from '../components/EmojiPickerModal';
import ReminderModal from '../components/ReminderModal';
import ForwardMessageModal from '../components/ForwardMessageModal';
import LoadingState from '../components/common/LoadingState';
import {
  ArrowLeft,
  Headphones,
  Bookmark,
  Share,
  MoreVertical,
  Plus,
  Mic,
  SmilePlus,
  Pin,
  Reply
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
  const toggleSaveMessage = useLaterStore((s) => s.toggleSaveMessage);
  const isMessageSaved = useLaterStore((s) => s.isMessageSaved);

  const [replyText, setReplyText] = useState('');
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
    if (msg.fileReferences && msg.fileReferences.length > 0 && typeof msg.fileReferences[0] === 'object') {
      return msg.fileReferences;
    }
    return msg.attachments || msg.files || [];
  }, []);

  const replies = threadRepliesByRoot[rootMessageId] || [];

  useEffect(() => {
    fetchThreadReplies(rootMessageId);
  }, [rootMessageId]);

  const handleSendReply = () => {
    if (!replyText.trim()) return;
    sendThreadReply(rootMessageId, channelId, replyText.trim());
    setReplyText('');
  };

  const rootMessage = (() => {
    const messagesByChannel = useChatStore.getState().messagesByChannel;
    const channelMessages = messagesByChannel[channelId] || [];
    return channelMessages.find(m => m._id === rootMessageId);
  })();

  const effectiveRoot = rootMessage || {
    _id: rootMessageId,
    content: rootContent,
    htmlContent: rootHtmlContent,
    attachments: rootAttachments || [],
    senderSnapshot: rootAuthor,
    authorId: rootAuthor,
    createdAt: rootMessage?.createdAt || rootCreatedAt || new Date().toISOString(),
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

    // Show date separator if message is on a different day
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
          style={styles.messageRow}
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
            <View style={{ maxHeight: 250, overflow: 'hidden' }}>
              {!!(item.htmlContent || item.content) && (
                <RichText
                  html={item.htmlContent || (/<[a-z][\s\S]*>/i.test(item.content) ? item.content : undefined)}
                  text={item.content}
                  colors={{ ...colors, textPrimary: colors.textPrimary }}
                  baseStyle={{ color: colors.textPrimary, fontSize: 15, lineHeight: 22 }}
                />
              )}
              {(!item.htmlContent && !item.content && itemAttachments.length > 0) && (
                <Text style={{ color: colors.textSecondary, fontStyle: 'italic', fontSize: 14 }}>
                  [Media attached]
                </Text>
              )}
            </View>
            {itemAttachments.length > 0 && (
               <View style={{ marginTop: 4, width: '100%', gap: 4 }}>
                  {itemAttachments.map((file, i) => (
                    <MobileFileCard key={file._id || i} file={file} colors={colors} />
                  ))}
               </View>
            )}
            {/* Reactions */}
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
  const rootTimeStr = new Date(effectiveRoot.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const effectiveRootAttachments = getAttachments(effectiveRoot);

  return (
    <ScreenLayout>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Thread</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {channelName.includes(user?.name) ? 'Direct message' : channelName}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.headerRightIcon}><AppAvatar user={user} size={24} /></View>
          <TouchableOpacity style={styles.headerRightIcon}>
            <Headphones size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
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
            <View style={styles.rootSection}>
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
                    colors={{ ...colors, textPrimary: colors.textPrimary }}
                    baseStyle={{ color: colors.textPrimary, fontSize: 16, lineHeight: 24 }}
                  />
                )}
                {(!effectiveRoot.htmlContent && !effectiveRoot.content && effectiveRootAttachments.length > 0) && (
                  <Text style={{ color: colors.textSecondary, fontStyle: 'italic', fontSize: 15 }}>
                    [Media attached]
                  </Text>
                )}
              </View>
              {effectiveRootAttachments.length > 0 && (
                 <View style={{ marginTop: 8, width: '100%', gap: 4, paddingHorizontal: 16 }}>
                    {effectiveRootAttachments.map((file, i) => (
                      <MobileFileCard key={file._id || i} file={file} colors={colors} />
                    ))}
                 </View>
              )}

              <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginTop: 12 }}>
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
        <View style={[styles.inputBar, { backgroundColor: colors.background }]}>
          <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}>
            <TouchableOpacity style={styles.plusButton}>
              <Plus size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder="Add a reply"
              placeholderTextColor={colors.textSecondary}
              value={replyText}
              onChangeText={setReplyText}
              multiline
            />
            {replyText.trim() ? (
              <TouchableOpacity style={styles.sendButton} onPress={handleSendReply}>
                <Text style={{ color: colors.primary, fontWeight: 'bold' }}>Send</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.micButton}>
                <Mic size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
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
      <Modal
        visible={!!actionMenuTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setActionMenuTarget(null)}
      >
        <TouchableOpacity
          style={styles.actionsOverlay}
          activeOpacity={1}
          onPress={() => setActionMenuTarget(null)}
        >
          <View style={[styles.actionsSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={[styles.actionsHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.actionsTitle, { color: colors.textPrimary }]}>Message Actions</Text>
              <Text style={[styles.actionsSnippet, { color: colors.textSecondary }]} numberOfLines={1}>
                {actionMenuTarget?.content || "Message"}
              </Text>
            </View>

            <ScrollView style={styles.actionsList}>
              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => {
                  Clipboard.setStringAsync(actionMenuTarget?.content || "");
                  setActionMenuTarget(null);
                }}
              >
                <Text style={[styles.actionItemText, { color: colors.textPrimary }]}>Copy Text</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => {
                  setActionMenuTarget(null);
                  setTimeout(() => {
                    setEmojiPickerTarget(actionMenuTarget?._id);
                  }, 150);
                }}
              >
                <Text style={[styles.actionItemText, { color: colors.textPrimary }]}>React to Message</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => {
                  const saved = isMessageSaved?.(actionMenuTarget?._id);
                  toggleSaveMessage?.(actionMenuTarget?._id);
                  setActionMenuTarget(null);
                  if (!saved) {
                    setTimeout(() => {
                      setReminderTarget(actionMenuTarget?._id);
                    }, 200);
                  }
                }}
              >
                <Text style={[styles.actionItemText, { color: colors.textPrimary }]}>
                  {isMessageSaved?.(actionMenuTarget?._id) ? "Unsave Message" : "Save & Remind"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={async () => {
                  const pinned = actionMenuTarget?.isPinned;
                  setActionMenuTarget(null);
                  try {
                    if (pinned) await pinsAPI.unpin(actionMenuTarget?._id);
                    else await pinsAPI.pin(actionMenuTarget?._id);
                  } catch (err) {
                    console.error('Pin action failed:', err);
                  }
                }}
              >
                <Text style={[styles.actionItemText, { color: colors.textPrimary }]}>
                  {actionMenuTarget?.isPinned ? "Unpin Message" : "Pin Message"}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => {
                  setForwardTarget(actionMenuTarget);
                  setActionMenuTarget(null);
                }}
              >
                <Text style={[styles.actionItemText, { color: colors.textPrimary }]}>Forward Message</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

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
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerRightIcon: {
    padding: 4,
  },
  repliesList: {
    paddingBottom: 24,
  },
  rootSection: {
    paddingTop: 16,
  },
  rootMessageRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  rootMessageContent: {
    flex: 1,
    marginLeft: 12,
  },
  rootMessageHeaderLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  rootAuthorName: {
    fontSize: 16,
    fontWeight: '700',
  },
  rootDateTime: {
    fontSize: 13,
    marginTop: 2,
  },
  rootTextContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  rootText: {
    fontSize: 16,
    lineHeight: 24,
  },
  reactionPill: {
    marginLeft: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  repliesDivider: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  repliesCount: {
    fontSize: 15,
    fontWeight: '700',
  },
  dividerActions: {
    flexDirection: 'row',
    gap: 16,
  },
  actionIcon: {
    padding: 4,
  },
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    paddingHorizontal: 16,
  },
  dateLine: {
    flex: 1,
    height: 1,
  },
  datePill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 12,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '600',
  },
  messageRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
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
  inputBar: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: 24, // safe area padding
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  plusButton: {
    padding: 8,
    marginRight: 4,
  },
  input: {
    flex: 1,
    fontSize: 16,
    maxHeight: 100,
    paddingVertical: 10,
  },
  micButton: {
    padding: 8,
  },
  sendButton: {
    padding: 8,
    paddingHorizontal: 12,
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
    paddingBottom: 24, // safe area
  },
  actionsHeader: {
    padding: 16,
    borderBottomWidth: 1,
  },
  actionsTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  actionsSnippet: {
    fontSize: 14,
    marginTop: 4,
  },
  actionsList: {
    paddingTop: 8,
    maxHeight: 300,
  },
  actionItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  actionItemText: {
    fontSize: 16,
  }
});

export default ThreadDetailScreen;
