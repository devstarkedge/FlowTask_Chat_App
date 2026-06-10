/**
 * PinnedMessagesScreen — displays pinned messages for a channel.
 * Fetches from GET /channels/:channelId/pins (same endpoint as web app).
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { CircleChevronLeft, Pin } from 'lucide-react-native';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { pinsAPI } from '../services/api';
import logger from '../utils/logger';
import { ScreenLayout, ScreenHeader, LoadingState, EmptyState, AppAvatar } from '../components/common';
import RichText from '../components/RichText';

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const PinnedMessagesScreen = ({ route, navigation }) => {
  const { channelId, channelName } = route.params;
  const { colors } = useThemeStore();
  const { user } = useAuthStore();

  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPinned = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await pinsAPI.list(channelId);
      const items = data.data?.messages || data.data?.pins || data.data || [];
      setPinnedMessages(Array.isArray(items) ? items : []);
    } catch (err) {
      logger.error('Failed to fetch pinned messages:', err);
      setError('Could not load pinned messages');
    } finally {
      setIsLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    fetchPinned();
  }, [fetchPinned]);

  const handleUnpin = useCallback(async (messageId) => {
    Alert.alert('Unpin Message', 'Remove this message from pinned?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unpin',
        style: 'destructive',
        onPress: async () => {
          try {
            await pinsAPI.unpin(messageId);
            setPinnedMessages(prev => prev.filter(m => m._id !== messageId));
          } catch (err) {
            logger.error('Failed to unpin:', err);
            Alert.alert('Error', 'Could not unpin message');
          }
        },
      },
    ]);
  }, []);

  const renderItem = useCallback(({ item }) => {
    const author = item.senderSnapshot || item.authorId || {};
    const authorName = typeof author === 'string' ? 'Unknown' : (author.name || 'Unknown');

    return (
      <View style={[styles.messageCard, { backgroundColor: colors.card }]}>
        <View style={styles.authorRow}>
          <AppAvatar user={author} size={28} showStatus={false} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.authorName, { color: colors.textPrimary }]}>
              {authorName}
            </Text>
          </View>
          <Text style={[styles.timestamp, { color: colors.textTertiary }]}>
            {formatTime(item.createdAt)}
          </Text>
        </View>

        <View style={styles.contentContainer}>
          {item.htmlContent ? (
            <RichText
              html={item.htmlContent}
              text={item.content}
              colors={colors}
              baseStyle={{ fontSize: 14, lineHeight: 20 }}
            />
          ) : (
            <Text style={[styles.contentText, { color: colors.textPrimary }]}>
              {item.content}
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.unpinButton, { borderColor: colors.border }]}
          onPress={() => handleUnpin(item._id)}
          activeOpacity={0.7}
        >
          <Pin size={12} color={colors.textSecondary} />
          <Text style={[styles.unpinText, { color: colors.textSecondary }]}>Unpin</Text>
        </TouchableOpacity>
      </View>
    );
  }, [colors, handleUnpin]);

  const styles = createStyles(colors);

  return (
    <ScreenLayout>

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <CircleChevronLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            Pinned Messages
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {channelName}
          </Text>
        </View>
      </View>

      {/* Content */}
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <EmptyState title={error} actionLabel="Retry" onAction={fetchPinned} />
      ) : pinnedMessages.length === 0 ? (
        <EmptyState icon={Pin} title="No pinned messages" subtitle={'Long-press a message and select "Pin" to pin it here'} />
      ) : (
        <FlatList
          data={pinnedMessages}
          renderItem={renderItem}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== 'web'}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={fetchPinned} tintColor={colors.primary} />
          }
        />
      )}
    </ScreenLayout>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      gap: 8,
    },
    backButton: { padding: 4 },
    headerTitle: { fontSize: 17, fontWeight: '700' },
    headerSubtitle: { fontSize: 12, marginTop: 2 },
    listContainer: { padding: 12, gap: 10 },
    messageCard: {
      borderRadius: 12,
      padding: 12,
      gap: 8,
    },
    authorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    authorName: { fontSize: 13, fontWeight: '700' },
    timestamp: { fontSize: 11 },
    contentContainer: { paddingLeft: 36 },
    contentText: { fontSize: 14, lineHeight: 20 },
    unpinButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-end',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 6,
      borderWidth: 1,
      marginTop: 4,
    },
    unpinText: { fontSize: 12, fontWeight: '600' },
  });

export default PinnedMessagesScreen;
