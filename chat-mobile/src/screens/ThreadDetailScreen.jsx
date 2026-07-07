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
} from 'react-native';
import { useThreadStore } from '../stores/threadStore';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { useChatStore } from '../stores/chatStore';
import { formatRelativeTimeLong } from '../utils/dateUtils';
import { ScreenLayout, AppAvatar } from '../components/common';
import RichText from '../components/RichText';
import ReactionBar from '../components/ReactionBar';
import EmojiPickerModal from '../components/EmojiPickerModal';
import LoadingState from '../components/common/LoadingState';
import {
  ArrowLeft,
  Headphones,
  Bookmark,
  Share,
  MoreVertical,
  Plus,
  Mic,
  SmilePlus
} from 'lucide-react-native';

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

  const renderReply = useCallback(({ item, index }) => {
    let sender = typeof item.authorId === 'object' && item.authorId?.name ? item.authorId : null;
    if (!sender && item.senderSnapshot?.name) {
      sender = item.senderSnapshot;
    }
    if (!sender) {
      sender = { _id: typeof item.authorId === 'string' ? item.authorId : item.authorId?._id };
    }
    const name = sender?.name || 'Unknown';
    const isMe = getAuthorId(item) === user?._id;

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
        <View style={styles.messageRow}>
          <AppAvatar user={sender} size={36} showStatus={false} />
          <View style={styles.messageContent}>
            <View style={styles.messageHeader}>
              <Text style={[styles.authorName, { color: colors.textPrimary }]}>{name}</Text>
              <Text style={[styles.timeText, { color: colors.textTertiary }]}>
                {formatRelativeTimeLong(item.createdAt).replace(' minutes', 'm').replace(' hours', 'h').replace(' days', 'd')}
              </Text>
            </View>
            <View style={{ maxHeight: 250, overflow: 'hidden' }}>
              <RichText
                html={item.htmlContent || (/<[a-z][\s\S]*>/i.test(item.content) ? item.content : undefined)}
                text={item.content}
                colors={{ ...colors, textPrimary: colors.textPrimary }}
                baseStyle={{ color: colors.textPrimary, fontSize: 15, lineHeight: 22 }}
              />
            </View>
          </View>
        </View>
      </View>
    );
  }, [colors, user, replies]);

  const styles = createStyles(colors);
  
  let effectiveRootSender = typeof effectiveRoot.authorId === 'object' && effectiveRoot.authorId?.name ? effectiveRoot.authorId : null;
  if (!effectiveRootSender && effectiveRoot.senderSnapshot?.name) {
    effectiveRootSender = effectiveRoot.senderSnapshot;
  }
  if (!effectiveRootSender) {
    effectiveRootSender = { _id: typeof effectiveRoot.authorId === 'string' ? effectiveRoot.authorId : effectiveRoot.authorId?._id };
  }
  const rootDateStr = new Date(effectiveRoot.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const rootTimeStr = new Date(effectiveRoot.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

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
          keyExtractor={(item) => item._id}
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
                      {effectiveRootSender?.name || 'Unknown'}
                    </Text>
                    <TouchableOpacity>
                      <Bookmark size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.rootDateTime, { color: colors.textSecondary }]}>
                    {rootDateStr} at {rootTimeStr}
                  </Text>
                </View>
              </View>

              <View style={styles.rootTextContainer}>
                <RichText
                  html={effectiveRoot.htmlContent || (/<[a-z][\s\S]*>/i.test(effectiveRoot.content) ? effectiveRoot.content : undefined)}
                  text={effectiveRoot.content}
                  colors={{ ...colors, textPrimary: colors.textPrimary }}
                  baseStyle={{ color: colors.textPrimary, fontSize: 16, lineHeight: 24 }}
                />
              </View>

              <TouchableOpacity style={[styles.reactionPill, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => setEmojiPickerTarget(effectiveRoot._id)}>
                <SmilePlus size={16} color={colors.textSecondary} />
              </TouchableOpacity>

              <View style={[styles.repliesDivider, { borderTopColor: colors.border }]}>
                <Text style={[styles.repliesCount, { color: colors.textPrimary }]}>
                  {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                </Text>
                <View style={styles.dividerActions}>
                  <TouchableOpacity style={styles.actionIcon}><Share size={20} color={colors.textSecondary} /></TouchableOpacity>
                  <TouchableOpacity style={styles.actionIcon}><MoreVertical size={20} color={colors.textSecondary} /></TouchableOpacity>
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
        }}
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
  }
});

export default ThreadDetailScreen;
