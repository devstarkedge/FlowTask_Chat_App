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
import { useChannelStore } from '../stores/channelStore';
import { formatRelativeTime, formatScheduledDate } from '../utils/dateUtils';
import { ScreenLayout, ScreenHeader, LoadingState, EmptyState } from '../components/common';
import { 
  Clock,
  Trash2,
  Hash,
  Lock,
} from 'lucide-react-native';
import ScheduledMessageDetailsModal from '../components/ScheduledMessageDetailsModal';
import { AppAvatar } from '../components/common';
import { useConversationDetails } from '../hooks/useConversationDetails';
import { scale, verticalScale, moderateScale } from '../utils/responsive';


const ScheduledItem = React.memo(({ item, onPress, colors }) => {
  const scheduledDate = new Date(item.scheduledAt);
  const isPast = scheduledDate < new Date();
  const { isDM, icon: IconComponent, dmUser, displayName } = useConversationDetails(item.channelId);
  const styles = createStyles(colors);

  return (
    <TouchableOpacity
      style={[styles.scheduledItem, { backgroundColor: colors.card }]}
      activeOpacity={0.7}
      onPress={() => onPress(item)}
    >
      <View style={styles.scheduledHeader}>
        <View style={styles.scheduledIconContainer}>
          {isDM && dmUser ? (
            <AppAvatar user={dmUser} size={18} showStatus={true} statusSize={6} />
          ) : IconComponent ? (
            <IconComponent size={14} color={colors.textSecondary} />
          ) : null}
        </View>
        <View style={styles.scheduledInfo}>
          <Text style={[styles.channelName, { color: colors.textSecondary }]} numberOfLines={1}>
            {isDM ? displayName : `${displayName}`}
          </Text>
          <View style={styles.timeContainer}>
            <Text style={[styles.scheduledTime, { color: isPast ? colors.error : colors.success }]}>
              {formatScheduledDate(item.scheduledAt)}
            </Text>
          </View>
        </View>
        <Clock size={16} color={isPast ? colors.error : colors.success} style={{ marginLeft: scale(8) }} />
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
});

const ScheduledScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const scheduledMessages = useScheduledStore(state => state.scheduledMessages);
  const isLoading = useScheduledStore(state => state.isLoading);
  const fetchScheduledMessages = useScheduledStore(state => state.fetchScheduledMessages);
  const { channels } = useChannelStore();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);

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

  const renderScheduledItem = useCallback(({ item }) => {
    return (
      <ScheduledItem
        item={item}
        onPress={setSelectedMessage}
        colors={colors}
      />
    );
  }, [colors]);

  const stylesObj = createStyles(colors);

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
          contentContainerStyle={stylesObj.listContainer}
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

      <ScheduledMessageDetailsModal
        visible={!!selectedMessage}
        message={selectedMessage}
        onClose={() => setSelectedMessage(null)}
        colors={colors}
      />
    </ScreenLayout>
  );
};

const createStyles = (colors) => StyleSheet.create({
  listContainer: {
    padding: moderateScale(16),
    gap: 12,
  },
  scheduledItem: {
    padding: moderateScale(16),
    borderRadius: moderateScale(12),
    gap: 12,
  },
  scheduledHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  scheduledIconContainer: {
    width: scale(32),
    height: verticalScale(32),
    justifyContent: 'center',
    alignItems: 'center',
  },
  scheduledInfo: {
    flex: 1,
  },
  channelName: {
    fontSize: moderateScale(13),
    marginBottom: verticalScale(4),
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scheduledTime: {
    fontSize: moderateScale(14),
    fontWeight: '600',
  },
  actionButton: {
    padding: moderateScale(6),
  },
  messageContent: {
    fontSize: moderateScale(14),
    lineHeight: 20,
  },
  scheduledMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaText: {
    fontSize: moderateScale(12),
  },
  statusBadge: {
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(4),
    borderRadius: moderateScale(6),
  },
  statusText: {
    fontSize: moderateScale(11),
    fontWeight: '600',
  },
});

export default ScheduledScreen;
