import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  TouchableOpacity,
  AppState,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useScheduledStore } from '../stores/scheduledStore';
import { useThemeStore } from '../stores/themeStore';
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
  const scheduledMessages = useScheduledStore(state => state.scheduledMessages ?? []);
  const isLoading = useScheduledStore(state => state.isLoading);
  const fetchScheduledMessages = useScheduledStore(state => state.fetchScheduledMessages);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);

  // Stable ref so timers/callbacks never capture a stale function
  const fetchRef = useRef(fetchScheduledMessages);
  fetchRef.current = fetchScheduledMessages;

  // ─── Layer 1: initial load ───────────────────────────────────────────────
  useEffect(() => {
    fetchRef.current();
  }, []);

  // ─── Layer 2: refresh every time user navigates to this screen ──────────
  useFocusEffect(
    useCallback(() => {
      fetchRef.current();
    }, [])
  );

  // ─── Layer 3: refresh when app returns from background ──────────────────
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        fetchRef.current();
      }
    });
    return () => subscription.remove();
  }, []);

  // ─── Layer 4: precision timers ───────────────────────────────────────────
  // For every scheduled message whose time is within the next 24 hours,
  // set a setTimeout that fires at the exact millisecond it's due (+1 s
  // to allow the backend to process and send) and then refreshes the list.
  // This ensures the screen updates within ~1 second of the scheduled time
  // even if the socket event is missed or delayed.
  const timerKey = useMemo(
    () => scheduledMessages.map(m => `${m._id}:${m.scheduledAt}`).join('|'),
    [scheduledMessages]
  );

  useEffect(() => {
    const timers = [];
    const now = Date.now();
    const MAX_DELAY = 24 * 60 * 60 * 1000; // 24 h

    scheduledMessages.forEach((msg) => {
      const due = new Date(msg.scheduledAt).getTime();
      const delay = due - now;

      if (delay > 0 && delay <= MAX_DELAY) {
        // Fire 1 second after the scheduled time to give the backend a moment
        // to process and emit the socket event. If the socket already removed
        // it, the fetch is a cheap no-op.
        const timer = setTimeout(() => {
          fetchRef.current();
        }, delay + 1000);
        timers.push(timer);
      } else if (delay <= 0 && delay > -5000) {
        // Message became due very recently (e.g. app just foregrounded right
        // on the scheduled second) — refresh immediately.
        fetchRef.current();
      }
    });

    return () => timers.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerKey]);

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
        message={scheduledMessages.find(m => m._id === selectedMessage?._id) || selectedMessage}
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
