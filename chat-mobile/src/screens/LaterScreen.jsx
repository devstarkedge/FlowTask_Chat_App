import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useLaterStore } from '../stores/laterStore';
import { useThemeStore } from '../stores/themeStore';
import { formatRelativeTime } from '../utils/dateUtils';
import { ScreenLayout, ScreenHeader, FilterTabs, LoadingState, EmptyState } from '../components/common';
import RichText from '../components/RichText';
import { 
  Bookmark,
  FileText,
  Clock,
  CheckCircle2,
  Archive,
  X,
} from 'lucide-react-native';
import logger from '../utils/logger';

const LaterScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const savedMessages = useLaterStore(state => state.savedMessages);
  const isLoading = useLaterStore(state => state.isLoading);
  const fetchSavedMessages = useLaterStore(state => state.fetchSavedMessages);
  const updateStatus = useLaterStore(state => state.updateStatus);
  const toggleSaveMessage = useLaterStore(state => state.toggleSaveMessage);
  const [filter, setFilter] = useState('all'); // all, message, canvas, file
  const [refreshing, setRefreshing] = useState(false);

  const fetchSavedMessagesRef = useRef(fetchSavedMessages);
  fetchSavedMessagesRef.current = fetchSavedMessages;

  useEffect(() => {
    fetchSavedMessagesRef.current();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSavedMessages();
    setRefreshing(false);
  }, [fetchSavedMessages]);

  const filteredMessages = useMemo(() => savedMessages.filter(msg => {
    if (filter === 'all') return true;
    // Legacy items with no type field are treated as messages
    const itemType = msg.type || 'message';
    return itemType === filter;
  }), [savedMessages, filter]);

  const handleMessagePress = useCallback((savedMessage) => {
    const channelId = savedMessage.channelId?._id;
    if (!channelId) return;

    if (savedMessage.type === 'canvas') {
      // Navigate to the Canvas tab of ChatScreen
      const params = { channelId, initialTab: 'canvas' };
      if (savedMessage.canvasId) params.canvasId = savedMessage.canvasId;
      navigation.navigate('Chat', params);
    } else if (savedMessage.messageId) {
      // Default: navigate to the message in the Messages tab
      navigation.navigate('Chat', {
        channelId,
        messageId: savedMessage.messageId._id,
      });
    }
  }, [navigation]);

  const handleStatusChange = useCallback(async (messageId, newStatus) => {
    try {
      await updateStatus(messageId, newStatus);
    } catch (error) {
      logger.error('Failed to update status:', error);
    }
  }, [updateStatus]);

  const handleRemove = useCallback(async (messageId) => {
    try {
      await toggleSaveMessage(messageId);
    } catch (error) {
      logger.error('Failed to remove:', error);
    }
  }, [toggleSaveMessage]);

  const renderSavedItem = useCallback(({ item }) => {
    const message = item.messageId;
    const channel = item.channelId;
    const isCanvas = item.type === 'canvas';

    // Determine the content to render
    const htmlContent = message?.htmlContent || item.htmlContent || null;
    const textContent = message?.content || item.content || null;
    const hasContent = htmlContent || textContent;

    return (
      <TouchableOpacity
        style={[styles.savedItem, { backgroundColor: colors.card }]}
        onPress={() => handleMessagePress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.savedHeader}>
          <View style={styles.savedIconContainer}>
            {isCanvas
              ? <FileText size={16} color={colors.primary} />
              : <Bookmark size={16} color={colors.warning} fill={colors.warning} />
            }
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
            onPress={() => handleRemove(message?._id || item._id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Rich-text content preview — clipped to 3 lines via style */}
        {hasContent && (
          <View style={styles.contentPreview} pointerEvents="none">
            <RichText
              html={htmlContent}
              text={textContent}
              colors={colors}
              baseStyle={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}
            />
          </View>
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
            Saved {formatRelativeTime(item.createdAt)}
          </Text>
          {item.reminderAt && (
            <View style={styles.reminderBadge}>
              <Clock size={12} color={colors.warning} />
              <Text style={[styles.reminderText, { color: colors.warning }]}>
                {formatRelativeTime(item.reminderAt)}
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
  }, [colors, handleMessagePress, handleRemove, handleStatusChange]);

  const styles = createStyles(colors);
  const filterTabs = [
    { key: 'all', label: 'All' },
    { key: 'message', label: 'Messages' },
    { key: 'canvas', label: 'Canvases' },
    { key: 'file', label: 'Files' },
  ];

  return (
    <ScreenLayout>
      <ScreenHeader title="Later" onBack={() => navigation.goBack()} />
      <FilterTabs tabs={filterTabs} activeTab={filter} onTabChange={setFilter} />

      {/* Content */}
      {isLoading ? (
        <LoadingState />
      ) : filteredMessages.length === 0 ? (
        <EmptyState icon={Bookmark} title="No saved items" />
      ) : (
        <FlatList
          data={filteredMessages}
          renderItem={renderSavedItem}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              tintColor={colors.primary} 
            />
          }
        />
      )}
    </ScreenLayout>
  );
};

const createStyles = (colors) => StyleSheet.create({
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
  contentPreview: {
    maxHeight: 66, // ~3 lines at lineHeight 20 + spacing
    overflow: 'hidden',
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
});

export default LaterScreen;
