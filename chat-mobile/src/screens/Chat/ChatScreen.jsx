import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  Modal,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from "../../stores/chatStore";
import { useAuthStore } from "../../stores/authStore";
import { useChannelStore } from "../../stores/channelStore";
import { useThemeStore } from "../../stores/themeStore";
import { useLaterStore } from "../../stores/laterStore";
import { laterAPI, pinsAPI, messageAPI, threadAPI, channelAPI } from "../../services/api";
import { emitTyping } from "../../services/socket";
import { AppAvatar, AppScreen, MobileFileCard } from "../../components/common";
import RichText from "../../components/RichText";
import ReactionBar from "../../components/ReactionBar";
import MediaPickerSheet from "../../components/MediaPickerSheet";
import GifPickerModal from "../../components/GifPickerModal";
import MessageActionSheet from "../../components/MessageActionSheet";
import ForwardMessageModal from "../../components/ForwardMessageModal";
import EmojiPickerModal from "../../components/EmojiPickerModal";
import ReminderModal from "../../components/ReminderModal";
import {
  Send,
  Hash,
  MoreVertical,
  Image as ImageIcon,
  Smile,
  Users,
  Search,
  Pin,
  Bell,
  CircleChevronLeft,
  Lock,
  Volume2,
  Phone,
  Video,
  FileText,
  MessageSquare,
  Reply,
  Edit3,
  Trash2,
  Bookmark,
  Copy,
  ExternalLink,
} from "lucide-react-native";
import SearchBar from "../../components/SearchBar";
import MessageComposer from "../../components/MessageComposer";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import logger from '../../utils/logger';
import Toast from 'react-native-toast-message';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

const isSameDay = (d1, d2) => {
  const a = new Date(d1);
  const b = new Date(d2);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};

const formatDateSeparator = (dateStr) => {
  const date = new Date(dateStr);
  const now = new Date();
  if (isSameDay(date, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const formatTime = (dateStr) => {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const isImageUrl = (url) => {
  if (!url) return false;
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(url);
};

// ─── ChatScreen ──────────────────────────────────────────────────────────────

const ChatScreen = ({ route, navigation }) => {
  const { channelId, channelName, initialTab, canvasId: deepLinkCanvasId, messageId: targetMessageId } = route.params || {};

  // Granular store subscriptions — prevent unnecessary re-renders
  const messages = useChatStore(useShallow((s) => s.messagesByChannel[channelId] || []));
  const isLoadingMessages = useChatStore((s) => s.isLoadingMessages);
  const typingByChannel = useChatStore((s) => s.typingByChannel);
  const channelHasMore = useChatStore((s) => s.hasMore[channelId]);
  const {
    fetchMessages,
    sendMessage,
    addReaction,
    removeReaction,
    editMessage,
    deleteMessage,
  } = useChatStore(
    useShallow((s) => ({
      fetchMessages: s.fetchMessages,
      sendMessage: s.sendMessage,
      addReaction: s.addReaction,
      removeReaction: s.removeReaction,
      editMessage: s.editMessage,
      deleteMessage: s.deleteMessage,
    }))
  );
  const user = useAuthStore(useShallow((s) => s.user));
  const channels = useChannelStore(useShallow((s) => s.channels));
  const membersByChannel = useChannelStore(useShallow((s) => s.membersByChannel));
  const fetchMembers = useChannelStore((s) => s.fetchMembers);
  const markAsRead = useChannelStore((s) => s.markAsRead);
  const { colors } = useThemeStore(useShallow((s) => ({ colors: s.colors })));
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const toggleSaveMessage = useLaterStore((s) => s.toggleSaveMessage);
  const isMessageSaved = useLaterStore((s) => s.isMessageSaved);

  const [text, setText] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [emojiPickerTarget, setEmojiPickerTarget] = useState(null); // messageId or null
  const [replyingTo, setReplyingTo] = useState(null); // message object or null
  const [editingMessage, setEditingMessage] = useState(null); // message object or null
  const [reminderTarget, setReminderTarget] = useState(null); // messageId or null
  const [actionMenuTarget, setActionMenuTarget] = useState(null); // message object or null
  const [forwardTarget, setForwardTarget] = useState(null);
  const [scrolledToMessageId, setScrolledToMessageId] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);

   

    
   
  
  // Thread deep-link from Activity/Notifications: auto-navigate to ThreadDetail
  // once messages are loaded. Extract threadId + highlightedMessageId from route.
  const threadId = route.params?.threadId;
  const highlightedMessageIdFromParam = route.params?.highlightedMessageId;
  const hasAutoNavigatedThread = useRef(false);

  // Redirection: if initialTab param is 'canvas', navigate directly to CanvasList screen
  useEffect(() => {
    if (initialTab === 'canvas') {
      navigation.navigate("CanvasList", { channelId, channelName });
    }
  }, [initialTab, channelId, channelName]);

  // Reset hasAutoNavigatedThread when threadId changes
  useEffect(() => {
    hasAutoNavigatedThread.current = false;
  }, [threadId]);

  // Thread deep-link auto-navigation: wait for messages to load, then navigate to ThreadDetail
  useEffect(() => {
    if (!threadId) return;
    if (hasAutoNavigatedThread.current) return;
    if (isLoadingMessages) return;

    const loadThreadAndNavigate = async () => {
      hasAutoNavigatedThread.current = true;
      let rootMessage = messages.find(m => m._id === threadId);

      if (!rootMessage) {
        try {
          const { data } = await messageAPI.get(threadId);
          rootMessage = data?.data?.message || data?.data;
        } catch (err) {
          // Fallback: If 404, it might be a Thread document ID from a notification payload.
          try {
            const { data: threadRes } = await threadAPI.getThread(threadId);
            const resolvedRootId = threadRes?.data?.thread?.rootMessageId;
            // threadAPI might also return rootMessage data directly in some cases
            if (resolvedRootId && typeof resolvedRootId === 'string') {
              const { data: rootMsgRes } = await messageAPI.get(resolvedRootId);
              rootMessage = rootMsgRes?.data?.message || rootMsgRes?.data;
            } else if (resolvedRootId && typeof resolvedRootId === 'object') {
              rootMessage = resolvedRootId;
            }
          } catch (err2) {
            console.error('Failed to fetch thread root message fallback:', err2);
          }
        }
      }

      if (!rootMessage) {
        navigation.navigate('ThreadDetail', {
          rootMessageId: threadId,
          channelId,
          channelName: channelName || route.params?.channelName || '',
          rootContent: '',
          rootHtmlContent: '',
          replyCount: 0,
          rootAuthor: null,
          highlightedMessageId: highlightedMessageIdFromParam || null,
        });
        return;
      }

      navigation.navigate('ThreadDetail', {
        rootMessageId: threadId,
        channelId,
        channelName: channelName || route.params?.channelName || '',
        rootContent: rootMessage.content || '',
        rootHtmlContent: rootMessage.htmlContent || '',
        rootAttachments: rootMessage.attachments || rootMessage.files || undefined,
        replyCount: rootMessage.replyCount || 0,
        rootAuthor: rootMessage.senderSnapshot?.name ? rootMessage.senderSnapshot : rootMessage.authorId,
        rootCreatedAt: rootMessage.createdAt,
        highlightedMessageId: highlightedMessageIdFromParam || null,
      });
    };

    loadThreadAndNavigate();
  }, [threadId, isLoadingMessages, messages, channelId, channelName, navigation, highlightedMessageIdFromParam, route.params]);

  // Scrolling and highlighting target message from Later Panel
  useEffect(() => {
    if (targetMessageId && displayedMessages.length > 0 && scrolledToMessageId !== targetMessageId) {
      const index = displayedMessages.findIndex(m => m._id === targetMessageId);
      if (index !== -1) {
        setScrolledToMessageId(targetMessageId);
        setHighlightedMessageId(targetMessageId);

        setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index,
            animated: true,
            viewPosition: 0.5,
          });
        }, 400);

        setTimeout(() => {
          setHighlightedMessageId(null);
        }, 2500);
      }
    }
  }, [targetMessageId, displayedMessages, scrolledToMessageId]);

  const displayedMessages = useMemo(() => [...messages].reverse(), [messages]);

  // Memoize derived values to prevent re-render loops
  const typingUsers = useMemo(
    () => Object.values(typingByChannel[channelId] || {}),
    [typingByChannel, channelId]
  );
  const channel = useMemo(
    () => channels.find((ch) => ch._id === channelId),
    [channels, channelId]
  );

  // Full user objects from fetchMembers — has avatar, name, onlineStatus
  const channelMembers = membersByChannel[channelId] || [];

  const memberCount = useMemo(
    () => channelMembers.length || channel?.members?.length || 0,
    [channelMembers, channel]
  );
  const onlineCount = useMemo(
    () => channelMembers.filter((m) => m.onlineStatus === "online").length,
    [channelMembers]
  );

  const isDM = channel?.type === "dm";
  const isSystem = channel?.type === "system";
  const isPrivate =
    channel?.visibility === "private" || channel?.type === "private";

  // Build dmUser from membersByChannel (full user objects with avatar/name/onlineStatus)
  // Fallback to channel-level decorated fields (server sets name & avatar on DM channels)
  const dmUser = useMemo(() => {
    if (!isDM) return null;
    // Try membersByChannel first — has full user data including avatar
    const other = channelMembers.find((m) => m._id !== user?._id);
    if (other) return other;
    // Fallback to channel decorated fields
    return {
      _id: channel?.dmRecipientId,
      name: channel?.name || channelName,
      avatar: channel?.avatar || null,
      onlineStatus: channel?.onlineStatus || 'offline',
    };
  }, [isDM, channelMembers, channel, user, channelName]);

  const channelNameToShow = useMemo(() => {
    if (isDM && dmUser) return dmUser.name;
    return channel?.name || channelName || 'Channel';
  }, [channel, channelName, isDM, dmUser]);

  const flatListRef = useRef(null);

  useEffect(() => {
    const initData = async () => {
      if (!channelId) return;
      const res = await fetchMessages(channelId);
      if (res?.error && res.status === 403) {
        try {
          const currentUser = useAuthStore.getState().user;
          await channelAPI.addMember(channelId, currentUser._id);
          Toast.show({ type: 'success', text1: `Joined ${channelName || 'channel'}` });
          await fetchMessages(channelId);
          fetchMembers(channelId);
        } catch (err) {
          logger.error('Failed to auto-join channel:', err);
        }
      } else {
        fetchMembers(channelId);
      }
    };
    initData();
  }, [channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (channelId) {
      markAsRead(channelId);
    }
  }, [channelId, messages.length, markAsRead]);

  // Debounced search — avoid re-running on every displayedMessages change
  const searchTimeoutRef = useRef(null);
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!searchQuery) {
      setSearchResults([]);
      setCurrentMatch(0);
      return;
    }
    searchTimeoutRef.current = setTimeout(() => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) { setSearchResults([]); setCurrentMatch(0); return; }
      const matches = [];
      displayedMessages.forEach((m, idx) => {
        if (m?.content && m.content.toLowerCase().includes(q)) matches.push(idx);
      });
      setSearchResults(matches);
      setCurrentMatch(0);
      if (matches.length > 0) {
        setTimeout(() => scrollToIndex(matches[0]), 80);
      }
    }, 200); // 200ms debounce
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = (content, options) => {
    sendMessage(channelId, content, options);
  };

  const scrollToIndex = (index) => {
    if (!flatListRef.current || index == null) return;
    try {
      flatListRef.current.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
    } catch (err) {
      const approxItemHeight = 80;
      flatListRef.current.scrollToOffset({
        offset: index * approxItemHeight,
        animated: true,
      });
    }
  };

  const goToNextMatch = () => {
    if (!searchResults.length) return;
    const next = (currentMatch + 1) % searchResults.length;
    setCurrentMatch(next);
    scrollToIndex(searchResults[next]);
  };

  const goToPrevMatch = () => {
    if (!searchResults.length) return;
    const prev =
      (currentMatch - 1 + searchResults.length) % searchResults.length;
    setCurrentMatch(prev);
    scrollToIndex(searchResults[prev]);
  };

  // ─── Long-Press Context Menu ──────────────────────────────────────────────
  const showMessageActions = useCallback(
    (item) => {
      setActionMenuTarget(item);
    },
    []
  );

  // ─── Render: Date Separator ───────────────────────────────────────────────
  const renderDateSeparator = (dateStr) => (
    <View style={styles.dateSeparatorContainer} key={`date-${dateStr}`}>
      <View style={[styles.dateSeparatorLine, { backgroundColor: colors.border }]} />
      <Text style={[styles.dateSeparatorText, { color: colors.textSecondary }]}>
        {formatDateSeparator(dateStr)}
      </Text>
      <View style={[styles.dateSeparatorLine, { backgroundColor: colors.border }]} />
    </View>
  );

  // ─── Render: Message ──────────────────────────────────────────────────────
  const renderMessage = useCallback(({ item, index }) => {
    const isMe =
      item.authorId?._id === user?._id || item.authorId === user?._id;
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

    const isMatch =
      searchQuery &&
      item?.content &&
      item.content.toLowerCase().includes(searchQuery.toLowerCase());
    const isHighlighted =
      isMatch && searchResults.length && searchResults[currentMatch] === index;

    const messageSender = item.senderSnapshot?.name ? item.senderSnapshot : item.authorId;

    // Message grouping: compact if same author and within 5 minutes of prev message (older)
    const prevItem = displayedMessages[index + 1]; // inverted list, so +1 is previous chronologically
    const isCompact =
      prevItem &&
      getAuthorId(item) === getAuthorId(prevItem) &&
      !item.isActivity &&
      !prevItem.isActivity &&
      Math.abs(new Date(item.createdAt) - new Date(prevItem.createdAt)) <
        5 * 60 * 1000;

    // Last in group: true if the NEXT chronologically message (index - 1) is not by the same author or is not within 5 mins
    const nextItem = displayedMessages[index - 1]; // inverted list, so -1 is next chronologically
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

    // Dynamic border radius matching web index.css (SENT and RECEIVED)
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

    // Date separator: show if date differs from previous message
    const showDateSep =
      !prevItem || !isSameDay(item.createdAt, prevItem.createdAt);

    // Thread indicator
    const hasThread = (item.replyCount || 0) > 0;

    // File attachments
    const attachments = getMessageAttachments(item);

    const contentColor = isMe
      ? colors.messageTextSent
      : colors.messageTextReceived;

    return (
      <View 
        key={item._id} 
        style={highlightedMessageId === item._id 
          ? { backgroundColor: colors.primary + '20', marginHorizontal: -12, paddingHorizontal: 12, paddingVertical: 4 } 
          : null}
      >
        {showDateSep && renderDateSeparator(item.createdAt)}

        <TouchableOpacity
          style={[
            styles.messageContainer,
            isMe ? styles.myMessage : styles.theirMessage,
            isCompact && styles.messageCompact,
          ]}
          onLongPress={() => showMessageActions(item)}
          activeOpacity={0.85}
          delayLongPress={300}
        >
          {/* Avatar (hidden for compact/grouped messages) */}
          {!isMe && !isCompact && (
            <AppAvatar
              user={messageSender}
              size={32}
              showStatus={false}
              style={{ marginTop: 2 }}
            />
          )}
          {!isMe && isCompact && <View style={{ width: 32 }} />}

          <View style={{ flexShrink: 1 }}>
            {/* Sender name (hidden for compact) */}
            {!isMe && !isCompact && (
              <View style={styles.senderRow}>
                <Text
                  style={[styles.senderName, { color: colors.textSecondary }]}
                >
                  {messageSender?.name || "Unknown"}
                </Text>
                <Text
                  style={[styles.timestamp, { color: colors.textTertiary }]}
                >
                  {formatTime(item.createdAt)}
                </Text>
              </View>
            )}

            {/* Reply preview */}
            {item.parentMessageId && item.replyTo && (
              <View
                style={[
                  styles.replyPreview,
                  { borderLeftColor: colors.primary },
                ]}
              >
                <Reply size={12} color={colors.textSecondary} />
                <Text
                  style={[styles.replyPreviewText, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {item.replyTo.senderName || "User"}:{ " " }
                  {item.replyTo.content || "..."}
                </Text>
              </View>
            )}

            {/* Message bubble */}
            <View
              style={[
                styles.bubble,
                bubbleRadiusStyle,
                {
                  backgroundColor: isMe
                    ? colors.messageBubbleSent
                    : colors.messageBubbleReceived,
                },
                isHighlighted && {
                  borderWidth: 2,
                  borderColor: colors.primary,
                },
              ]}
            >
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

              {/* Content — rich text or plain */}
              {isDeleted ? (
                <Text
                  style={[styles.messageText, { color: colors.textTertiary, fontStyle: "italic" }]}
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
                    codeBackground: isMe
                      ? colors.surfaceOverlayLight
                      : colors.codeBackground,
                    codeBlockBackground: isMe
                      ? colors.shadowMd
                      : colors.codeBlockBackground,
                    codeBlockText: isMe ? colors.textOnPrimary : colors.codeBlockText,
                  }}
                  baseStyle={{ color: contentColor, fontSize: 15, lineHeight: 22 }}
                />
              ) : (
                <Text
                  style={[styles.messageText, { color: contentColor }]}
                >
                  {item.content}
                </Text>
              )}

              {/* Attachment cards */}
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

              {/* Timestamp row */}
              <View style={styles.timestampRow}>
                <Text
                  style={[
                    styles.timestamp,
                    {
                      color: isMe
                        ? colors.messageTextSent
                        : colors.textTertiary,
                      opacity: 0.7,
                    },
                  ]}
                >
                  {formatTime(item.createdAt)}
                </Text>
                {item.isEdited && !isDeleted && (
                  <Text
                    style={[
                      styles.editedLabel,
                      {
                        color: isMe
                          ? colors.messageTextSent
                          : colors.textTertiary,
                      },
                    ]}
                  >
                    {" "}
                    (edited)
                  </Text>
                )}
                {item.pending && (
                  <Text style={[styles.editedLabel, { color: colors.textTertiary }]}>
                    {" "}
                    sending...
                  </Text>
                )}
                {item.failed && (
                  <Text style={[styles.editedLabel, { color: colors.error }]}>
                    {" "}
                    failed
                  </Text>
                )}
              </View>
            </View>

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

            {/* Thread indicator */}
            {hasThread && (
              <TouchableOpacity
                style={[
                  styles.threadIndicator,
                  { borderColor: colors.border },
                ]}
                onPress={() => {
                  navigation.navigate("ThreadDetail", {
                    rootMessageId: item._id,
                    channelId,
                    channelName,
                    rootContent: item.content,
                    rootHtmlContent: item.htmlContent,
                    replyCount: item.replyCount || 0,
                    rootAuthor: item.senderSnapshot?.name ? item.senderSnapshot : item.authorId,
                  });
                }}
                activeOpacity={0.7}
              >
                <View style={styles.threadAvatars}>
                  {(item.threadParticipants || []).slice(0, 3).map((p, i) => (
                    <AppAvatar
                      key={p._id || i}
                      user={p}
                      size={18}
                      showStatus={false}
                      style={{ marginLeft: i > 0 ? -6 : 0 }}
                    />
                  ))}
                </View>
                {/* <MessageSquare size={14} color={colors.primary} /> */}
                <Text style={[styles.threadText, { color: colors.primary }]}>
                  {item.replyCount}{" "}
                  {item.replyCount === 1 ? "reply" : "replies"}
                </Text>
                {item.lastReplyAt && (
                  <Text
                    style={[styles.threadTime, { color: colors.textTertiary }]}
                  >
                    Last reply {formatTime(item.lastReplyAt)}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  }, [user, colors, searchQuery, searchResults, currentMatch, displayedMessages, showMessageActions, addReaction, removeReaction, navigation, channelId, channelName]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <AppScreen style={[styles.container, { backgroundColor: colors.background }]}> 

      {/* Custom Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <CircleChevronLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.headerCenter}
          onPress={() => navigation.navigate("ChannelDetails", { channelId, channelName, memberCount })}
        >
          <View style={styles.headerTitleRow}>
            {isDM ? (
              <AppAvatar
                user={dmUser || { name: channelName }}
                size={32}
                showStatus={true}
              />
            ) : isSystem ? (
              <Volume2 size={20} color={colors.textSecondary} />
            ) : isPrivate ? (
              <Lock size={20} color={colors.textSecondary} />
            ) : (
              <Hash size={20} color={colors.textSecondary} />
            )}
             <Text
              style={[styles.headerTitle, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {channelNameToShow}
            </Text>
          </View>
          {!isDM && (
            <View style={styles.headerSubtitle}>
              <Text style={[styles.memberCount, { color: colors.textSecondary }]}>
                {memberCount} Members
              </Text>
              <>
                <Text style={[styles.memberCount, { color: colors.textSecondary }]}> • </Text>
                <Text style={[styles.memberCount, { color: colors.textSecondary }]}>
                  {1 + (channel?.canvasTabs?.length || 0)} Tabs
                </Text>
              </>
            </View>
          )}
          {isDM && dmUser && (
            <Text
              style={[
                styles.dmStatusText,
                {
                  color:
                    dmUser.onlineStatus === "online"
                      ? colors.online
                      : colors.textSecondary,
                },
              ]}
            >
              {dmUser.onlineStatus === "online" ? "Online" : "Offline"}
            </Text>
          )}
        </TouchableOpacity>

        <View style={styles.headerActions}>
          {isDM && (
            <>
              <TouchableOpacity style={styles.headerButton}>
                <Phone size={20} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerButton}>
                <Video size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowOptions(!showOptions)}
          >
            <MoreVertical size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Options Menu */}
      {showOptions && (
        <View
          style={[
            styles.optionsMenu,
            {
              backgroundColor: colors.background,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.optionItem}
            onPress={() => {
              setShowOptions(false);
              navigation.navigate("ChannelDetails", {
                channelId,
                channelName,
                memberCount,
              });
            }}
          >
            <Users size={18} color={colors.textSecondary} />
            <Text style={[styles.optionText, { color: colors.textPrimary }]}>
              {isDM ? "View Profile" : "Channel Info"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.optionItem}
            onPress={() => {
              setShowOptions(false);
              navigation.navigate("Files", { channelId, channelName });
            }}
          >
            <FileText size={18} color={colors.textSecondary} />
            <Text style={[styles.optionText, { color: colors.textPrimary }]}>
              Files
            </Text>
          </TouchableOpacity>
          {!isDM && (
            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => {
                setShowOptions(false);
                navigation.navigate("CanvasList", { channelId, channelName });
              }}
            >
              <FileText size={18} color={colors.textSecondary} />
              <Text style={[styles.optionText, { color: colors.textPrimary }]}>
                Canvas Documents
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.optionItem}
            onPress={() => {
              setShowOptions(false);
              setShowSearch(true);
            }}
          >
            <Search size={18} color={colors.textSecondary} />
            <Text style={[styles.optionText, { color: colors.textPrimary }]}>
              Search
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.optionItem}
            onPress={() => {
              setShowOptions(false);
              navigation.navigate('PinnedMessages', { channelId, channelName });
            }}
          >
            <Pin size={18} color={colors.textSecondary} />
            <Text style={[styles.optionText, { color: colors.textPrimary }]}>
              Pinned Messages
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.optionItem}
            onPress={() => {
              setShowOptions(false);
              navigation.navigate('Preferences', { channelId, channelName });
            }}
          >
            <Bell size={18} color={colors.textSecondary} />
            <Text style={[styles.optionText, { color: colors.textPrimary }]}>
              Notifications
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Messages View — KeyboardAvoidingView + FlatList */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={displayedMessages}
          renderItem={renderMessage}
          keyExtractor={(item) => item._id}
          inverted
          contentContainerStyle={styles.messageList}
          onEndReached={() => {
            if (channelHasMore && !isLoadingMessages) {
              const oldest = messages[0];
              if (oldest) fetchMessages(channelId, oldest._id);
            }
          }}
          onEndReachedThreshold={0.3}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={11}
          removeClippedSubviews={Platform.OS !== 'web'}
          ListFooterComponent={
            isLoadingMessages ? (
              <ActivityIndicator
                style={{ margin: 10 }}
                color={colors.primary}
              />
            ) : null
          }
          ListEmptyComponent={
            !isLoadingMessages ? (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  No messages yet
                </Text>
              </View>
            ) : null
          }
        />

        {/* Typing Indicator */}
        {typingUsers.length > 0 && (
          <View style={styles.typingIndicator}>
            <Text style={[styles.typingText, { color: colors.textSecondary }]}>
              {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"}{" "}
              typing...
            </Text>
          </View>
        )}

        {/* Search Bar (above input) */}
        {showSearch && (
          <SearchBar
            query={searchQuery}
            onChangeQuery={(q) => setSearchQuery(q)}
            onClose={() => {
              setShowSearch(false);
              setSearchQuery("");
              setSearchResults([]);
            }}
            onNext={goToNextMatch}
            onPrev={goToPrevMatch}
            currentIndex={currentMatch}
            total={searchResults.length}
          />
        )}

        {/* Message Composer */}
        <MessageComposer
          channelId={channelId}
          channelName={channelName}
          workspaceId={activeWorkspaceId}
          colors={colors}
          text={text}
          onChangeText={setText}
          members={membersByChannel[channelId] || []}
          onSend={(content, options) => {
            if (editingMessage) {
              editMessage(editingMessage._id, channelId, content, options?.htmlContent);
              setEditingMessage(null);
            } else {
              sendMessage(channelId, content, options);
            }
            setReplyingTo(null);
          }}
          replyingTo={replyingTo}
          editingMessage={editingMessage}
          onCancelReply={() => { setReplyingTo(null); setText(""); }}
          onCancelEdit={() => { setEditingMessage(null); setText(""); }}
        />
      </KeyboardAvoidingView>

      {/* Reminder Modal */}
      <ReminderModal
        visible={!!reminderTarget}
        onClose={() => setReminderTarget(null)}
        onSetReminder={async (reminderAt) => {
          if (reminderTarget) {
            try {
              await laterAPI.updateReminder(reminderTarget, { reminderAt });
            } catch (err) {
              logger.error('Failed to set reminder:', err);
            }
          }
        }}
        colors={colors}
      />

      {/* Emoji Picker for Reactions (opened from long-press menu) */}
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

      {/* Custom Message Actions Modal (replaces inline modal) */}
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
          setReplyingTo(null);
          setText(actionMenuTarget.htmlContent || actionMenuTarget.content || "");
        }}
        onReply={(msg) => {
          navigation.navigate('ThreadDetail', {
            rootMessageId: msg._id,
            channelId,
            channelName,
            rootContent: msg.content,
            rootHtmlContent: msg.htmlContent,
            replyCount: msg.replyCount || 0,
            rootAuthor: msg.senderSnapshot?.name ? msg.senderSnapshot : msg.authorId,
            rootCreatedAt: msg.createdAt,
          });
          setActionMenuTarget(null);
        }}
        onDelete={() => {
          const msgId = actionMenuTarget._id;
          setTimeout(() => {
            Alert.alert("Delete Message", "Are you sure?", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => deleteMessage(msgId, channelId),
              },
            ]);
          }, 200);
        }}
        onCopyLink={async () => {
          const url = `flowtask://chat/${channelId}/${actionMenuTarget?._id}`;
          await Clipboard.setStringAsync(url);
          Toast.show({ type: 'success', text1: 'Link copied to clipboard' });
        }}
        onMarkUnread={async () => {
          try {
            await messageAPI.markUnread(channelId, actionMenuTarget._id);
            Toast.show({ type: 'success', text1: 'Marked as unread' });
            navigation.navigate("Main", { screen: "ChannelsTab" });
          } catch (error) {
            Toast.show({ type: 'error', text1: 'Failed to mark unread' });
          }
        }}
        onToggleNotifications={async () => {
          try {
            const threadId = actionMenuTarget.threadId || actionMenuTarget._id;
            await threadAPI.mute(threadId);
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
      </AppScreen>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      gap: 8,
    },
    backButton: {
      padding: 4,
    },
    headerCenter: {
      flex: 1,
    },
    headerTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: "700",
      flex: 1,
    },
    headerSubtitle: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 2,
      marginLeft: 28,
    },
    memberCount: {
      fontSize: 12,
    },
    onlineDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    onlineCount: {
      fontSize: 12,
    },
    dmStatusText: {
      fontSize: 12,
      marginTop: 2,
      marginLeft: 40,
    },
    headerActions: {
      flexDirection: "row",
      gap: 4,
    },
    headerButton: {
      padding: 8,
    },
    optionsMenu: {
      borderBottomWidth: 1,
      paddingVertical: 8,
    },
    optionItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
    },
    optionText: {
      fontSize: 15,
    },
    messageList: {
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    messageContainer: {
      flexDirection: "row",
      marginBottom: 4,
      maxWidth: "85%",
      gap: 8,
    },
    messageCompact: {
      marginBottom: 1,
    },
    myMessage: {
      alignSelf: "flex-end",
    },
    theirMessage: {
      alignSelf: "flex-start",
    },
    bubble: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 18,
      maxWidth: "100%",
    },
    senderRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 8,
      marginBottom: 2,
      marginLeft: 4,
    },
    senderName: {
      fontSize: 12,
      fontWeight: "700",
    },
    messageText: {
      fontSize: 15,
      lineHeight: 22,
    },
    timestamp: {
      fontSize: 10,
    },
    timestampRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 4,
      alignSelf: "flex-end",
    },
    editedLabel: {
      fontSize: 10,
      fontStyle: "italic",
    },
    replyPreview: {
      flexDirection: "row",
      alignItems: "center",
      borderLeftWidth: 3,
      paddingLeft: 8,
      marginBottom: 4,
      marginLeft: 4,
      gap: 4,
    },
    replyPreviewText: {
      fontSize: 12,
      flex: 1,
    },
    attachmentRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 6,
    },
    imageAttachment: {
      width: 200,
      height: 150,
      borderRadius: 8,
    },
    fileAttachment: {
      flexDirection: "row",
      alignItems: "center",
      padding: 8,
      borderRadius: 8,
      marginTop: 4,
      gap: 8,
    },
    threadIndicator: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 4,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      gap: 6,
    },
    threadAvatars: {
      flexDirection: "row",
      alignItems: "center",
    },
    threadText: {
      fontSize: 12,
      fontWeight: "600",
    },
    threadTime: {
      fontSize: 11,
      marginLeft: "auto",
    },
    dateSeparatorContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: 12,
      paddingHorizontal: 8,
    },
    dateSeparatorLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
    },
    dateSeparatorText: {
      fontSize: 12,
      fontWeight: "600",
      paddingHorizontal: 12,
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
    composerBanner: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderLeftWidth: 3,
      gap: 8,
    },
    composerBannerLabel: {
      fontSize: 12,
      fontWeight: "600",
    },
    composerBannerText: {
      fontSize: 13,
      marginTop: 1,
    },
    typingIndicator: {
      paddingHorizontal: 20,
      paddingVertical: 4,
    },
    typingText: {
      fontSize: 12,
      fontStyle: "italic",
    },
    tabBar: {
      flexDirection: 'row',
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    tabItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      gap: 6,
      position: 'relative',
    },
    tabItemActive: {},
    tabLabel: {
      fontSize: 13,
      fontWeight: '500',
    },
    tabLabelActive: {
      fontWeight: '700',
    },
    tabUnderline: {
      position: 'absolute',
      bottom: 0,
      left: 12,
      right: 12,
      height: 2,
      borderRadius: 1,
    },
    canvasTabContent: {
      flexGrow: 1,
      padding: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    canvasPlaceholder: {
      width: '100%',
      borderRadius: 16,
      borderWidth: 1,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      paddingHorizontal: 24,
      gap: 12,
    },
    canvasPlaceholderTitle: {
      fontSize: 18,
      fontWeight: '700',
    },
    canvasPlaceholderText: {
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 20,
    },
    inputBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderTopWidth: 1,
      gap: 8,
    },
    attachButton: {
      padding: 8,
    },
    inputContainer: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    input: {
      flex: 1,
      fontSize: 15,
      maxHeight: 100,
      paddingVertical: 8,
      ...(Platform.OS === "web" && {
        outlineWidth: 0,
        outlineStyle: "none",
      }),
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
    },
    actionsOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    actionsSheet: {
      borderRadius: 16,
      width: '100%',
      maxWidth: 300,
      paddingVertical: 12,
      borderWidth: 1,
      maxHeight: '80%',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 10,
      elevation: 5,
    },
    actionsHeader: {
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: 4,
    },
    actionsTitle: {
      fontSize: 16,
      fontWeight: '700',
    },
    actionsSnippet: {
      fontSize: 13,
    },
    actionsList: {
      paddingHorizontal: 8,
    },
    actionItem: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(0,0,0,0.05)',
    },
    actionItemText: {
      fontSize: 15,
      fontWeight: '500',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: 80,
      transform: [{ scaleY: -1 }],
    },
    emptyText: {
      fontSize: 15,
      textAlign: "center",
    },
  });

export default ChatScreen;