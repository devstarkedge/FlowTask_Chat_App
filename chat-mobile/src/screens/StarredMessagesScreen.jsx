import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useStarredStore } from '../stores/useStarredStore';
import { useThemeStore } from '../stores/themeStore';
import { formatRelativeTime } from '../utils/dateUtils';
import { ScreenLayout, LoadingState, EmptyState, HeaderBackButton, AppAvatar } from '../components/common';
import { Star, MessageSquare } from 'lucide-react-native';
import { useConversationDetails } from '../hooks/useConversationDetails';
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import logger from '../utils/logger';

const StarredItem = React.memo(({ item, onPress, onUnstar, colors }) => {
  const message = item.targetId;
  if (!message) return null;

  let messageText = 'Starred Message';
  if (message.contentType === 'gif') {
    messageText = '[GIF]';
  } else if (message.contentType === 'audio') {
    messageText = '[Voice Message]';
  } else if (message.contentType === 'video') {
    messageText = '[Video]';
  } else if (message.content || message.text || message.message) {
    messageText = message.content || message.text || message.message;
    if (typeof messageText === 'string') {
      messageText = messageText.replace(/<[^>]*>?/gm, '').trim() || messageText;
    }
  }

  const formattedDate = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const subtitle = `Starred ${formatRelativeTime(item.createdAt)}`;
  
  const styles = createStyles(colors);
  const { isDM, icon: ChannelIcon, dmUser, displayName } = useConversationDetails(message.channelId?._id || message.channelId);

  return (
    <TouchableOpacity
      style={styles.savedItem}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.topRow}>
        <Text style={[styles.typeLabel, { color: colors.textSecondary }]}>Message</Text>
        <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>{formattedDate}</Text>
      </View>

      <View style={styles.mainRow}>
        <View style={styles.mainIconBox}>
          {isDM && dmUser ? (
            <AppAvatar user={dmUser} size={28} showStatus={true} statusSize={8} />
          ) : ChannelIcon ? (
            <ChannelIcon size={20} color="#fff" />
          ) : (
            <MessageSquare size={20} color="#fff" />
          )}
        </View>
        <Text style={[styles.mainTitle, { color: colors.textPrimary }]} numberOfLines={1}>{messageText}</Text>
      </View>

      <TouchableOpacity 
        style={[styles.embeddedCard, { borderColor: colors.border }]}
        onPress={() => onPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.embeddedIconBox}>
          {isDM && dmUser ? (
            <AppAvatar user={dmUser} size={20} showStatus={true} statusSize={6} />
          ) : ChannelIcon ? (
            <ChannelIcon size={16} color="#fff" />
          ) : (
            <MessageSquare size={16} color="#fff" />
          )}
        </View>
        <View style={styles.embeddedInfo}>
          <Text style={[styles.embeddedTitle, { color: colors.textPrimary }]} numberOfLines={2}>{messageText}</Text>
          <Text style={[styles.embeddedSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {`Message in ${displayName || 'Unknown'}`}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={styles.actionsRow}>
        <TouchableOpacity 
          style={[styles.completeBtn, { backgroundColor: colors.backgroundSecondary }]}
          onPress={() => onUnstar(item)}
        >
          <Text style={[styles.completeBtnText, { color: colors.textPrimary }]}>Unstar</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});

const StarredMessagesScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { favorites, isLoading, fetchFavorites, toggleFavorite } = useStarredStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchFavorites();
    setRefreshing(false);
  }, [fetchFavorites]);

  const starredMessages = useMemo(() => {
    return favorites.filter(fav => fav.targetType === 'message' && fav.targetId);
  }, [favorites]);

  const handleMessagePress = useCallback((item) => {
    const message = item.targetId;
    const channelId = message?.channelId?._id || message?.channelId;
    if (!channelId || !message?._id) return;
    
    navigation.navigate('Chat', {
      channelId,
      messageId: message._id,
    });
  }, [navigation]);

  const handleUnstar = useCallback(async (item) => {
    try {
      await toggleFavorite(item.targetType, item.targetId?._id || item.targetId);
    } catch (err) {
      logger.error('Failed to unstar message:', err);
    }
  }, [toggleFavorite]);

  const renderStarredItem = useCallback(({ item }) => {
    return (
      <StarredItem
        item={item}
        onPress={handleMessagePress}
        onUnstar={handleUnstar}
        colors={colors}
      />
    );
  }, [handleMessagePress, handleUnstar, colors]);

  const styles = createStyles(colors);

  return (
    <ScreenLayout>
      <View style={styles.customHeader}>
        <HeaderBackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Starred Messages</Text>
        <View style={styles.headerRightPill} />
      </View>

      {isLoading && !refreshing ? (
        <LoadingState />
      ) : starredMessages.length === 0 ? (
        <EmptyState icon={Star} title="No starred messages" subtitle="Star a message in any conversation to easily find it here." />
      ) : (
        <FlatList
          data={starredMessages}
          renderItem={renderStarredItem}
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
    </ScreenLayout>
  );
};

const createStyles = (colors) => StyleSheet.create({
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    paddingTop: verticalScale(16),
  },
  headerTitle: {
    fontSize: moderateScale(18),
    fontWeight: '700',
  },
  headerRightPill: {
    width: scale(44), // Placeholder for balance
  },
  listContainer: {
    padding: moderateScale(16),
    paddingTop: verticalScale(8),
    gap: 24,
  },
  savedItem: {
    paddingVertical: verticalScale(8),
    gap: 12,
    backgroundColor: colors.background,
    borderRadius: moderateScale(16),
    paddingHorizontal: scale(12),
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeLabel: {
    fontSize: moderateScale(12),
    fontWeight: '600',
  },
  dateLabel: {
    fontSize: moderateScale(12),
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mainIconBox: {
    width: scale(44),
    height: verticalScale(44),
    borderRadius: moderateScale(12),
    backgroundColor: '#F5A623', 
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainTitle: {
    fontSize: moderateScale(16),
    fontWeight: '500',
    flex: 1,
  },
  embeddedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: moderateScale(16),
    padding: moderateScale(14),
    gap: 14,
  },
  embeddedIconBox: {
    width: scale(36),
    height: verticalScale(36),
    borderRadius: moderateScale(10),
    backgroundColor: '#F5A623',
    alignItems: 'center',
    justifyContent: 'center',
  },
  embeddedInfo: {
    flex: 1,
  },
  embeddedTitle: {
    fontSize: moderateScale(15),
    fontWeight: '600',
    marginBottom: verticalScale(4),
  },
  embeddedSubtitle: {
    fontSize: moderateScale(13),
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: verticalScale(4),
  },
  completeBtn: {
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(10),
  },
  completeBtnText: {
    fontWeight: '600',
    fontSize: moderateScale(14),
  },
});

export default StarredMessagesScreen;
