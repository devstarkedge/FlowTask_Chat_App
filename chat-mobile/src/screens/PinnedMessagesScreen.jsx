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
  Image,
} from 'react-native';
import { CircleChevronLeft, Pin, Video, FileCode, Volume2, FileText } from 'lucide-react-native';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { pinsAPI } from '../services/api';
import logger from '../utils/logger';
import { ScreenLayout, ScreenHeader, LoadingState, EmptyState, AppAvatar, HeaderBackButton } from '../components/common';
import RichText from '../components/RichText';
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import { getMessageAttachments } from '../utils/mediaUtils';

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

  const handleMessagePress = useCallback((item) => {
    navigation.navigate('Chat', {
      channelId,
      channelName,
      messageId: item._id,
    });
  }, [navigation, channelId, channelName]);

  const renderItem = useCallback(({ item }) => {
    const author = item.senderSnapshot?.name ? item.senderSnapshot : (item.authorId || {});
    const authorName = typeof author === 'string' ? 'Unknown' : (author.name || 'Unknown');

    // Attachments
    const attachments = getMessageAttachments(item);
    const images = attachments.filter(a => a.mimeType?.startsWith('image/'));
    const videos = attachments.filter(a => a.mimeType?.startsWith('video/'));
    const audio = attachments.filter(a => a.mimeType?.startsWith('audio/'));
    const otherFiles = attachments.filter(a => !a.mimeType?.startsWith('image/') && !a.mimeType?.startsWith('video/') && !a.mimeType?.startsWith('audio/'));

    // Canvas references
    const isCanvas = item.contentType === 'canvas' || !!item.canvasId;
    const canvasObj = item.canvasId || {};

    return (
      <TouchableOpacity
        style={[styles.messageCard, { backgroundColor: colors.card }]}
        onPress={() => handleMessagePress(item)}
        activeOpacity={0.85}
      >
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
          {/* Rich-text content */}
          {item.htmlContent ? (
            <RichText
              html={item.htmlContent}
              text={item.content}
              colors={colors}
              mentions={item.mentions}
              onMentionPress={(userId) => {
                navigation.navigate('UserProfile', { user: { _id: userId }, channelId });
              }}
              baseStyle={{ fontSize: moderateScale(14), lineHeight: 20 }}
            />
          ) : item.contentType === 'gif' && item.gifMeta ? (
            <View style={{ gap: 8 }}>
              {item.content ? (
                <Text style={[styles.contentText, { color: colors.textPrimary }]}>
                  {item.content}
                </Text>
              ) : null}
              <Image
                source={{ uri: item.gifUrl || item.gifMeta.gifUrl || item.gifMeta.previewUrl }}
                style={{ width: '80%', aspectRatio: (item.gifMeta.width || 1) / (item.gifMeta.height || 1), maxWidth: 250, maxHeight: 250, resizeMode: 'contain', borderRadius: 8 }}
              />
            </View>
          ) : item.content ? (
            <Text style={[styles.contentText, { color: colors.textPrimary }]}>
              {item.content}
            </Text>
          ) : null}

          {/* Canvas Preview card */}
          {isCanvas && (
            <View style={[styles.canvasCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <View style={styles.canvasHeader}>
                <FileText size={18} color={colors.primary} />
                <Text style={[styles.canvasTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {canvasObj.title || item.title || 'Untitled Canvas'}
                </Text>
              </View>
              <Text style={[styles.canvasSummary, { color: colors.textSecondary }]} numberOfLines={2}>
                {canvasObj.summary || 'Canvas Document — Tap to open'}
              </Text>
            </View>
          )}

          {/* Media Previews */}
          {images.map((img) => (
            <View key={img._id || img.url} style={styles.imageFrame}>
              <Image source={{ uri: img.url }} style={styles.previewImage} />
            </View>
          ))}

          {videos.map((vid) => (
            <View key={vid._id || vid.url} style={[styles.mediaFrame, { backgroundColor: colors.backgroundTertiary }]}>
              <Video size={18} color={colors.textSecondary} />
              <Text style={[styles.mediaName, { color: colors.textSecondary }]} numberOfLines={1}>
                {vid.name}
              </Text>
            </View>
          ))}

          {audio.map((aud) => (
            <View key={aud._id || aud.url} style={[styles.mediaFrame, { backgroundColor: colors.backgroundTertiary }]}>
              <Volume2 size={18} color={colors.textSecondary} />
              <Text style={[styles.mediaName, { color: colors.textSecondary }]} numberOfLines={1}>
                {aud.name}
              </Text>
            </View>
          ))}

          {otherFiles.map((file) => (
            <View key={file._id || file.url} style={[styles.fileRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <FileCode size={16} color={colors.textSecondary} />
              <Text style={[styles.mediaName, { color: colors.textPrimary }]} numberOfLines={1}>
                {file.name}
              </Text>
            </View>
          ))}

          {/* Emoji Reactions list */}
          {item.reactions && item.reactions.length > 0 && (
            <View style={styles.reactionsRow}>
              {item.reactions.map((react) => (
                <View key={react.emoji} style={[styles.reactionPill, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                  <Text style={styles.reactionText}>{react.emoji} {react.count || react.userIds?.length || 1}</Text>
                </View>
              ))}
            </View>
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
      </TouchableOpacity>
    );
  }, [colors, handleUnpin, handleMessagePress]);

  const styles = createStyles(colors);

  return (
    <ScreenLayout>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <HeaderBackButton onPress={() => navigation.goBack()} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            Pinned Messages
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            #{channelName}
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
      paddingHorizontal: scale(16),
      paddingVertical: verticalScale(12),
      borderBottomWidth: 1,
      gap: 8,
    },
    backButton: { padding: moderateScale(4) },
    headerTitle: { fontSize: moderateScale(17), fontWeight: '700' },
    headerSubtitle: { fontSize: moderateScale(12), marginTop: verticalScale(2) },
    listContainer: { padding: moderateScale(12), gap: 10 },
    messageCard: {
      borderRadius: moderateScale(12),
      padding: moderateScale(12),
      gap: 8,
    },
    authorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    authorName: { fontSize: moderateScale(13), fontWeight: '700' },
    timestamp: { fontSize: moderateScale(11) },
    contentContainer: { paddingLeft: scale(36), gap: 8 },
    contentText: { fontSize: moderateScale(14), lineHeight: 20 },
    canvasCard: {
      padding: moderateScale(10),
      borderRadius: moderateScale(8),
      borderWidth: 1,
      gap: 4,
      marginTop: verticalScale(4),
    },
    canvasHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    canvasTitle: {
      fontSize: moderateScale(14),
      fontWeight: '700',
    },
    canvasSummary: {
      fontSize: moderateScale(12),
    },
    imageFrame: {
      borderRadius: moderateScale(8),
      overflow: 'hidden',
      marginTop: verticalScale(4),
    },
    previewImage: {
      width: '100%',
      height: verticalScale(140),
      borderRadius: moderateScale(8),
      resizeMode: 'cover',
    },
    mediaFrame: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: moderateScale(8),
      borderRadius: moderateScale(8),
      gap: 8,
      marginTop: verticalScale(4),
    },
    mediaName: {
      fontSize: moderateScale(12),
      fontWeight: '500',
      flex: 1,
    },
    fileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: moderateScale(8),
      borderRadius: moderateScale(8),
      borderWidth: 1,
      gap: 8,
      marginTop: verticalScale(4),
    },
    reactionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: verticalScale(6),
    },
    reactionPill: {
      paddingHorizontal: scale(8),
      paddingVertical: verticalScale(4),
      borderRadius: moderateScale(12),
      borderWidth: 1,
    },
    reactionText: {
      fontSize: moderateScale(11),
    },
    unpinButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-end',
      gap: 4,
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(5),
      borderRadius: moderateScale(6),
      borderWidth: 1,
      marginTop: verticalScale(4),
    },
    unpinText: { fontSize: moderateScale(12), fontWeight: '600' },
  });

export default PinnedMessagesScreen;
