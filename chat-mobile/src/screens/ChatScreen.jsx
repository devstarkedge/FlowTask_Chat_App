import React, { useState, useEffect, useRef, useMemo } from 'react';
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
} from 'react-native';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { useChannelStore } from '../stores/channelStore';
import { useThemeStore } from '../stores/themeStore';
import { emitTyping } from '../services/socket';
import Avatar from '../components/Avatar';
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
  ChevronLeft,
  Lock,
  Volume2,
  Phone,
  Video,
  FileText,
} from 'lucide-react-native';
import SearchBar from '../components/SearchBar';

const ChatScreen = ({ route, navigation }) => {
  const { channelId, channelName } = route.params;
  const { 
    messagesByChannel, 
    fetchMessages, 
    sendMessage, 
    isLoadingMessages,
    typingByChannel 
  } = useChatStore();
  const { user } = useAuthStore();
  const { channels } = useChannelStore();
  const { colors } = useThemeStore();
  
  const [text, setText] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [currentMatch, setCurrentMatch] = useState(0);
  const messages = messagesByChannel[channelId] || [];
  const displayedMessages = useMemo(() => [...messages].reverse(), [messages]);
  const typingUsers = Object.values(typingByChannel[channelId] || {});
  const channel = channels.find(ch => ch._id === channelId);
  const memberCount = channel?.members?.length || 0;
  const onlineCount = channel?.members?.filter(m => m.onlineStatus === 'online').length || 0;
  
  const isDM = channel?.type === 'dm';
  const isSystem = channel?.type === 'system';
  const isPrivate = channel?.visibility === 'private' || channel?.type === 'private';
  // Get DM user from channel members
  const dmUser = isDM ? channel?.members?.find(m => m._id !== user?._id) : null;
  
  const flatListRef = useRef(null);

  useEffect(() => {
    fetchMessages(channelId);
  }, [channelId]);

  useEffect(() => {
    if (!searchQuery) {
      setSearchResults([]);
      setCurrentMatch(0);
      return;
    }
    const q = searchQuery.trim().toLowerCase();
    const matches = [];
    displayedMessages.forEach((m, idx) => {
      if (m?.content && m.content.toLowerCase().includes(q)) matches.push(idx);
    });
    setSearchResults(matches);
    setCurrentMatch(0);
    if (matches.length > 0) {
      // small timeout to allow UI to render
      setTimeout(() => scrollToIndex(matches[0]), 80);
    }
  }, [searchQuery, displayedMessages]);

  const handleSend = () => {
    if (text.trim()) {
      sendMessage(channelId, text.trim());
      setText('');
      emitTyping(channelId, false);
    }
  };

  const handleTextChange = (val) => {
    setText(val);
    emitTyping(channelId, val.length > 0);
  };

  const scrollToIndex = (index) => {
    if (!flatListRef.current || index == null) return;
    try {
      flatListRef.current.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    } catch (err) {
      // fallback using approximate height
      const approxItemHeight = 80;
      flatListRef.current.scrollToOffset({ offset: index * approxItemHeight, animated: true });
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
    const prev = (currentMatch - 1 + searchResults.length) % searchResults.length;
    setCurrentMatch(prev);
    scrollToIndex(searchResults[prev]);
  };

  const renderMessage = ({ item, index }) => {
    const isMe = item.authorId?._id === user?._id || item.authorId === user?._id;
    const isMatch = searchQuery && item?.content && item.content.toLowerCase().includes(searchQuery.toLowerCase());
    const isHighlighted = isMatch && searchResults.length && searchResults[currentMatch] === index;
    
    const messageSender = item.senderSnapshot || item.authorId;
    
    return (
      <View style={[styles.messageContainer, isMe ? styles.myMessage : styles.theirMessage]}>
        {!isMe && (
          <Avatar 
            user={messageSender}
            size={28}
            showStatus={false}
            style={{ marginTop: 4 }}
          />
        )}
        <View style={[
          styles.bubble,
          { backgroundColor: isMe ? colors.messageBubbleSent : colors.messageBubbleReceived },
          isHighlighted && { borderWidth: 2, borderColor: colors.primary }
        ]}>
          {!isMe && (
            <Text style={[styles.senderName, { color: colors.textSecondary }]}>
              {messageSender?.name || 'Unknown'}
            </Text>
          )}
          <Text style={[
            styles.messageText, 
            { color: isMe ? colors.messageTextSent : colors.messageTextReceived }
          ]}>
            {item.content}
          </Text>
          <Text style={[
            styles.timestamp, 
            { color: isMe ? colors.messageTextSent : colors.textTertiary },
            isMe && { opacity: 0.7 }
          ]}>
            {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.effectiveTheme === 'dark' ? 'light-content' : 'dark-content'} />
      
      {/* Custom Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <View style={styles.headerTitleRow}>
            {isDM ? (
              <Avatar 
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
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {channelName}
            </Text>
          </View>
          {!isDM && (
            <View style={styles.headerSubtitle}><Text style={[styles.memberCount, { color: colors.textSecondary }]}>{memberCount} Members</Text><View style={[styles.onlineDot, { backgroundColor: colors.online }]} /><Text style={[styles.onlineCount, { color: colors.online }]}>{onlineCount} Online</Text></View>
          )}
          {isDM && dmUser && (
            <Text style={[styles.dmStatusText, { color: dmUser.onlineStatus === 'online' ? colors.online : colors.textSecondary }]}>
              {dmUser.onlineStatus === 'online' ? 'Online' : 'Offline'}
            </Text>
          )}
        </View>

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
        <View style={[styles.optionsMenu, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <TouchableOpacity 
            style={styles.optionItem}
            onPress={() => {
              setShowOptions(false);
              navigation.navigate('ChannelDetails', { channelName, memberCount });
            }}
          ><Users size={18} color={colors.textSecondary} /><Text style={[styles.optionText, { color: colors.textPrimary }]}>{isDM ? 'View Profile' : 'Channel Info'}</Text></TouchableOpacity>
            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => { setShowOptions(false); navigation.navigate('Files', { channelId, channelName }); }}
            ><FileText size={18} color={colors.textSecondary} /><Text style={[styles.optionText, { color: colors.textPrimary }]}>Files</Text></TouchableOpacity>
          <TouchableOpacity
            style={styles.optionItem}
            onPress={() => { setShowOptions(false); setShowSearch(true); }}
          ><Search size={18} color={colors.textSecondary} /><Text style={[styles.optionText, { color: colors.textPrimary }]}>Search</Text></TouchableOpacity>
          <TouchableOpacity style={styles.optionItem}><Pin size={18} color={colors.textSecondary} /><Text style={[styles.optionText, { color: colors.textPrimary }]}>Pinned Messages</Text></TouchableOpacity>
          <TouchableOpacity style={styles.optionItem}><Bell size={18} color={colors.textSecondary} /><Text style={[styles.optionText, { color: colors.textPrimary }]}>Notifications</Text></TouchableOpacity>
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={displayedMessages}
          renderItem={renderMessage}
          keyExtractor={(item) => item._id}
          inverted
          contentContainerStyle={styles.messageList}
          onEndReached={() => {/* TODO: Pagination */}}
          ListFooterComponent={isLoadingMessages ? <ActivityIndicator style={{ margin: 10 }} color={colors.primary} /> : null}
        />

        {/* Typing Indicator */}
        {typingUsers.length > 0 && (
          <View style={styles.typingIndicator}><Text style={[styles.typingText, { color: colors.textSecondary }]}>{typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...</Text></View>
        )}

        {/* Search Bar (above input) */}
        {showSearch && (
          <SearchBar
            query={searchQuery}
            onChangeQuery={(q) => setSearchQuery(q)}
            onClose={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}
            onNext={goToNextMatch}
            onPrev={goToPrevMatch}
            currentIndex={currentMatch}
            total={searchResults.length}
          />
        )}

        {/* Input Bar */}
        <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <TouchableOpacity style={styles.attachButton}><ImageIcon size={22} color={colors.textSecondary} /></TouchableOpacity>
          <View style={[styles.inputContainer, { backgroundColor: colors.inputBackground }]}><TextInput
              style={[styles.input, { color: colors.inputText }]}
              placeholder="Message..."
              placeholderTextColor={colors.inputPlaceholder}
              value={text}
              onChangeText={handleTextChange}
              multiline
            /><TouchableOpacity><Smile size={22} color={colors.textSecondary} /></TouchableOpacity></View>
          <TouchableOpacity 
            style={[
              styles.sendButton, 
              { backgroundColor: text.trim() ? colors.primary : colors.border }
            ]} 
            onPress={handleSend}
            disabled={!text.trim()}
          ><Send size={18} color={colors.textInverse} /></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    gap: 8,
  },
  backButton: {
    padding: 4,
  },
  headerCenter: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  headerSubtitle: {
    flexDirection: 'row',
    alignItems: 'center',
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
    flexDirection: 'row',
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  optionText: {
    fontSize: 15,
  },
  messageList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    maxWidth: '85%',
  },
  myMessage: {
    alignSelf: 'flex-end',
  },
  theirMessage: {
    alignSelf: 'flex-start',
    gap: 8,
  },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  typingIndicator: {
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  typingText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  input: {
    flex: 1,
    fontSize: 15,
    maxHeight: 100,
    paddingVertical: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ChatScreen;
