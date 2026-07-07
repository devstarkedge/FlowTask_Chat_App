import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useChannelStore } from '../stores/channelStore';
import { useAuthStore } from '../stores/authStore';
import { AppAvatar } from './common';
import { Hash, Lock, CheckCircle2, Circle } from 'lucide-react-native';
import { messageAPI } from '../services/api';
import Toast from 'react-native-toast-message';

const ForwardMessageModal = ({ visible, onClose, message, colors }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [isSending, setIsSending] = useState(false);

  const channels = useChannelStore((s) => s.channels) || [];
  const { user } = useAuthStore();

  const handleClose = () => {
    setSearchQuery('');
    setSelectedIds([]);
    onClose();
  };

  const handleToggleSelection = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSend = async () => {
    if (!message?._id || selectedIds.length === 0) return;
    setIsSending(true);
    try {
      await messageAPI.forward(message._id, { destinationIds: selectedIds });
      Toast.show({ type: 'success', text1: 'Message forwarded successfully' });
      handleClose();
    } catch (error) {
      console.error('Failed to forward message:', error);
      Toast.show({ type: 'error', text1: 'Failed to forward message' });
    } finally {
      setIsSending(false);
    }
  };

  // Filter channels based on search
  const filteredChannels = useMemo(() => {
    return channels.filter((c) => {
      if (searchQuery.trim() === '') return true;
      const query = searchQuery.toLowerCase();
      if (c.type === 'dm') {
        const dmUser = {
          name: c.name,
          email: c.email || '',
        };
        return dmUser.name?.toLowerCase().includes(query) || dmUser.email?.toLowerCase().includes(query);
      }
      return c.name?.toLowerCase().includes(query);
    });
  }, [channels, searchQuery]);

  // Sort: DMs first, then Channels
  const sortedDestinations = useMemo(() => {
    return [...filteredChannels].sort((a, b) => {
      if (a.type === 'dm' && b.type !== 'dm') return -1;
      if (a.type !== 'dm' && b.type === 'dm') return 1;
      return a.name?.localeCompare(b.name);
    });
  }, [filteredChannels]);

  const renderItem = ({ item }) => {
    const isSelected = selectedIds.includes(item._id);
    const isDM = item.type === 'dm';
    const isPrivate = item.visibility === 'private';
    
    let IconComponent = isPrivate ? Lock : Hash;
    if (item.type === 'system') IconComponent = Hash; // Fallback

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => handleToggleSelection(item._id)}
      >
        <View style={styles.rowContent}>
          {isDM ? (
            <AppAvatar
              user={{
                _id: item.dmRecipientId,
                name: item.name,
                avatar: item.avatar,
                onlineStatus: item.onlineStatus || 'offline',
              }}
              size={36}
              showStatus
            />
          ) : (
            <View style={[styles.channelIconContainer, { backgroundColor: colors.surfaceOverlayLight }]}>
              <IconComponent size={20} color={colors.textPrimary} />
            </View>
          )}
          
          <View style={styles.textContainer}>
            <Text style={[styles.nameText, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.type === 'dm' && item.dmRecipientId === user?._id ? 'You' : item.name}
            </Text>
            {/* {item.type === 'dm' && (
              <Text style={[styles.subText, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.name}
              </Text>
            )} */}
          </View>
        </View>

        <View style={styles.checkboxContainer}>
          {isSelected ? (
            <CheckCircle2 size={24} color={colors.primary} fill={colors.primary + '20'} />
          ) : (
            <Circle size={24} color={colors.border} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
            <Text style={[styles.headerButtonText, { color: colors.primary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Forward Private Message</Text>
          <TouchableOpacity 
            onPress={handleSend} 
            disabled={selectedIds.length === 0 || isSending}
            style={[styles.headerButton, { opacity: selectedIds.length === 0 || isSending ? 0.5 : 1 }]}
          >
            <Text style={[styles.headerButtonText, { color: colors.primary, fontWeight: '700' }]}>
              {isSending ? 'Sending...' : 'Send'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={[styles.searchContainer, { borderBottomColor: colors.border }]}>
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Forward to..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
        </View>

        {/* List */}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <FlatList
            data={sortedDestinations}
            keyExtractor={(item) => item._id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={11}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerButton: {
    padding: 4,
    minWidth: 60,
  },
  headerButtonText: {
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  searchInput: {
    fontSize: 16,
    height: 40,
  },
  listContent: {
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  channelIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    marginLeft: 12,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameText: {
    fontSize: 16,
    fontWeight: '600',
  },
  subText: {
    fontSize: 14,
  },
  checkboxContainer: {
    marginLeft: 16,
  },
});

export default ForwardMessageModal;
