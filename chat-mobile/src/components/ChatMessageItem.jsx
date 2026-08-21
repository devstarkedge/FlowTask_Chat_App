import React, { memo } from 'react';
import { View as RNView, Text as RNText, TouchableOpacity as RNTouchableOpacity, Pressable, Platform, Linking } from 'react-native';
import { Reply, Pin, Bookmark } from 'lucide-react-native';
import AppAvatar from './common/AppAvatar';
import { formatTime, isSameDay } from '../utils/dateUtils';
import { moderateScale, scale, verticalScale } from '../utils/responsive';
import AudioMessagePlayer from './AudioMessagePlayer';
import VideoMessagePlayer from './VideoMessagePlayer';
import GifRenderer from './GifRenderer';
import RichText from './RichText';
import MobileFileCard from './common/MobileFileCard';
import MessageStatusTicks from './MessageStatusTicks';
import ReactionBar from './ReactionBar';
import ReplyQuotePreview from './ReplyQuotePreview';
import { useLaterStore } from '../stores/laterStore';
import logger from '../utils/logger';
import { getFileKind, getMessageAttachments } from '../utils/mediaUtils';
import { resolveReplyToSenderName, isGenericName, hasValidReplyTo, resolveReplyToContent, resolveReplyToAttachment } from '../utils/replyUtils';

// Helpers
const getAuthorId = (item) => item?.authorId?._id || item?.authorId;

const ChatMessageItem = memo(({
  item,
  prevItem,
  nextItem,
  user,
  colors,
  styles,
  searchQuery,
  searchResults,
  currentMatch,
  index,
  highlightedMessageId,
  channelId,
  channelName,
  channelMembers,
  maxBubbleWidth,
  showMessageActions,
  addReaction,
  removeReaction,
  setEmojiPickerTarget,
  navigation,
  renderDateSeparator,
  onReplyPreviewPress,
}) => {
  const isMe = item.authorId?._id === user?._id || item.authorId === user?._id;
  const isSystem = item.contentType === "system" && !item.activityMeta;

  if (isSystem) {
    return (
      <RNView style={styles.systemMessageContainer} key={item._id}>
        <RNView style={[styles.systemMessageLine, { backgroundColor: colors.border }]} />
        <RNText style={[styles.systemMessageText, { color: colors.textSecondary }]}>
          {item.content}
        </RNText>
        <RNView style={[styles.systemMessageLine, { backgroundColor: colors.border }]} />
      </RNView>
    );
  }

  const isDeleted = item.isDeleted === true;
  const deletedText = isMe
    ? "You deleted this message"
    : "This message was deleted";

  const textToSearch = item?.content || item?.htmlContent || '';
  const isMatch =
    searchQuery &&
    typeof textToSearch === 'string' &&
    textToSearch.toLowerCase().includes(searchQuery.toLowerCase());
  const isHighlighted =
    isMatch && searchResults.length && searchResults[currentMatch] === index;
  const isReplyTarget =
    highlightedMessageId != null &&
    String(highlightedMessageId) === String(item._id);

  const messageSender = item.senderSnapshot?.name ? item.senderSnapshot : item.authorId;

  const isCompact =
    prevItem &&
    getAuthorId(item) === getAuthorId(prevItem) &&
    !item.isActivity &&
    !prevItem.isActivity &&
    Math.abs(new Date(item.createdAt) - new Date(prevItem.createdAt)) < 5 * 60 * 1000;

  const sameAsNext =
    nextItem &&
    getAuthorId(item) === getAuthorId(nextItem) &&
    !item.isActivity &&
    !nextItem.isActivity &&
    Math.abs(new Date(nextItem.createdAt) - new Date(item.createdAt)) < 5 * 60 * 1000;
  
  const isLastInGroup = !sameAsNext;

  const groupPos =
    !isCompact && isLastInGroup
      ? "solo"
      : !isCompact
        ? "first"
        : isLastInGroup
          ? "last"
          : "middle";

  let bubbleRadiusStyle = {};
  if (isMe) {
    if (groupPos === 'first') {
      bubbleRadiusStyle = { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 4, borderBottomLeftRadius: 18 };
    } else if (groupPos === 'middle') {
      bubbleRadiusStyle = { borderTopLeftRadius: 18, borderTopRightRadius: 4, borderBottomRightRadius: 4, borderBottomLeftRadius: 18 };
    } else if (groupPos === 'last') {
      bubbleRadiusStyle = { borderTopLeftRadius: 18, borderTopRightRadius: 4, borderBottomRightRadius: 18, borderBottomLeftRadius: 18 };
    } else { // solo
      bubbleRadiusStyle = { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 18 };
    }
  } else {
    if (groupPos === 'first') {
      bubbleRadiusStyle = { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 4 };
    } else if (groupPos === 'middle') {
      bubbleRadiusStyle = { borderTopLeftRadius: 4, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 4 };
    } else if (groupPos === 'last') {
      bubbleRadiusStyle = { borderTopLeftRadius: 4, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 18 };
    } else { // solo
      bubbleRadiusStyle = { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 18 };
    }
  }

  const showDateSep = !prevItem || !isSameDay(item.createdAt, prevItem.createdAt);
  const hasThread = (item.replyCount || 0) > 0;
  
  const itemIdStr = item._id ? String(item._id) : item.tempId;
  const isSaved = useLaterStore((s) => s.savedMessageIds?.some(id => String(id) === itemIdStr));
  const attachments = getMessageAttachments(item);

  if (attachments.length > 0) {
    logger.info(`[ChatMessageItem] Message ${item._id} (${item.contentType}) has ${attachments.length} attachment(s)`);
  }

  const contentColor = isMe ? colors.messageTextSent : colors.messageTextReceived;

  const replySenderOverride = (() => {
    if (!hasValidReplyTo(item.replyTo, item.parentMessageId)) return null;
    const existing = (item.replyTo.senderName || "").trim();
    if (existing && !isGenericName(existing)) return existing;
    return resolveReplyToSenderName(item.replyTo, null, channelMembers || []);
  })();

  const showReplyQuote = hasValidReplyTo(item.replyTo, item.parentMessageId);

  return (
    <RNView 
      style={isReplyTarget
        ? {
            backgroundColor: (colors.primary || "#6366F1") + "28",
            marginHorizontal: -12,
            paddingHorizontal: scale(12),
            paddingVertical: verticalScale(6),
            borderRadius: moderateScale(8),
          }
        : null}
    >
      {showDateSep && renderDateSeparator(item.createdAt)}

      <RNView
        style={[
          styles.messageContainer,
          isMe ? styles.myMessage : styles.theirMessage,
          isCompact && styles.messageCompact,
        ]}
      >
        {!isMe && !isCompact && (
          <RNTouchableOpacity 
            onPress={() => {
              const senderId = messageSender?._id || messageSender?.id || (typeof messageSender === 'string' ? messageSender : null) || getAuthorId(item);
              const userObj = (channelMembers || []).find((m) => m._id === senderId) || messageSender;
              navigation.navigate("UserProfile", { user: userObj, channelId, messageId: item._id });
            }}
            activeOpacity={0.7}
          >
            <AppAvatar
              user={messageSender}
              size={32}
              showStatus={false}
              style={{ marginTop: verticalScale(2) }}
            />
          </RNTouchableOpacity>
        )}
        {!isMe && isCompact && <RNView style={{ width: scale(32) }} />}

        <RNView
          style={[
            styles.messageContent,
            isMe ? styles.messageContentMe : styles.messageContentThem,
            { maxWidth: maxBubbleWidth, flexShrink: 1 }
          ]}
        >
          {!isMe && !isCompact && (
            <RNView style={styles.senderRow}>
              <RNText style={[styles.senderName, { color: colors.textSecondary }]} numberOfLines={1}>
                {messageSender?.name || "Unknown"}
              </RNText>
              <RNText style={[styles.timestamp, { color: colors.textTertiary }]}>
                {formatTime(item.createdAt)}
              </RNText>
            </RNView>
          )}

          <RNView
            style={[
              styles.bubble,
              bubbleRadiusStyle,
              {
                backgroundColor: isMe
                  ? colors.messageBubbleSent
                  : colors.messageBubbleReceived,
                alignSelf: isMe ? 'flex-end' : 'flex-start',
              },
              isReplyTarget && {
                borderWidth: 2,
                borderColor: colors.primary,
              },
              isHighlighted && !isReplyTarget && {
                borderWidth: 2,
                borderColor: colors.primary,
              },
            ]}
          >
            {showReplyQuote ? (
              <ReplyQuotePreview
                replyTo={item.replyTo}
                colors={colors}
                isMe={isMe}
                variant="bubble"
                senderNameOverride={replySenderOverride}
                onPress={
                  onReplyPreviewPress
                    ? () =>
                        onReplyPreviewPress(
                          item.replyTo?.messageId || item.parentMessageId
                        )
                    : undefined
                }
              />
            ) : null}
            <Pressable
              onLongPress={() => !isDeleted && showMessageActions(item)}
              delayLongPress={350}
            >
            {item.forwardMeta?.isForwarded && (
              <RNView style={[styles.forwardedRow, { borderBottomColor: colors.border }]}>
                <Reply size={12} color={contentColor} style={{ marginRight: scale(4), transform: [{ scaleX: -1 }] }} />
                <RNText style={[styles.forwardedText, { color: contentColor, opacity: 0.8 }]}>
                  Forwarded from{" "}
                  <RNText style={{ fontWeight: "700" }}>
                    {item.forwardMeta.originalChannelName
                      ? (item.forwardMeta.originalChannelType === "dm"
                          ? item.forwardMeta.originalChannelName
                          : `#${item.forwardMeta.originalChannelName}`)
                      : item.forwardMeta.originalSenderName || "Unknown"}
                  </RNText>
                </RNText>
              </RNView>
            )}

            {isDeleted ? (
              <RNText style={[styles.messageText, { color: colors.textTertiary, fontStyle: "italic" }]}>
                {deletedText}
              </RNText>
            ) : item.contentType === 'audio' || item.type === 'audio' ? (
              <AudioMessagePlayer
                audioUrl={item.audioUrl || item.audioMeta?.audioUrl || attachments[0]?.url || attachments[0]?.secureUrl}
                duration={item.duration || item.audioMeta?.duration}
                fileSize={item.audioMeta?.fileSize || attachments[0]?.fileSize}
                colors={colors}
                isMe={isMe}
                onLongPress={() => !isDeleted && showMessageActions(item, attachments[0] || { url: item.audioUrl || item.audioMeta?.audioUrl })}
              />
            ) : item.contentType === 'video' || item.type === 'video' ? (
              <VideoMessagePlayer
                videoUrl={item.videoUrl || item.videoMeta?.videoUrl || attachments[0]?.url || attachments[0]?.secureUrl}
                thumbnailUrl={item.thumbnailUrl || item.videoMeta?.thumbnailUrl || attachments[0]?.thumbnailUrl}
                width={item.width || item.videoMeta?.width}
                height={item.height || item.videoMeta?.height}
                colors={colors}
                onLongPress={() => !isDeleted && showMessageActions(item, attachments[0] || { url: item.videoUrl || item.videoMeta?.videoUrl, thumbnailUrl: item.thumbnailUrl || item.videoMeta?.thumbnailUrl })}
              />
            ) : item.contentType === 'gif' && item.gifMeta ? (
              <GifRenderer item={item} contentColor={contentColor} styles={styles} />
            ) : (item.htmlContent || item.content) ? (
              <RichText
                html={item.htmlContent}
                text={item.content}
                mentions={item.mentions}
                searchQuery={searchQuery}
                onMentionPress={(userId) => {
                  const userObj = (channelMembers || []).find((m) => m._id === userId) || { _id: userId };
                  navigation.navigate("UserProfile", { user: userObj, channelId, messageId: item._id });
                }}
                colors={{
                  ...colors,
                  textPrimary: contentColor,
                  codeBackground: isMe ? colors.surfaceOverlayLight : colors.codeBackground,
                  codeBlockBackground: isMe ? colors.shadowMd : colors.codeBlockBackground,
                  codeBlockText: isMe ? colors.textOnPrimary : colors.codeBlockText,
                }}
                baseStyle={{ color: contentColor, fontSize: moderateScale(15), lineHeight: 22 }}
              />
            ) : null}

            {!isDeleted && attachments.length > 0 && !['audio', 'video'].includes(item.contentType) && !['audio', 'video'].includes(item.type) && (
              <RNView style={{ marginTop: verticalScale(4), width: '100%', gap: 4 }}>
                {attachments.map((file, i) => {
                  const kind = getFileKind(file.mimeType, file.name || file.fileName, file.url || file.secureUrl);
                  if (kind === 'video') {
                    return (
                      <VideoMessagePlayer
                        key={file._id || i}
                        videoUrl={file.url || file.secureUrl}
                        thumbnailUrl={file.thumbnailUrl}
                        width={file.width || 16}
                        height={file.height || 9}
                        colors={colors}
                        onLongPress={() => !isDeleted && showMessageActions(item, file)}
                      />
                    );
                  }
                  return <MobileFileCard key={file._id || i} file={file} colors={colors} isUploading={item.pending || item.status === 'pending' || file.isOptimisticPreview} onLongPress={() => !isDeleted && showMessageActions(item, file)} />;
                })}
              </RNView>
            )}

            <RNView style={styles.timestampRow}>
              <RNText
                style={[
                  styles.timestamp,
                  { color: isMe ? colors.messageTextSent : colors.textTertiary, opacity: 0.7 },
                ]}
              >
                {formatTime(item.createdAt)}
              </RNText>
              {item.isEdited && !isDeleted && (
                <RNText style={[styles.editedLabel, { color: isMe ? colors.messageTextSent : colors.textTertiary }]}>
                  {" "}(edited)
                </RNText>
              )}
              {item.isPinned && (
                <Pin size={10} color={isMe ? colors.messageTextSent : colors.textTertiary} style={{ marginLeft: scale(4), opacity: 0.7 }} />
              )}
              <MessageStatusTicks message={item} colors={colors} isMe={isMe} size={12} />
            </RNView>

            {isSaved && !isDeleted && (
              <RNView style={{ position: 'absolute', top: -4, right: -4, backgroundColor: colors.card, borderRadius: moderateScale(10), padding: moderateScale(2), elevation: 2, zIndex: 99, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: scale(0), height: verticalScale(1) } }}>
                <Bookmark size={12} color={colors.primary} fill={colors.primary} />
              </RNView>
            )}
            </Pressable>
          </RNView>

          {!isDeleted && (
            <ReactionBar
              reactions={item.reactions}
              messageId={item._id}
              currentUserId={user?._id}
              onAddReaction={(emoji) => addReaction(item._id, emoji)}
              onRemoveReaction={(emoji) => removeReaction(item._id, emoji)}
              onOpenPicker={() => setEmojiPickerTarget(item._id)}
              colors={colors}
            />
          )}

          {hasThread && (
            <RNTouchableOpacity
              style={[styles.threadIndicator, { borderColor: colors.border }]}
              onPress={() => {
                navigation.navigate("ThreadDetail", {
                  rootMessageId: item._id,
                  channelId,
                  channelName,
                  rootContent: item.content,
                  rootHtmlContent: item.htmlContent,
                  replyCount: item.replyCount || 0,
                  rootAuthor: item.senderSnapshot?.name ? item.senderSnapshot : item.authorId,
                });
              }}
              activeOpacity={0.7}
            >
              <RNView style={styles.threadAvatars}>
                {(item.threadParticipants || []).slice(0, 3).map((p, i) => (
                  <AppAvatar
                    key={p._id || i}
                    user={p}
                    size={18}
                    showStatus={false}
                    style={{ marginLeft: i > 0 ? -6 : 0 }}
                  />
                ))}
              </RNView>
              <RNText style={[styles.threadText, { color: colors.primary }]}>
                {item.replyCount} {item.replyCount === 1 ? "reply" : "replies"}
              </RNText>
              {item.lastReplyAt && (
                <RNText style={[styles.threadTime, { color: colors.textTertiary }]}>
                  Last reply {formatTime(item.lastReplyAt)}
                </RNText>
              )}
            </RNTouchableOpacity>
          )}
        </RNView>
      </RNView>
    </RNView>
  );
}, (prevProps, nextProps) => {
  // Custom memo comparison for extreme performance
  const prevIdStr = prevProps.item._id ? String(prevProps.item._id) : prevProps.item.tempId;
  const nextIdStr = nextProps.item._id ? String(nextProps.item._id) : nextProps.item.tempId;

  const prevIsReplyTarget =
    prevProps.highlightedMessageId != null &&
    String(prevProps.highlightedMessageId) === prevIdStr;
  const nextIsReplyTarget =
    nextProps.highlightedMessageId != null &&
    String(nextProps.highlightedMessageId) === nextIdStr;

  const prevIsSearchHighlight =
    prevProps.searchQuery &&
    prevProps.searchResults.length > 0 &&
    prevProps.searchResults[prevProps.currentMatch] === prevProps.index;
  const nextIsSearchHighlight =
    nextProps.searchQuery &&
    nextProps.searchResults.length > 0 &&
    nextProps.searchResults[nextProps.currentMatch] === nextProps.index;

  return (
    prevProps.item === nextProps.item &&
    prevProps.item?.isDeleted === nextProps.item?.isDeleted &&
    prevProps.prevItem === nextProps.prevItem &&
    prevProps.nextItem === nextProps.nextItem &&
    prevIsReplyTarget === nextIsReplyTarget &&
    prevIsSearchHighlight === nextIsSearchHighlight &&
    prevProps.searchQuery === nextProps.searchQuery &&
    prevProps.onReplyPreviewPress === nextProps.onReplyPreviewPress &&
    prevProps.colors.background === nextProps.colors.background
  );
});

export default ChatMessageItem;

