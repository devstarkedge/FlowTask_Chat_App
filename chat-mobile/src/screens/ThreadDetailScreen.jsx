/**
 * ThreadDetailScreen — full thread view matching web app ThreadPanel structure.
 *
 * Displays:
 *  - Root/parent message at top (avatar, author, timestamp, rich content, reactions)
 *  - Thread replies list (FlatList below)
 *  - Thread reply composer at bottom
 *  - Reply count + participant info in header
 *  - Real-time reply insertion via socket
 */
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
  Alert,
} from 'react-native';
import { useThreadStore } from '../stores/threadStore';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { useChatStore } from '../stores/chatStore';
import { formatMessageTime, formatRelativeTime } from '../utils/dateUtils';
import { ScreenLayout, AppAvatar, MobileFileCard } from '../components/common';
import RichText from '../components/RichText';
import ReactionBar from '../components/ReactionBar';
import EmojiPickerModal from '../components/EmojiPickerModal';
import LoadingState from '../components/common/LoadingState';
import {
  CircleChevronLeft,
  Send,
  MessageSquare,
  Reply,
} from 'lucide-react-native';

const formatTime = formatMessageTime;

const ThreadDetailScreen = ({ route, navigation }) => {
  const {
    rootMessageId,
    channelId,
    channelName,
    rootContent,
    rootHtmlContent,
    replyCount: initialReplyCount,
    rootAuthor,
  } = route.params;

  const { colors } = useThemeStore();
  const { user } = useAuthStore();
  const {
    threadRepliesByRoot,
    fetchThreadReplies,
    sendThreadReply,
    isLoadingReplies,
    threadHasMore,
    addThreadReply,
  } = useThreadStore();
  const { addReaction, removeReaction } = useChatStore();

  const [replyText, setReplyText] = useState('');
  const [emojiPickerTarget, setEmojiPickerTarget] = useState(null);
  const flatListRef = useRef(null);

  const replies = threadRepliesByRoot[rootMessageId] || [];

  useEffect(() => {
    fetchThreadReplies(rootMessageId);
  }, [rootMessageId]);

  const handleSendReply = () => {
    if (!replyText.trim()) return;
    sendThreadReply(rootMessageId, channelId, replyText.trim());
    setReplyText('');
  };

  // Find root message from chat store if available
  const rootMessage = (() => {
    const messagesByChannel = useChatStore.getState().messagesByChannel;
    const channelMessages = messagesByChannel[channelId] || [];
    return channelMessages.find(m => m._id === rootMessageId);
  })();

  const effectiveRoot = rootMessage || {
    _id: rootMessageId,
    content: rootContent,
    htmlContent: rootHtmlContent,
    senderSnapshot: rootAuthor,
    authorId: rootAuthor,
    createdAt: rootMessage?.createdAt || new Date().toISOString(),
    replyCount: initialReplyCount,
  };

  const getAuthorId = (msg) => {
    if (!msg) return null;
    if (typeof msg.authorId === "string") return msg.authorId;
    return msg.authorId?._id || msg.senderSnapshot?._id || null;
  };

  const getMessageAttachments = (msg) => {
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
  };

  const renderReply = useCallback(({ item, index }) => {
    const isMe = item.authorId?._id === user?._id || item.authorId === user?._id;
    const isSystem = item.contentType === "system" && !item.activityMeta;

    if (isSystem) {
      return (
        <View style={styles.systemMessageContainer} key={item._id}>
          <View style={[styles.systemMessageLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.systemMessageText, { color: colors.textSecondary }]}>
            {item.content}
          </Text>
          <View style={[styles.systemMessageLine, { backgroundColor: colors.border }]} />
        </View>
      );
    }

    const isDeleted = item.isDeleted === true;
    const deletedText = isMe
      ? "You deleted this message"
      : "This message was deleted";

    const sender = item.senderSnapshot || item.authorId;

    // Message grouping (chronological): compact if same author and within 5 minutes of prev message (index - 1)
    const prevItem = replies[index - 1]; // chronological previous
    const isCompact =
      prevItem &&
      getAuthorId(item) === getAuthorId(prevItem) &&
      !item.isActivity &&
      !prevItem.isActivity &&
      Math.abs(new Date(item.createdAt) - new Date(prevItem.createdAt)) <
        5 * 60 * 1000;

    // Last in group: true if the next chronological message (index + 1) is not by the same author or is not within 5 mins
    const nextItem = replies[index + 1]; // chronological next
    const sameAsNext =
      nextItem &&
      getAuthorId(item) === getAuthorId(nextItem) &&
      !item.isActivity &&
      !nextItem.isActivity &&
      Math.abs(new Date(nextItem.createdAt) - new Date(item.createdAt)) <
        5 * 60 * 1000;
    const isLastInGroup = !sameAsNext;

    const groupPos =
      !isCompact && isLastInGroup
        ? "solo"
        : !isCompact
          ? "first"
          : isLastInGroup
            ? "last"
            : "middle";

    // Dynamic border radius
    let bubbleRadiusStyle = {};
    if (isMe) {
      if (groupPos === 'first') {
        bubbleRadiusStyle = { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 4, borderBottomLeftRadius: 18 };
      } else if (groupPos === 'middle') {
        bubbleRadiusStyle = { borderTopLeftRadius: 18, borderTopRightRadius: 4, borderBottomRightRadius: 4, borderBottomLeftRadius: 18 };
      } else if (groupPos === 'last') {
        bubbleRadiusStyle = { borderTopLeftRadius: 18, borderTopRightRadius: 4, borderBottomRightRadius: 18, borderBottomLeftRadius: 18 };
      } else { // solo
        bubbleRadiusStyle = { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 18 };
      }
    } else {
      if (groupPos === 'first') {
        bubbleRadiusStyle = { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 4 };
      } else if (groupPos === 'middle') {
        bubbleRadiusStyle = { borderTopLeftRadius: 4, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 4 };
      } else if (groupPos === 'last') {
        bubbleRadiusStyle = { borderTopLeftRadius: 4, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 18 };
      } else { // solo
        bubbleRadiusStyle = { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 18 };
      }
    }

    const attachments = getMessageAttachments(item);
    const contentColor = isMe ? colors.messageTextSent : colors.messageTextReceived;

    return (
      <View style={[styles.replyContainer, isMe ? styles.myReply : styles.theirReply, isCompact && { marginTop: 1 }]} key={item._id}>
        {/* Avatar */}
        {!isMe && !isCompact && (
          <AppAvatar user={sender} size={28} showStatus={false} style={{ marginTop: 2 }} />
        )}
        {!isMe && isCompact && <View style={{ width: 28 }} />}

        <View style={{ flexShrink: 1, flex: 1 }}>
          {/* Header */}
          {!isMe && !isCompact && (
            <View style={styles.replyHeader}>
              <Text style={[styles.replyAuthor, { color: colors.textSecondary }]}>
                {sender?.name || 'Unknown'}
              </Text>
              <Text style={[styles.replyTime, { color: colors.textTertiary }]}>
                {formatTime(item.createdAt)}
              </Text>
            </View>
          )}

          {/* Reply Bubble */}
          <View style={[
            styles.replyBubble,
            bubbleRadiusStyle,
            { backgroundColor: isMe ? colors.messageBubbleSent : colors.messageBubbleReceived },
          ]}>
            {/* Forwarded indicator */}
            {item.forwardMeta?.isForwarded && (
              <View
                style={[
                  styles.forwardedRow,
                  { borderBottomColor: colors.border },
                ]}
              >
                <Reply size={12} color={contentColor} style={{ marginRight: 4, transform: [{ scaleX: -1 }] }} />
                <Text style={[styles.forwardedText, { color: contentColor, opacity: 0.8 }]}>
                  Forwarded from{" "}
                  <Text style={{ fontWeight: "700" }}>
                    {item.forwardMeta.originalChannelName
                      ? (item.forwardMeta.originalChannelType === "dm"
                          ? item.forwardMeta.originalChannelName
                          : `#${item.forwardMeta.originalChannelName}`)
                      : item.forwardMeta.originalSenderName || "Unknown"}
                  </Text>
                </Text>
              </View>
            )}

            {isDeleted ? (
              <Text
                style={[styles.replyText, { color: colors.textTertiary, fontStyle: 'italic' }]}
              >
                {deletedText}
              </Text>
            ) : item.htmlContent ? (
              <RichText
                html={item.htmlContent}
                text={item.content}
                colors={{
                  ...colors,
                  textPrimary: contentColor,
                  codeBackground: isMe ? 'rgba(255,255,255,0.15)' : colors.codeBackground,
                  codeBlockBackground: isMe ? 'rgba(0,0,0,0.2)' : colors.codeBlockBackground,
                  codeBlockText: isMe ? '#fff' : colors.codeBlockText,
                }}
                baseStyle={{ color: contentColor, fontSize: 15, lineHeight: 22 }}
              />
            ) : (
              <Text style={[styles.replyText, { color: contentColor }]}>
                {item.content}
              </Text>
            )}

            {/* File attachments */}
            {!isDeleted && attachments.length > 0 && (
              <View style={{ marginTop: 4, width: '100%', gap: 4 }}>
                {attachments.map((file, i) => (
                  <MobileFileCard
                    key={file._id || i}
                    file={file}
                    colors={colors}
                  />
                ))}
              </View>
            )}
          </View>

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
      </View>
    );
  }, [user, colors, replies, addReaction, removeReaction]);

  const styles = createStyles(colors);

  return (
    <ScreenLayout>

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <CircleChevronLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Thread</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {channelName} · {initialReplyCount || replies.length} {replies.length === 1 ? 'reply' : 'replies'}
          </Text>
        </View>
      </View>

      {/* Root message */}
      <View style={[styles.rootMessageContainer, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        <View style={styles.rootMessageHeader}>
          <AppAvatar user={effectiveRoot.senderSnapshot || effectiveRoot.authorId} size={36} showStatus={false} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rootAuthor, { color: colors.textPrimary }]}>
              {effectiveRoot.senderSnapshot?.name || effectiveRoot.authorId?.name || 'Unknown'}
            </Text>
            <Text style={[styles.rootTime, { color: colors.textTertiary }]}>
              {formatTime(effectiveRoot.createdAt)}
            </Text>
          </View>
        </View>

        <View style={styles.rootContent}>
          {effectiveRoot.htmlContent ? (
            <RichText
              html={effectiveRoot.htmlContent}
              text={effectiveRoot.content}
              colors={{ ...colors, textPrimary: colors.textPrimary }}
              baseStyle={{ color: colors.textPrimary, fontSize: 15, lineHeight: 22 }}
            />
          ) : (
            <Text style={[styles.rootText, { color: colors.textPrimary }]}>
              {effectiveRoot.content}
            </Text>
          )}
        </View>

        {effectiveRoot.reactions && (
          <ReactionBar
            reactions={effectiveRoot.reactions}
            messageId={effectiveRoot._id}
            currentUserId={user?._id}
            onAddReaction={(emoji) => addReaction(effectiveRoot._id, emoji)}
            onRemoveReaction={(emoji) => removeReaction(effectiveRoot._id, emoji)}
            onOpenPicker={() => setEmojiPickerTarget(effectiveRoot._id)}
            colors={colors}
          />
        )}
      </View>

      {/* Replies list */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        {replies.length > 0 && (
          <View style={[styles.repliesHeader, { borderBottomColor: colors.border }]}>
            <MessageSquare size={14} color={colors.textSecondary} />
            <Text style={[styles.repliesCount, { color: colors.textSecondary }]}>
              {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            </Text>
          </View>
        )}

        <FlatList
          ref={flatListRef}
          data={replies}
          renderItem={renderReply}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.repliesList}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={11}
          removeClippedSubviews={Platform.OS !== 'web'}
          onEndReached={() => {
            if (threadHasMore[rootMessageId] && !isLoadingReplies) {
              const oldest = replies[0];
              if (oldest) fetchThreadReplies(rootMessageId, oldest._id);
            }
          }}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            !isLoadingReplies ? (
              <View style={styles.emptyContainer}>
                <MessageSquare size={40} color={colors.textTertiary} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  No replies yet
                </Text>
                <Text style={[styles.emptySubtext, { color: colors.textTertiary }]}>
                  Be the first to reply to this thread
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            isLoadingReplies ? (
              <LoadingState size="small" style={{ margin: 16 }} />
            ) : null
          }
        />

        {/* Reply input */}
        <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <View style={[styles.inputContainer, { backgroundColor: colors.inputBackground }]}>
            <TextInput
              style={[styles.input, { color: colors.inputText }]}
              placeholder="Reply..."
              placeholderTextColor={colors.inputPlaceholder}
              value={replyText}
              onChangeText={setReplyText}
              multiline
            />
          </View>
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: replyText.trim() ? colors.primary : colors.border }]}
            onPress={handleSendReply}
            disabled={!replyText.trim()}
          >
            <Send size={18} color={colors.textInverse} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Emoji Picker Modal */}
      <EmojiPickerModal
        visible={!!emojiPickerTarget}
        onClose={() => setEmojiPickerTarget(null)}
        onSelect={(emoji) => {
          if (emojiPickerTarget) {
            addReaction(emojiPickerTarget, emoji);
          }
        }}
        colors={colors}
      />
    </ScreenLayout>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  backButton: {
    padding: 4,
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  rootMessageContainer: {
    padding: 16,
    borderBottomWidth: 1,
  },
  rootMessageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  rootAuthor: {
    fontSize: 15,
    fontWeight: '700',
  },
  rootTime: {
    fontSize: 12,
    marginTop: 1,
  },
  rootContent: {
    marginBottom: 8,
  },
  rootText: {
    fontSize: 15,
    lineHeight: 22,
  },
  repliesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  repliesCount: {
    fontSize: 13,
    fontWeight: '600',
  },
  repliesList: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  replyContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  myReply: {
    // can add specific styles
  },
  theirReply: {
    // can add specific styles
  },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 2,
  },
  replyAuthor: {
    fontSize: 13,
    fontWeight: '700',
  },
  replyTime: {
    fontSize: 11,
  },
  replyBubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  replyText: {
    fontSize: 15,
    lineHeight: 22,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 13,
    textAlign: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  input: {
    flex: 1,
    fontSize: 15,
    maxHeight: 80,
    paddingVertical: 8,
    ...(Platform.OS === 'web' && { outlineWidth: 0, outlineStyle: 'none' }),
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  systemMessageContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  systemMessageLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  systemMessageText: {
    fontSize: 12,
    fontStyle: "italic",
    textAlign: "center",
  },
  forwardedRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 4,
    marginBottom: 6,
    gap: 4,
  },
  forwardedText: {
    fontSize: 12,
    fontStyle: "italic",
  },
});

export default ThreadDetailScreen;
