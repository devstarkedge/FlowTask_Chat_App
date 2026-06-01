import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react-native';

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
  const messages = messagesByChannel[channelId] || [];
  const typingUsers = Object.values(typingByChannel[channelId] || {});
  const channel = channels.find(ch => ch._id === channelId);
  const memberCount = channel?.members?.length || 0;
  const onlineCount = 8; // TODO: Get from real data
  
  const isDM = channel?.type === 'dm';
  const isSystem = channel?.type === 'system';
  const isPrivate = channel?.visibility === 'private' || channel?.type === 'private';
  
  const flatListRef = useRef(null);

  useEffect(() => {
    fetchMessages(channelId);
  }, [channelId]);

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

  const renderMessage = ({ item }) => {
    const isMe = item.authorId?._id === user?._id || item.authorId === user?._id;
    return (
      <View style={[styles.messageContainer, isMe ? styles.myMessage : styles.theirMessage]}>
        {!isMe && (
          <View style={[styles.avatarMini, { backgroundColor: colors.backgroundTertiary }]}>
            <Text style={[styles.avatarMiniText, { color: colors.textSecondary }]}>
              {item.senderSnapshot?.name?.substring(0, 1).toUpperCase() || '?'}
            </Text>
          </View>
        )}
        <View style={[
          styles.bubble, 
          { backgroundColor: isMe ? colors.messageBubbleSent : colors.messageBubbleReceived }
        ]}>
          {!isMe && (
            <Text style={[styles.senderName, { color: colors.textSecondary }]}>
              {item.senderSnapshot?.name}
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
              <View style={[styles.dmAvatar, { backgroundColor: colors.backgroundTertiary }]}>
                <Text style={[styles.dmAvatarText, { color: colors.textSecondary }]}>
                  {channelName?.substring(0, 1).toUpperCase()}
                </Text>
                <View style={[styles.dmStatus, { backgroundColor: colors.online }]} />
              </View>
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
            <View style={styles.headerSubtitle}>
              <Text style={[styles.memberCount, { color: colors.textSecondary }]}>
                {memberCount} Members
              </Text>
              <View style={[styles.onlineDot, { backgroundColor: colors.online }]} />
              <Text style={[styles.onlineCount, { color: colors.online }]}>
                {onlineCount} Online
              </Text>
            </View>
          )}
          {isDM && (
            <Text style={[styles.dmStatus, { color: colors.online }]}>Online</Text>
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
          >
            <Users size={18} color={colors.textSecondary} />
            <Text style={[styles.optionText, { color: colors.textPrimary }]}>
              {isDM ? 'View Profile' : 'Channel Info'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.optionItem}>
            <Search size={18} color={colors.textSecondary} />
            <Text style={[styles.optionText, { color: colors.textPrimary }]}>Search</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.optionItem}>
            <Pin size={18} color={colors.textSecondary} />
            <Text style={[styles.optionText, { color: colors.textPrimary }]}>Pinned Messages</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.optionItem}>
            <Bell size={18} color={colors.textSecondary} />
            <Text style={[styles.optionText, { color: colors.textPrimary }]}>Notifications</Text>
          </TouchableOpacity>
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={[...messages].reverse()}
          renderItem={renderMessage}
          keyExtractor={(item) => item._id}
          inverted
          contentContainerStyle={styles.messageList}
          onEndReached={() => {/* TODO: Pagination */}}
          ListFooterComponent={isLoadingMessages ? <ActivityIndicator style={{ margin: 10 }} color={colors.primary} /> : null}
        />

        {/* Typing Indicator */}
        {typingUsers.length > 0 && (
          <View style={styles.typingIndicator}>
            <Text style={[styles.typingText, { color: colors.textSecondary }]}>
              {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
            </Text>
          </View>
        )}

        {/* Input Bar */}
        <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <TouchableOpacity style={styles.attachButton}>
            <ImageIcon size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={[styles.inputContainer, { backgroundColor: colors.inputBackground }]}>
            <TextInput
              style={[styles.input, { color: colors.inputText }]}
              placeholder="Message..."
              placeholderTextColor={colors.inputPlaceholder}
              value={text}
              onChangeText={handleTextChange}
              multiline
            />
            <TouchableOpacity>
              <Smile size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity 
            style={[
              styles.sendButton, 
              { backgroundColor: text.trim() ? colors.primary : colors.border }
            ]} 
            onPress={handleSend}
            disabled={!text.trim()}
          >
            <Send size={18} color={colors.textInverse} />
          </TouchableOpacity>
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
  dmAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  dmAvatarText: {
    fontSize: 14,
    fontWeight: '600',
  },
  dmStatus: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: 'white',
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
  avatarMini: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  avatarMiniText: {
    fontSize: 11,
    fontWeight: '700',
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
