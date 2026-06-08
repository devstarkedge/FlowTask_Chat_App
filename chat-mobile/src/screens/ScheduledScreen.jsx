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
  Alert,
} from 'react-native';
import { useScheduledStore } from '../stores/scheduledStore';
import { useThemeStore } from '../stores/themeStore';
import { 
  CircleChevronLeft,
  Clock,
  Hash,
  Trash2,
  Send,
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
    console.log('ScheduledScreen mounted');
    fetchScheduledMessagesRef.current();
    return () => console.log('ScheduledScreen unmounted');
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchScheduledMessages();
    setRefreshing(false);
  };

  const handleCancel = (message) => {
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
  };

  const renderScheduledItem = ({ item }) => {
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
            Created {formatDate(item.createdAt)}
          </Text>
          {isPast && (
            <View style={[styles.statusBadge, { backgroundColor: colors.error + '20' }]}>
              <Text style={[styles.statusText, { color: colors.error }]}>Sending...</Text>
            </View>
          )}
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
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Scheduled</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : scheduledMessages.length === 0 ? (
        <View style={styles.centerContainer}>
          <Clock size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No scheduled messages
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textTertiary }]}>
            Schedule messages to send later
          </Text>
        </View>
      ) : (
        <FlatList
          data={scheduledMessages}
          renderItem={renderScheduledItem}
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

const formatScheduledDate = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const timeStr = date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });

  if (isToday) return `Today at ${timeStr}`;
  if (isTomorrow) return `Tomorrow at ${timeStr}`;
  
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
});

export default ScheduledScreen;
