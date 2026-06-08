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
  SafeAreaView,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
  Alert,
} from 'react-native';
import { useThreadStore } from '../stores/threadStore';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { useChatStore } from '../stores/chatStore';
import Avatar from '../components/Avatar';
import RichText from '../components/RichText';
import ReactionBar from '../components/ReactionBar';
import EmojiPickerModal from '../components/EmojiPickerModal';
import {
  CircleChevronLeft,
  Send,
  MessageSquare,
  Users,
} from 'lucide-react-native';

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatRelativeTime = (dateStr) => {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
};

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

  const renderReply = useCallback(({ item }) => {
    const isMe = item.authorId?._id === user?._id || item.authorId === user?._id;
    const sender = item.senderSnapshot || item.authorId;

    return (
      <View style={[styles.replyContainer, isMe ? styles.myReply : styles.theirReply]}>
        <Avatar user={sender} size={28} showStatus={false} />
        <View style={{ flexShrink: 1 }}>
          <View style={styles.replyHeader}>
            <Text style={[styles.replyAuthor, { color: colors.textSecondary }]}>
              {sender?.name || 'Unknown'}
            </Text>
            <Text style={[styles.replyTime, { color: colors.textTertiary }]}>
              {formatTime(item.createdAt)}
            </Text>
          </View>

          <View style={[
            styles.replyBubble,
            { backgroundColor: isMe ? colors.messageBubbleSent : colors.messageBubbleReceived },
          ]}>
            {item.htmlContent ? (
              <RichText
                html={item.htmlContent}
                text={item.content}
                colors={{ ...colors, textPrimary: isMe ? colors.messageTextSent : colors.messageTextReceived }}
                baseStyle={{ color: isMe ? colors.messageTextSent : colors.messageTextReceived, fontSize: 15, lineHeight: 22 }}
              />
            ) : (
              <Text style={[styles.replyText, { color: isMe ? colors.messageTextSent : colors.messageTextReceived }]}>
                {item.content}
              </Text>
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
  }, [user, colors, addReaction, removeReaction]);

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.effectiveTheme === 'dark' ? 'light-content' : 'dark-content'} />

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
      <View style={[styles.rootMessageContainer, { borderBottomColor: colors.border, backgroundColor: colors.cardBackground || 'rgba(255,255,255,0.02)' }]}>
        <View style={styles.rootMessageHeader}>
          <Avatar user={effectiveRoot.senderSnapshot || effectiveRoot.authorId} size={36} showStatus={false} />
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
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
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
              <ActivityIndicator style={{ margin: 16 }} color={colors.primary} />
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
});

export default ThreadDetailScreen;
