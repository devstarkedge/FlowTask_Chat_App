import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import {
  Forward,
  Bookmark,
  Clock,
  Edit2,
  Link as LinkIcon,
  Copy,
  Trash2,
  SmilePlus,
  MessageSquare,
  Star,
  Pin,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { usePreferencesStore } from '../stores/preferencesStore';
import { useStarredStore } from '../stores/useStarredStore';
import { applySkinTone } from '../utils/emojiUtils';
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import useResponsive from '../hooks/useResponsive';


const QUICK_EMOJIS = ['🎉', '👍', '😂', '🙂', '✅'];

// ─── Message content type detection ─────────────────────────────────────────

const URL_REGEX = /https?:\/\/[^\s()]+/i;
const URL_REGEX_GLOBAL = /https?:\/\/[^\s()]+/ig;
const MD_IMAGE_REGEX_GLOBAL = /!\[.*?\]\(.*?\)/ig;

const hasText = (msg) => {
  let text = msg?.content || '';
  text = text.replace(MD_IMAGE_REGEX_GLOBAL, '');
  // Strip URLs from content — if anything remains, it has plain text
  return text.replace(URL_REGEX_GLOBAL, '').trim().length > 0;
};

const hasLink = (msg) => {
  let text = msg?.content || '';
  text = text.replace(MD_IMAGE_REGEX_GLOBAL, '');
  return URL_REGEX.test(text);
};

const hasImageOnly = (msg) => {
  if (!msg) return false;
  let text = msg?.content || '';
  const hasMdImages = /!\[.*?\]\(.*?\)/i.test(text);
  const textWithoutImages = text.replace(MD_IMAGE_REGEX_GLOBAL, '').trim();

  const attachments = msg.fileReferences?.length
    ? msg.fileReferences.map(r => r.fileId).filter(Boolean)
    : msg.attachments || msg.files || [];
  const hasImages = attachments.some(f => {
    const mime = f?.mimeType || '';
    const name = f?.originalName || f?.fileName || f?.name || '';
    return mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(name);
  });
  
  // It's image only if there's an image AND no actual text
  return (hasImages || hasMdImages) && textWithoutImages.length === 0;
};

// ─── Component ───────────────────────────────────────────────────────────────

const MessageActionSheet = ({
  visible,
  onClose,
  message,
  colors,
  user,
  isSaved,
  onReact,
  onOpenEmojiPicker,
  onForward,
  onSave,
  onRemind,
  onEdit,
  onDelete,
  onCopyLink,
  onReply,
  onMarkUnread,
  onToggleNotifications,
  onPin,
}) => {
  const { isTablet, isDesktop, width } = useResponsive();
  const isWide = isTablet || isDesktop || width > 640;
  const { emojiSkinTone } = usePreferencesStore();
  const { toggleFavorite, isFavorited } = useStarredStore();
  if (!message) return null;

  const isAuthor =
    message.authorId?._id === user?._id || message.authorId === user?._id;

  const imageOnly = hasImageOnly(message);
  const showCopyText = !imageOnly && hasText(message);
  const showCopyLink = !imageOnly && hasLink(message);

  const handleCopyText = async () => {
    await Clipboard.setStringAsync(message.content || '');
    Toast.show({ type: 'success', text1: 'Text copied to clipboard' });
    onClose();
  };

  const handleCopyLink = async () => {
    const textWithoutImages = (message.content || '').replace(MD_IMAGE_REGEX_GLOBAL, '');
    const url = textWithoutImages.match(URL_REGEX)?.[0] || '';
    await Clipboard.setStringAsync(url);
    Toast.show({ type: 'success', text1: 'Link copied to clipboard' });
    onClose();
  };

  const isStarred = isFavorited('message', message?._id);
  const handleStarToggle = async () => {
    try {
      await toggleFavorite('message', message?._id);
      Toast.show({ type: 'success', text1: isStarred ? 'Message unstarred' : 'Message starred' });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Failed to star/unstar message' });
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={[styles.overlay, isWide && styles.wideOverlay]}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[
            styles.sheetContainer,
            { backgroundColor: colors.background },
            isWide && styles.wideSheetContainer,
          ]}
        >
          {/* Drag indicator */}
          <View style={styles.indicatorContainer}>
            <View style={[styles.indicator, { backgroundColor: colors.border }]} />
          </View>

          {/* Quick Emoji Row */}
          <View style={styles.emojisRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojisScroll}>
              {QUICK_EMOJIS.map((emoji) => {
                const displayEmoji = applySkinTone(emoji, emojiSkinTone);
                return (
                  <TouchableOpacity
                    key={emoji}
                    style={[styles.emojiCircle, { backgroundColor: colors.backgroundSecondary }]}
                    onPress={() => { onReact(displayEmoji); onClose(); }}
                  >
                    <Text style={styles.emojiText}>{displayEmoji}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[styles.emojiCircle, { backgroundColor: colors.backgroundSecondary }]}
                onPress={() => { onClose(); setTimeout(() => onOpenEmojiPicker(), 150); }}
              >
                <SmilePlus size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Big Action Buttons */}
          <View style={styles.bigActionsRow}>
            <TouchableOpacity
              style={[styles.bigActionBtn, { backgroundColor: colors.backgroundSecondary }]}
              onPress={() => { onClose(); setTimeout(() => onForward(), 100); }}
            >
              <Forward size={24} color={colors.textPrimary} style={{ marginBottom: verticalScale(8) }} />
              <Text style={[styles.bigActionText, { color: colors.textPrimary }]}>Forward</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.bigActionBtn, { backgroundColor: colors.backgroundSecondary }]}
              onPress={() => { onSave(); onClose(); }}
            >
              <Bookmark
                size={24}
                color={colors.textPrimary}
                style={{ marginBottom: verticalScale(8) }}
                fill={isSaved ? colors.textPrimary : 'transparent'}
              />
              <Text style={[styles.bigActionText, { color: colors.textPrimary }]}>
                {isSaved ? 'Unsave' : 'Save'}
              </Text>
            </TouchableOpacity>

            {!!onReply && (
              <TouchableOpacity
                style={[styles.bigActionBtn, { backgroundColor: colors.backgroundSecondary }]}
                onPress={() => { onClose(); setTimeout(() => onReply(message), 100); }}
              >
                <MessageSquare size={24} color={colors.textPrimary} style={{ marginBottom: verticalScale(8) }} />
                <Text style={[styles.bigActionText, { color: colors.textPrimary }]}>Reply</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* List Actions */}
          <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
            <TouchableOpacity
              style={styles.listItem}
              onPress={() => { onClose(); setTimeout(() => handleStarToggle(), 100); }}
            >
              <Star size={20} color={colors.textPrimary} fill={isStarred ? colors.textPrimary : 'transparent'} />
              <Text style={[styles.listItemText, { color: colors.textPrimary }]}>
                {isStarred ? 'Unstar Message' : 'Star Message'}
              </Text>
            </TouchableOpacity>

            {!!onPin && (
              <TouchableOpacity
                style={styles.listItem}
                onPress={() => { onClose(); setTimeout(() => onPin(message), 100); }}
              >
                <Pin size={20} color={colors.textPrimary} />
                <Text style={[styles.listItemText, { color: colors.textPrimary }]}>Pin Message</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.listItem}
              onPress={() => { onClose(); setTimeout(() => onRemind(), 100); }}
            >
              <Clock size={20} color={colors.textPrimary} />
              <Text style={[styles.listItemText, { color: colors.textPrimary }]}>Remind Me</Text>
            </TouchableOpacity>

            {isAuthor && (
              <TouchableOpacity
                style={styles.listItem}
                onPress={() => { onClose(); setTimeout(() => onEdit(), 100); }}
              >
                <Edit2 size={20} color={colors.textPrimary} />
                <Text style={[styles.listItemText, { color: colors.textPrimary }]}>Edit Message</Text>
              </TouchableOpacity>
            )}

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {showCopyText && (
              <TouchableOpacity style={styles.listItem} onPress={handleCopyText}>
                <Copy size={20} color={colors.textPrimary} />
                <Text style={[styles.listItemText, { color: colors.textPrimary }]}>Copy Text</Text>
              </TouchableOpacity>
            )}

            {showCopyLink && (
              <TouchableOpacity style={styles.listItem} onPress={handleCopyLink}>
                <LinkIcon size={20} color={colors.primary} />
                <Text style={[styles.listItemText, { color: colors.primary }]}>Copy Link</Text>
              </TouchableOpacity>
            )}

            {isAuthor && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <TouchableOpacity
                  style={styles.listItem}
                  onPress={() => { onClose(); setTimeout(() => onDelete(), 100); }}
                >
                  <Trash2 size={20} color={colors.error} />
                  <Text style={[styles.listItemText, { color: colors.error }]}>Delete Message</Text>
                </TouchableOpacity>
              </>
            )}

            <View style={{ height: verticalScale(24) }} />
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  wideOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: scale(20),
  },
  sheetContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(8),
    maxHeight: '90%',
  },
  wideSheetContainer: {
    width: '100%',
    maxWidth: 540,
    borderRadius: 20,
    maxHeight: '85%',
  },
  indicatorContainer: {
    alignItems: 'center',
    marginBottom: verticalScale(16),
  },
  indicator: {
    width: scale(40),
    height: verticalScale(5),
    borderRadius: moderateScale(3),
  },
  emojisRow: {
    marginBottom: verticalScale(20),
  },
  emojisScroll: {
    gap: 16,
    paddingHorizontal: scale(8),
    alignItems: 'center',
  },
  emojiCircle: {
    width: scale(50),
    height: verticalScale(50),
    borderRadius: moderateScale(25),
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: {
    fontSize: moderateScale(24),
  },
  bigActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: verticalScale(24),
  },
  bigActionBtn: {
    flex: 1,
    height: verticalScale(90),
    borderRadius: moderateScale(16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigActionText: {
    fontSize: moderateScale(13),
    fontWeight: '600',
  },
  listContainer: {
    marginBottom: Platform.OS === 'ios' ? 20 : 0,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(14),
    gap: 16,
  },
  listItemText: {
    fontSize: moderateScale(16),
    fontWeight: '400',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: verticalScale(4),
  },
});

export default MessageActionSheet;
