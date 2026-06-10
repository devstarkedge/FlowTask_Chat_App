import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useScheduledStore } from '../stores/scheduledStore';
import { useThemeStore } from '../stores/themeStore';
import { formatRelativeTime, formatScheduledDate } from '../utils/dateUtils';
import { ScreenLayout, ScreenHeader, LoadingState, EmptyState } from '../components/common';
import { 
  Clock,
  Trash2,
} from 'lucide-react-native';

const ScheduledScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const scheduledMessages = useScheduledStore(state => state.scheduledMessages);
  const isLoading = useScheduledStore(state => state.isLoading);
  const fetchScheduledMessages = useScheduledStore(state => state.fetchScheduledMessages);
  const cancelScheduledMessage = useScheduledStore(state => state.cancelScheduledMessage);
  const [refreshing, setRefreshing] = useState(false);

  const fetchScheduledMessagesRef = useRef(fetchScheduledMessages);
  fetchScheduledMessagesRef.current = fetchScheduledMessages;

  useEffect(() => {
    fetchScheduledMessagesRef.current();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchScheduledMessages();
    setRefreshing(false);
  }, [fetchScheduledMessages]);

  const handleCancel = useCallback((message) => {
    Alert.alert(
      'Cancel Scheduled Message',
      'Are you sure you want to cancel this scheduled message?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelScheduledMessage(message._id);
            } catch (error) {
              Alert.alert('Error', 'Failed to cancel scheduled message');
            }
          },
        },
      ]
    );
  }, [cancelScheduledMessage]);

  const renderScheduledItem = useCallback(({ item }) => {
    const scheduledDate = new Date(item.scheduledFor);
    const isPast = scheduledDate < new Date();
    
    return (
      <TouchableOpacity
        style={[styles.scheduledItem, { backgroundColor: colors.card }]}
        activeOpacity={0.7}
      >
        <View style={styles.scheduledHeader}>
          <View style={styles.scheduledIconContainer}>
            <Clock size={16} color={isPast ? colors.error : colors.success} />
          </View>
          <View style={styles.scheduledInfo}>
            <Text style={[styles.channelName, { color: colors.textSecondary }]} numberOfLines={1}>
              #{item.channelId?.name || 'channel'}
            </Text>
            <View style={styles.timeContainer}>
              <Text style={[styles.scheduledTime, { color: isPast ? colors.error : colors.success }]}>
                {formatScheduledDate(item.scheduledFor)}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => handleCancel(item)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Trash2 size={18} color={colors.error} />
          </TouchableOpacity>
        </View>

        <Text 
          style={[styles.messageContent, { color: colors.textPrimary }]} 
          numberOfLines={3}
        >
          {item.content?.replace(/<[^>]*>/g, '') || 'No content'}
        </Text>

        <View style={styles.scheduledMeta}>
          <Text style={[styles.metaText, { color: colors.textTertiary }]}>
            Created {formatRelativeTime(item.createdAt)}
          </Text>
          {isPast && (
            <View style={[styles.statusBadge, { backgroundColor: colors.error + '20' }]}>
              <Text style={[styles.statusText, { color: colors.error }]}>Sending...</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [colors, handleCancel]);

  const styles = createStyles(colors);

  return (
    <ScreenLayout>
      <ScreenHeader title="Scheduled" onBack={() => navigation.goBack()} />

      {/* Content */}
      {isLoading ? (
        <LoadingState />
      ) : scheduledMessages.length === 0 ? (
        <EmptyState icon={Clock} title="No scheduled messages" subtitle="Schedule messages to send later" />
      ) : (
        <FlatList
          data={scheduledMessages}
          renderItem={renderScheduledItem}
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
  scheduledItem: {
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  scheduledHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  scheduledIconContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scheduledInfo: {
    flex: 1,
  },
  channelName: {
    fontSize: 13,
    marginBottom: 4,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scheduledTime: {
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    padding: 4,
  },
  messageContent: {
    fontSize: 14,
    lineHeight: 20,
  },
  scheduledMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
});

export default ScheduledScreen;
