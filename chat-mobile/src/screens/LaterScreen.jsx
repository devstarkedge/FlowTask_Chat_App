import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { useLaterStore } from '../stores/laterStore';
import { useThemeStore } from '../stores/themeStore';
import { 
  CircleChevronLeft,
  Bookmark,
  Hash,
  MessageSquare,
  Clock,
  CheckCircle2,
  Archive,
  X,
} from 'lucide-react-native';

const LaterScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const savedMessages = useLaterStore(state => state.savedMessages);
  const isLoading = useLaterStore(state => state.isLoading);
  const fetchSavedMessages = useLaterStore(state => state.fetchSavedMessages);
  const updateStatus = useLaterStore(state => state.updateStatus);
  const toggleSaveMessage = useLaterStore(state => state.toggleSaveMessage);
  const [filter, setFilter] = useState('in_progress'); // in_progress, completed, archived
  const [refreshing, setRefreshing] = useState(false);

  const fetchSavedMessagesRef = useRef(fetchSavedMessages);
  fetchSavedMessagesRef.current = fetchSavedMessages;

  useEffect(() => {
    console.log('LaterScreen mounted');
    fetchSavedMessagesRef.current();
    return () => console.log('LaterScreen unmounted');
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSavedMessages();
    setRefreshing(false);
  };

  const filteredMessages = savedMessages.filter(msg => {
    if (filter === 'all') return true;
    return msg.status === filter;
  });

  const handleMessagePress = (savedMessage) => {
    if (savedMessage.messageId) {
      navigation.navigate('Chat', {
        channelId: savedMessage.channelId?._id,
        messageId: savedMessage.messageId._id,
      });
    }
  };

  const handleStatusChange = async (messageId, newStatus) => {
    try {
      await updateStatus(messageId, newStatus);
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleRemove = async (messageId) => {
    try {
      await toggleSaveMessage(messageId);
    } catch (error) {
      console.error('Failed to remove:', error);
    }
  };

  const renderSavedItem = ({ item }) => {
    const message = item.messageId;
    const channel = item.channelId;
    
    return (
      <TouchableOpacity
        style={[styles.savedItem, { backgroundColor: colors.card }]}
        onPress={() => handleMessagePress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.savedHeader}>
          <View style={styles.savedIconContainer}>
            <Bookmark size={16} color={colors.warning} fill={colors.warning} />
          </View>
          <View style={styles.savedInfo}>
            <Text style={[styles.channelName, { color: colors.textSecondary }]} numberOfLines={1}>
              #{channel?.name || 'channel'}
            </Text>
            {message?.authorId && (
              <Text style={[styles.authorName, { color: colors.textPrimary }]} numberOfLines={1}>
                {message.authorId.name}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => handleRemove(message?._id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {message?.content && (
          <Text 
            style={[styles.messageContent, { color: colors.textSecondary }]} 
            numberOfLines={3}
          >
            {message.content.replace(/<[^>]*>/g, '')}
          </Text>
        )}

        {item.note && (
          <View style={[styles.noteContainer, { backgroundColor: colors.backgroundTertiary }]}>
            <Text style={[styles.noteText, { color: colors.textSecondary }]}>
              {item.note}
            </Text>
          </View>
        )}

        <View style={styles.savedMeta}>
          <Text style={[styles.metaText, { color: colors.textTertiary }]}>
            Saved {formatDate(item.createdAt)}
          </Text>
          {item.reminderAt && (
            <View style={styles.reminderBadge}>
              <Clock size={12} color={colors.warning} />
              <Text style={[styles.reminderText, { color: colors.warning }]}>
                {formatDate(item.reminderAt)}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.backgroundTertiary }]}
            onPress={() => handleStatusChange(item._id, 'completed')}
          ><CheckCircle2 size={14} color={colors.success} /><Text style={[styles.actionText, { color: colors.textSecondary }]}>Complete</Text></TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.backgroundTertiary }]}
            onPress={() => handleStatusChange(item._id, 'archived')}
          ><Archive size={14} color={colors.textSecondary} /><Text style={[styles.actionText, { color: colors.textSecondary }]}>Archive</Text></TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.effectiveTheme === 'dark' ? 'light-content' : 'dark-content'} />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
        >
          <CircleChevronLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Later</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Filter Tabs */}
      <View style={[styles.filterContainer, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[
            styles.filterTab,
            filter === 'in_progress' && { borderBottomColor: colors.primary }
          ]}
          onPress={() => setFilter('in_progress')}
        >
          <Text 
            style={[
              styles.filterText,
              { color: filter === 'in_progress' ? colors.primary : colors.textSecondary }
            ]}
          >
            In Progress
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterTab,
            filter === 'completed' && { borderBottomColor: colors.primary }
          ]}
          onPress={() => setFilter('completed')}
        >
          <Text 
            style={[
              styles.filterText,
              { color: filter === 'completed' ? colors.primary : colors.textSecondary }
            ]}
          >
            Completed
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterTab,
            filter === 'archived' && { borderBottomColor: colors.primary }
          ]}
          onPress={() => setFilter('archived')}
        >
          <Text 
            style={[
              styles.filterText,
              { color: filter === 'archived' ? colors.primary : colors.textSecondary }
            ]}
          >
            Archived
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : filteredMessages.length === 0 ? (
        <View style={styles.centerContainer}>
          <Bookmark size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No saved items
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredMessages}
          renderItem={renderSavedItem}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              tintColor={colors.primary} 
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

const formatDate = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  filterTab: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
    gap: 12,
  },
  savedItem: {
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  savedHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  savedIconContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  savedInfo: {
    flex: 1,
  },
  channelName: {
    fontSize: 13,
    marginBottom: 2,
  },
  authorName: {
    fontSize: 14,
    fontWeight: '600',
  },
  removeButton: {
    padding: 4,
  },
  messageContent: {
    fontSize: 14,
    lineHeight: 20,
  },
  noteContainer: {
    padding: 12,
    borderRadius: 8,
  },
  noteText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  savedMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
  },
  reminderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reminderText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
  },
});

export default LaterScreen;
