import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { scale, verticalScale, moderateScale } from '../../utils/responsive';
import useResponsive from '../../hooks/useResponsive';
import { useWindowDimensions } from 'react-native';

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Keyboard,
  Platform,
  ActivityIndicator,
  Dimensions,
  Alert,
  Image,
  Linking,
  ScrollView,
  Modal,
  AppState,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useShallow } from 'zustand/react/shallow';
import ChatMessageItem from "../../components/ChatMessageItem";
import { useChatStore } from "../../stores/chatStore";
import { useAuthStore } from "../../stores/authStore";
import { useChannelStore } from "../../stores/channelStore";
import { useThemeStore } from "../../stores/themeStore";
import { useLaterStore } from "../../stores/laterStore";
import { laterAPI, pinsAPI, messageAPI, threadAPI, channelAPI } from "../../services/api";
import { emitTyping, getSocket } from "../../services/socket";
import { AppAvatar, AppScreen, HeaderBackButton, MobileFileCard } from "../../components/common";
import KeyboardAwareContainer from "../../components/common/KeyboardAwareContainer";
import RichText from "../../components/RichText";
import ReactionBar from "../../components/ReactionBar";
import MediaPickerSheet from "../../components/MediaPickerSheet";
import GifPickerModal from "../../components/GifPickerModal";
import MessageActionSheet from "../../components/MessageActionSheet";
import ForwardMessageModal from "../../components/ForwardMessageModal";
import EmojiPickerModal from "../../components/EmojiPickerModal";
import ReminderModal from "../../components/ReminderModal";
import AudioMessagePlayer from "../../components/AudioMessagePlayer";
import VideoMessagePlayer from "../../components/VideoMessagePlayer";
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
import { usePreferencesStore } from '../../stores/preferencesStore';
import { formatMessageTime } from '../../utils/dateUtils';
import logger from '../../utils/logger';
import ENV from '../../config/environment';
import { normalizeMediaUrl, getMessageAttachments } from '../../utils/mediaUtils';
import { resolveReplyToSenderName, resolveMessageSenderName } from '../../utils/replyUtils';
import MessageStatusTicks from '../../components/MessageStatusTicks';
import MessageInfoModal from '../../components/MessageInfoModal';
import GifRenderer from '../../components/GifRenderer';
// ─── Helpers ─────────────────────────────────────────────────────────────────

const getAuthorId = (msg) => {
  if (!msg) return null;
  if (typeof msg.authorId === "string") return msg.authorId;
  return msg.authorId?._id || msg.senderSnapshot?._id || null;
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
  return formatMessageTime(dateStr);
};

const isImageUrl = (url) => {
  if (!url) return false;
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(url);
};



// ─── ChatScreen ──────────────────────────────────────────────────────────────

const ChatScreen = ({ route, navigation }) => {
  const { channelId, channelName, initialTab, canvasId: deepLinkCanvasId, messageId: targetMessageId } = route.params || {};
  const { isTablet, isDesktop, width } = useResponsive();
  const maxBubbleWidth = isTablet || isDesktop || width > 600 ? 580 : '85%';

  const [headerHeight, setHeaderHeight] = useState(56);

  // Android: KeyboardAwareContainer needs to apply padding to keep composer above keyboard.
  // iOS: AppScreen owns bottom inset.
  const keyboardProps = {
    disablePadding: false,
    bottomSafeContext: Platform.OS === 'ios',
  };
  const appScreenEdges =
    Platform.OS === 'ios' ? ['top', 'bottom'] : ['top', 'left', 'right'];

  // Granular store subscriptions — prevent unnecessary re-renders
  const messages = useChatStore(useShallow((s) => s.messagesByChannel[channelId] || []));
  const isLoadingMessages = useChatStore((s) => s.isLoadingMessages);
  const channelHasMore = useChatStore((s) => s.hasMore[channelId]);
  const savedMessageIds = useLaterStore((s) => s.savedMessageIds);
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
  // Subscribe to workspace members for live presence updates in the DM header
  const workspaceMembers = useWorkspaceStore(useShallow((s) => s.members));
  const toggleSaveMessage = useLaterStore((s) => s.toggleSaveMessage);
  const isMessageSaved = useLaterStore((s) => s.isMessageSaved);

  const [text, setText] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const [showSearch, setShowSearch] = useState(!!route.params?.searchQuery);
  const [searchQuery, setSearchQuery] = useState(route.params?.searchQuery || "");
  const [searchResults, setSearchResults] = useState([]);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [emojiPickerTarget, setEmojiPickerTarget] = useState(null); // messageId or null
  const [replyingTo, setReplyingTo] = useState(null); // message object or null
  const [editingMessage, setEditingMessage] = useState(null); // message object or null
  const [reminderTarget, setReminderTarget] = useState(null); // messageId or null
  const [actionMenuTarget, setActionMenuTarget] = useState(null); // message object or null
  const [actionAttachmentTarget, setActionAttachmentTarget] = useState(null); // attachment object or null
  const [forwardTarget, setForwardTarget] = useState(null);
  const [scrolledToMessageId, setScrolledToMessageId] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [messageInfoTarget, setMessageInfoTarget] = useState(null);

  // Auto-scroll refs
  const isAtBottomRef = useRef(true);
  const pendingAutoScroll = useRef(false);

  // ─── Message Info handler ─────────────────────────────────────────────
  const handleMessageInfo = useCallback((message) => {
    setMessageInfoTarget(message);
  }, []);

   

    
   
  
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
        rootContentType: rootMessage.contentType || rootMessage.type,
        rootGifMeta: rootMessage.gifMeta || undefined,
        rootAudioMeta: rootMessage.audioMeta || undefined,
        rootVideoMeta: rootMessage.videoMeta || undefined,
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
  const typingUsers = useChatStore(useShallow((s) => {
    const cid = channelId != null ? String(channelId) : null;
    const selfId = user?._id != null ? String(user._id) : null;
    const typingData = (cid && s.typingByChannel[cid]) || {};
    return Object.entries(typingData)
      .filter(([id]) => id !== selfId)
      .map(([, name]) => name);
  }));
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
    const base = other ?? {
      _id: channel?.dmRecipientId,
      name: channel?.name || channelName,
      avatar: channel?.avatar || null,
      onlineStatus: channel?.onlineStatus || 'offline',
    };
    // Merge live onlineStatus from workspaceStore so presence socket events
    // are reflected in the header avatar immediately without a full member refetch.
    const recipientId = base._id;
    const liveMember = recipientId
      ? workspaceMembers.find(
          (m) => m._id === recipientId || m.userId?._id === recipientId
        )
      : null;
    const liveStatus =
      liveMember?.onlineStatus ?? liveMember?.userId?.onlineStatus;
    return liveStatus ? { ...base, onlineStatus: liveStatus } : base;
  }, [isDM, channelMembers, channel, user, channelName, workspaceMembers]);

  const channelNameToShow = useMemo(() => {
    if (isDM && dmUser) return dmUser.name;
    return channel?.name || channelName || 'Channel';
  }, [channel, channelName, isDM, dmUser]);

  const flatListRef = useRef(null);
  const { height } = useWindowDimensions();

  useEffect(() => {
    const initData = async () => {
      if (!channelId) return;

      // Ensure we are in the channel socket room for typing + live messages.
      // fetchChannels joins all rooms, but that can race with opening a chat.
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('channel:join', String(channelId));
      }

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

  // Track active conversation for unread/push/receipts parity with web
  useEffect(() => {
    if (!channelId) return;

    const { conversationPresence } = require('../../services/conversationPresence');
    const setActiveChannel = useChannelStore.getState().setActiveChannel;
    const channel = useChannelStore.getState().channels.find(
      (ch) => String(ch._id) === String(channelId)
    );
    const type = channel?.type === 'dm' ? 'dm' : 'channel';

    setActiveChannel(channelId);
    conversationPresence.setActive(channelId, type);

    return () => {
      conversationPresence.clearActive();
      // Only clear store activeChannel if it still points at this screen's channel
      const current = useChannelStore.getState().activeChannelId;
      if (current != null && String(current) === String(channelId)) {
        useChannelStore.setState({ activeChannelId: null });
      }
    };
  }, [channelId]);

  useEffect(() => {
    if (channelId) {
      // Only auto-mark read while the app is foregrounded
      if (AppState.currentState !== 'active') return;

      markAsRead(channelId);
      
      const socket = getSocket();
      if (socket && socket.connected && messages.length > 0) {
        messages.forEach(msg => {
          const authorId = typeof msg.authorId === 'object' ? msg.authorId?._id : msg.authorId;
          if (authorId !== user?._id) {
            socket.emit('message:read', { messageId: msg._id, channelId });
          }
        });
      }
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
        const textToSearch = m?.content || m?.htmlContent || '';
        if (typeof textToSearch === 'string' && textToSearch.toLowerCase().includes(q)) {
          matches.push(idx);
        }
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
    (item, attachment = null) => {
      setActionMenuTarget(item);
      setActionAttachmentTarget(attachment);
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

  const handleReplyPreviewPress = useCallback((parentId) => {
    if (!parentId) return;
    const targetId = String(parentId);
    const index = displayedMessages.findIndex(
      (m) => String(m._id) === targetId
    );
    if (index === -1) return;

    // Flash highlight first so the user sees the target even if already nearby
    setHighlightedMessageId(targetId);

    const scroll = () => {
      try {
        flatListRef.current?.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.45,
        });
      } catch (_) {
        // Fallback: approximate offset for inverted list
        flatListRef.current?.scrollToOffset({
          offset: Math.max(0, index * 80),
          animated: true,
        });
      }
    };

    // Two-phase scroll helps when the cell isn't mounted yet
    requestAnimationFrame(scroll);
    setTimeout(scroll, 120);

    setTimeout(() => {
      setHighlightedMessageId((current) =>
        String(current) === targetId ? null : current
      );
    }, 2800);
  }, [displayedMessages]);

  const renderMessage = useCallback(({ item, index }) => {
    const prevItem = displayedMessages[index + 1];
    const nextItem = displayedMessages[index - 1];

    // Enrich incomplete replyTo snapshots from the live parent message / members
    let enrichedItem = item;
    if (item.replyTo || item.parentMessageId) {
      const parentId = item.replyTo?.messageId || item.parentMessageId;
      const parent = displayedMessages.find((m) => String(m._id) === String(parentId));
      const members = membersByChannel[channelId] || [];
      const resolvedName = resolveReplyToSenderName(item.replyTo, parent, members);
      const existingContent = (item.replyTo?.content || "").trim();
      const contentFromParent = (parent?.content || "").trim();

      enrichedItem = {
        ...item,
        replyTo: {
          ...(item.replyTo || {}),
          messageId: parentId,
          authorId:
            item.replyTo?.authorId ||
            parent?.authorId?._id ||
            parent?.authorId ||
            null,
          senderName: resolvedName,
          content: existingContent || contentFromParent || item.replyTo?.content || "",
          attachment: item.replyTo?.attachment,
        },
      };
    }

    return (
      <ChatMessageItem
        item={enrichedItem}
        prevItem={prevItem}
        nextItem={nextItem}
        user={user}
        colors={colors}
        styles={styles}
        searchQuery={searchQuery}
        searchResults={searchResults}
        currentMatch={currentMatch}
        index={index}
        savedMessageIds={savedMessageIds}
        highlightedMessageId={highlightedMessageId}
        membersByChannel={membersByChannel}
        channelId={channelId}
        channelName={channelName}
        maxBubbleWidth={maxBubbleWidth}
        showMessageActions={showMessageActions}
        addReaction={addReaction}
        removeReaction={removeReaction}
        setEmojiPickerTarget={setEmojiPickerTarget}
        navigation={navigation}
        renderDateSeparator={renderDateSeparator}
        onReplyPreviewPress={handleReplyPreviewPress}
      />
    );
  }, [
    displayedMessages, user, colors, styles, searchQuery, searchResults,
    currentMatch, savedMessageIds, highlightedMessageId, membersByChannel,
    channelId, channelName, maxBubbleWidth, showMessageActions, addReaction,
    removeReaction, setEmojiPickerTarget, navigation, handleReplyPreviewPress
  ]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <AppScreen 
      style={[styles.container, { backgroundColor: colors.background }]} 
      edges={appScreenEdges}
    > 
      <View style={{ flex: 1 }}>


      {/* Custom Header */}
      <View
        style={[styles.header, { borderBottomColor: colors.border }]}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <HeaderBackButton onPress={() => navigation.goBack()} />

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
                  {1 + (channel?.canvasTabs?.length || 0)} Tab
                </Text>
              </>
            </View>
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
        <>
          <TouchableOpacity
            activeOpacity={1}
            style={[StyleSheet.absoluteFill, { zIndex: 999, backgroundColor: 'transparent' }]}
            onPress={() => setShowOptions(false)}
          />
          <View
            style={[
              styles.optionsMenu,
              {
                backgroundColor: colors.background,
                borderBottomColor: colors.border,
                position: 'absolute',
                top: headerHeight,
                left: 0,
                right: 0,
                zIndex: 1000,
                elevation: 5,
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
                {isDM ? "Conversation Details" : "Channel Info"}
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
                navigation.navigate('ChannelSearch', { 
                  channelId, 
                  channelName: channelNameToShow, 
                  isPrivate 
                });
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
          </View>
        </>
      )}

        <KeyboardAwareContainer
          style={{ flex: 1 }}
          {...keyboardProps}
        >
          <FlatList
            ref={flatListRef}
            style={{ flex: 1 }}
          data={displayedMessages}
          renderItem={renderMessage}
          keyExtractor={(item) => item._id}
          inverted
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[styles.messageList, { flexGrow: 1 }]}
          onScroll={(e) => {
            // Inverted list: offset 0 is the bottom
            const offsetY = e.nativeEvent.contentOffset.y;
            // Increased threshold to 300 to tolerate rapid layout shifts when receiving multiple messages
            isAtBottomRef.current = offsetY <= 300;
          }}
          scrollEventThrottle={16}
          onContentSizeChange={() => {
            if (pendingAutoScroll.current || isAtBottomRef.current) {
              flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
              pendingAutoScroll.current = false;
            }
          }}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onEndReached={() => {
            if (channelHasMore && !isLoadingMessages) {
              const oldest = messages[0];
              if (oldest) fetchMessages(channelId, oldest._id);
            }
          }}
          onEndReachedThreshold={0.3}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={Platform.OS !== 'web'}
          onScrollToIndexFailed={(info) => {
            flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
            setTimeout(() => {
              try {
                flatListRef.current?.scrollToIndex({ index: info.index, animated: true });
              } catch (e) {
                // Ignore if it still fails
              }
            }, 100);
          }}
          ListFooterComponent={
            isLoadingMessages ? (
              <ActivityIndicator
                style={{ margin: moderateScale(10) }}
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
        <View>
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
                editMessage(editingMessage._id, channelId, content, options?.htmlContent, options?.fileReferences);
                setEditingMessage(null);
              } else {
                pendingAutoScroll.current = true;
                sendMessage(channelId, content, options);
              }
              setReplyingTo(null);
            }}
            replyingTo={replyingTo}
            editingMessage={editingMessage}
            onCancelReply={() => { setReplyingTo(null); setText(""); }}
            onCancelEdit={() => { setEditingMessage(null); setText(""); }}
          />
        </View>
      </KeyboardAwareContainer>

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
        onClose={() => {
          setActionMenuTarget(null);
          setActionAttachmentTarget(null);
        }}
        message={actionMenuTarget}
        attachment={actionAttachmentTarget}
        colors={colors}
        user={user}
        isSaved={isMessageSaved?.(actionMenuTarget?._id)}
        onReact={(emoji) => {
          if (actionMenuTarget) addReaction(actionMenuTarget._id, emoji);
        }}
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
            await pinsAPI.pin(msg._id);
            Toast.show({ type: 'success', text1: 'Message pinned' });
          } catch (error) {
            Toast.show({ type: 'error', text1: 'Failed to pin message' });
          }
          setActionMenuTarget(null);
          setActionAttachmentTarget(null);
        }}
        onSave={() => toggleSaveMessage?.(actionMenuTarget?._id)}
        onRemind={() => setReminderTarget(actionMenuTarget?._id)}
        onReply={() => {
          const msg = actionMenuTarget;
          const members = membersByChannel[channelId] || [];
          const resolvedName = resolveMessageSenderName(msg, members) || "Someone";
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
        onEdit={() => {
          setEditingMessage(actionMenuTarget);
          setReplyingTo(null);
          setText(actionMenuTarget.htmlContent || actionMenuTarget.content || "");
        }}
        onDelete={() => {
          const msgId = actionMenuTarget._id;
          const isAttachment = !!actionAttachmentTarget;
          setTimeout(() => {
            Alert.alert(
              isAttachment ? "Delete Entire Message" : "Delete Message",
              isAttachment ? "You can only delete the entire message, not individual attachments. Are you sure?" : "Are you sure you want to delete this message?",
              [
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
        onMessageInfo={isDM ? null : handleMessageInfo}
      />

      {/* Forward Message Modal */}
      <ForwardMessageModal
        visible={!!forwardTarget}
        onClose={() => setForwardTarget(null)}
        message={forwardTarget}
        colors={colors}
      />

      {/* Message Info Modal */}
      <MessageInfoModal
        visible={!!messageInfoTarget}
        onClose={() => setMessageInfoTarget(null)}
        message={messageInfoTarget}
        colors={colors}
      />
      </View>
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
      paddingHorizontal: moderateScale(12),
      paddingVertical: moderateScale(12),
      borderBottomWidth: 1,
      gap: 8,
    },
    backButton: {
      padding: moderateScale(4),
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
      fontSize: moderateScale(17),
      fontWeight: "700",
      flex: 1,
    },
    headerSubtitle: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: moderateScale(2),
      marginLeft: moderateScale(28),
    },
    memberCount: {
      fontSize: moderateScale(12),
    },
    onlineDot: {
      width: moderateScale(6),
      height: moderateScale(6),
      borderRadius: moderateScale(3),
    },
    onlineCount: {
      fontSize: moderateScale(12),
    },
    dmStatusText: {
      fontSize: moderateScale(12),
      marginTop: moderateScale(2),
      marginLeft: moderateScale(40),
    },
    headerActions: {
      flexDirection: "row",
      gap: 4,
    },
    headerButton: {
      padding: moderateScale(8),
    },
    optionsMenu: {
      borderBottomWidth: 1,
      paddingVertical: moderateScale(8),
    },
    optionItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: moderateScale(16),
      paddingVertical: moderateScale(12),
      gap: 12,
    },
    optionText: {
      fontSize: moderateScale(15),
    },
    messageList: {
      paddingHorizontal: moderateScale(12),
      paddingVertical: moderateScale(12),
    },
    messageContainer: {
      flexDirection: "row",
      marginBottom: moderateScale(4),
      gap: 8,
      // Full-width row — alignment is controlled by justifyContent on myMessage/theirMessage
      // Never use alignSelf/maxWidth here as it causes flex-shrink collapse of bubble content
    },
    messageCompact: {
      marginBottom: moderateScale(1),
    },
    myMessage: {
      justifyContent: "flex-end",
    },
    theirMessage: {
      justifyContent: "flex-start",
    },
    // Content column (sender name + bubble + reactions + thread)
    messageContent: {
      flexShrink: 1,
      maxWidth: '100%',
    },
    messageContentMe: {
      alignItems: "flex-end",
    },
    messageContentThem: {
      alignItems: "flex-start",
    },
    bubble: {
      paddingHorizontal: moderateScale(12),
      paddingVertical: moderateScale(8),
      borderRadius: moderateScale(18),
      flexShrink: 1,
      maxWidth: '100%',
    },
    senderRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 8,
      marginBottom: moderateScale(2),
      marginLeft: moderateScale(4),
      flexShrink: 1,
      maxWidth: '100%',
    },
    senderName: {
      fontSize: moderateScale(12),
      fontWeight: "700",
      flexShrink: 1,
    },
    messageText: {
      fontSize: moderateScale(15),
      lineHeight: 22,
      flexShrink: 1,
    },
    timestamp: {
      fontSize: moderateScale(10),
    },
    timestampRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: moderateScale(4),
      alignSelf: "flex-end",
    },
    editedLabel: {
      fontSize: moderateScale(10),
      fontStyle: "italic",
    },
    replyPreview: {
      flexDirection: "row",
      alignItems: "center",
      borderLeftWidth: 3,
      paddingLeft: moderateScale(8),
      marginBottom: moderateScale(4),
      marginLeft: moderateScale(4),
      gap: 4,
    },
    replyPreviewText: {
      fontSize: moderateScale(12),
      flex: 1,
    },
    attachmentRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: moderateScale(6),
    },
    imageAttachment: {
      width: '100%',
      maxWidth: scale(280),
      aspectRatio: 1.33,
      height: 'auto',
      borderRadius: moderateScale(8),
    },
    fileAttachment: {
      flexDirection: "row",
      alignItems: "center",
      padding: moderateScale(8),
      borderRadius: moderateScale(8),
      marginTop: moderateScale(4),
      gap: 8,
    },
    threadIndicator: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: moderateScale(4),
      paddingHorizontal: moderateScale(8),
      paddingVertical: moderateScale(6),
      borderRadius: moderateScale(8),
      borderWidth: 1,
      gap: 6,
    },
    threadAvatars: {
      flexDirection: "row",
      alignItems: "center",
    },
    threadText: {
      fontSize: moderateScale(12),
      fontWeight: "600",
    },
    threadTime: {
      fontSize: moderateScale(11),
      marginLeft: "auto",
    },
    dateSeparatorContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: moderateScale(12),
      paddingHorizontal: moderateScale(8),
    },
    dateSeparatorLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
    },
    dateSeparatorText: {
      fontSize: moderateScale(12),
      fontWeight: "600",
      paddingHorizontal: moderateScale(12),
    },
    systemMessageContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: moderateScale(12),
      paddingHorizontal: moderateScale(16),
      gap: 12,
    },
    systemMessageLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
    },
    systemMessageText: {
      fontSize: moderateScale(12),
      fontStyle: "italic",
      textAlign: "center",
    },
    forwardedRow: {
      flexDirection: "row",
      alignItems: "center",
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingBottom: moderateScale(4),
      marginBottom: moderateScale(6),
      gap: 4,
    },
    forwardedText: {
      fontSize: moderateScale(12),
      fontStyle: "italic",
    },
    composerBanner: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: moderateScale(16),
      paddingVertical: moderateScale(8),
      borderLeftWidth: 3,
      gap: 8,
    },
    composerBannerLabel: {
      fontSize: moderateScale(12),
      fontWeight: "600",
    },
    composerBannerText: {
      fontSize: moderateScale(13),
      marginTop: moderateScale(1),
    },
    typingIndicator: {
      paddingHorizontal: moderateScale(20),
      paddingVertical: moderateScale(4),
    },
    typingText: {
      fontSize: moderateScale(12),
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
      paddingVertical: moderateScale(10),
      gap: 6,
      position: 'relative',
    },
    tabItemActive: {},
    tabLabel: {
      fontSize: moderateScale(13),
      fontWeight: '500',
    },
    tabLabelActive: {
      fontWeight: '700',
    },
    tabUnderline: {
      position: 'absolute',
      bottom: moderateScale(0),
      left: moderateScale(12),
      right: moderateScale(12),
      height: moderateScale(2),
      borderRadius: moderateScale(1),
    },
    canvasTabContent: {
      flexGrow: 1,
      padding: moderateScale(24),
      alignItems: 'center',
      justifyContent: 'center',
    },
    canvasPlaceholder: {
      width: '100%',
      borderRadius: moderateScale(16),
      borderWidth: 1,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: moderateScale(48),
      paddingHorizontal: moderateScale(24),
      gap: 12,
    },
    canvasPlaceholderTitle: {
      fontSize: moderateScale(18),
      fontWeight: '700',
    },
    canvasPlaceholderText: {
      fontSize: moderateScale(14),
      textAlign: 'center',
      lineHeight: 20,
    },
    inputBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: moderateScale(12),
      paddingVertical: moderateScale(8),
      borderTopWidth: 1,
      gap: 8,
    },
    attachButton: {
      padding: moderateScale(8),
    },
    inputContainer: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      borderRadius: moderateScale(20),
      paddingHorizontal: moderateScale(12),
      paddingVertical: moderateScale(4),
    },
    input: {
      flex: 1,
      fontSize: moderateScale(15),
      maxHeight: moderateScale(100),
      paddingVertical: moderateScale(8),
      ...(Platform.OS === "web" && {
        outlineWidth: 0,
        outlineStyle: "none",
      }),
    },
    sendButton: {
      width: moderateScale(40),
      height: moderateScale(40),
      borderRadius: moderateScale(20),
      justifyContent: "center",
      alignItems: "center",
    },
    actionsOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: moderateScale(24),
    },
    actionsSheet: {
      borderRadius: moderateScale(16),
      width: '100%',
      maxWidth: moderateScale(300),
      paddingVertical: moderateScale(12),
      borderWidth: 1,
      maxHeight: '80%',
      shadowColor: '#000000',
      shadowOffset: { width: moderateScale(0), height: moderateScale(4) },
      shadowOpacity: 0.15,
      shadowRadius: 10,
      elevation: 5,
    },
    actionsHeader: {
      paddingHorizontal: moderateScale(20),
      paddingBottom: moderateScale(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: 4,
    },
    actionsTitle: {
      fontSize: moderateScale(16),
      fontWeight: '700',
    },
    actionsSnippet: {
      fontSize: moderateScale(13),
    },
    actionsList: {
      paddingHorizontal: scale(8),
    },
    actionItem: {
      paddingVertical: verticalScale(14),
      paddingHorizontal: scale(16),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(0,0,0,0.05)',
    },
    actionItemText: {
      fontSize: moderateScale(15),
      fontWeight: '500',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: verticalScale(80),
      transform: Platform.OS === 'android' ? [{ scaleY: -1 }, { scaleX: -1 }] : [{ scaleY: -1 }],
    },
    emptyText: {
      fontSize: moderateScale(15),
      textAlign: "center",
    },
  });

export default ChatScreen;