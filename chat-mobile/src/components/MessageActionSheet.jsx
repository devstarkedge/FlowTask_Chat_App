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
  PinOff,
  Info,
  Download,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { usePreferencesStore } from '../stores/preferencesStore';
import { useStarredStore } from '../stores/useStarredStore';
import { applySkinTone } from '../utils/emojiUtils';
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import useResponsive from '../hooks/useResponsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { downloadAndSaveFile } from '../utils/fileDownload';
import FileService from '../services/FileService';
import FileClipboardService from '../services/FileClipboardService';
import { getFileKind } from '../utils/mediaUtils';


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
  attachment,
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
  onReplyInThread,
  onReply,
  onMarkUnread,
  onToggleNotifications,
  onPin,
  onMessageInfo,
}) => {
  const { isTablet, isDesktop, width } = useResponsive();
  const isWide = isTablet || isDesktop || width > 640;
  const { emojiSkinTone } = usePreferencesStore();
  const { toggleFavorite, isFavorited } = useStarredStore();
  const insets = useSafeAreaInsets();
  if (!message) return null;

  const isAuthor =
    message.authorId?._id === user?._id || message.authorId === user?._id;

  const imageOnly = hasImageOnly(message);
  const showCopyText = !attachment && !imageOnly && hasText(message);
  
  // Show copy link if it's an attachment, or if the message has a link
  const showCopyLink = !!attachment || (!imageOnly && hasLink(message));

  const handleCopyText = async () => {
    await Clipboard.setStringAsync(message.content || '');
    Toast.show({ type: 'success', text1: 'Text copied to clipboard' });
    onClose();
  };

  const handleCopyLink = async () => {
    if (attachment && (attachment.url || attachment.secureUrl)) {
      const url = attachment.url || attachment.secureUrl;
      const kind = getFileKind(attachment.mimeType || attachment.type || '', attachment.name || attachment.fileName || '', url);
      if (kind === 'image') {
        try {
          await FileService.copyImage(attachment);
        } catch (err) {
          console.error(err);
        }
        onClose();
        return;
      } else if (['video', 'file', 'code', 'text', 'csv'].includes(kind)) {
        await FileClipboardService.copyFile({ ...attachment, url });
        Toast.show({ type: 'success', text1: 'File copied to clipboard' });
        onClose();
        return;
      }
      await Clipboard.setStringAsync(url);
    } else {
      const textWithoutImages = (message.content || '').replace(MD_IMAGE_REGEX_GLOBAL, '');
      const url = textWithoutImages.match(URL_REGEX)?.[0] || '';
      await Clipboard.setStringAsync(url);
    }
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

  const handleDownloadAttachment = async () => {
    if (!attachment) return;
    const name = attachment.originalName || attachment.fileName || attachment.name || 'File';
    const mime = attachment.mimeType || attachment.type || 'image/jpeg';
    const url = attachment.url || attachment.secureUrl;
    if (!url) {
      Toast.show({ type: 'error', text1: 'Cannot download: file URL is missing' });
      return;
    }
    Toast.show({ type: 'info', text1: 'Downloading...' });
    onClose();
    try {
      await downloadAndSaveFile(url, name, mime);
    } catch (e) {
      Toast.show({ type: 'error', text1: e.message || 'Download failed' });
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === 'android'}
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
            { 
              backgroundColor: colors.background,
              paddingBottom: isWide 
                ? verticalScale(16) 
                : Math.max(verticalScale(16), insets.bottom)
            },
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

            {!!onReplyInThread && (
              <TouchableOpacity
                style={[styles.bigActionBtn, { backgroundColor: colors.backgroundSecondary }]}
                onPress={() => { onClose(); setTimeout(() => onReplyInThread(message), 100); }}
              >
                <MessageSquare size={24} color={colors.textPrimary} style={{ marginBottom: verticalScale(8) }} />
                <Text style={[styles.bigActionText, { color: colors.textPrimary, textAlign: 'center' }]}>Reply in thread</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* List Actions */}
          <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>

            {!!onPin && (
              <TouchableOpacity
                style={styles.listItem}
                onPress={() => { onClose(); setTimeout(() => onPin(message), 100); }}
              >
                {message?.isPinned ? (
                  <PinOff size={20} color={colors.textPrimary} />
                ) : (
                  <Pin size={20} color={colors.textPrimary} />
                )}
                <Text style={[styles.listItemText, { color: colors.textPrimary }]}>
                  {message?.isPinned ? 'Unpin Message' : 'Pin Message'}
                </Text>
              </TouchableOpacity>
            )}

            {!!onRemind && (
              <TouchableOpacity
                style={styles.listItem}
                onPress={() => { onClose(); setTimeout(() => onRemind(), 100); }}
              >
                <Clock size={20} color={colors.textPrimary} />
                <Text style={[styles.listItemText, { color: colors.textPrimary }]}>Remind Me</Text>
              </TouchableOpacity>
            )}

            {isAuthor && (
              <TouchableOpacity
                style={styles.listItem}
                onPress={() => { onClose(); setTimeout(() => onEdit(), 100); }}
              >
                <Edit2 size={20} color={colors.textPrimary} />
                <Text style={[styles.listItemText, { color: colors.textPrimary }]}>Edit Message</Text>
              </TouchableOpacity>
            )}

            {!!onMessageInfo && (
              <TouchableOpacity
                style={styles.listItem}
                onPress={() => { onClose(); setTimeout(() => onMessageInfo(message), 100); }}
              >
                <Info size={20} color={colors.textPrimary} />
                <Text style={[styles.listItemText, { color: colors.textPrimary }]}>Message Info</Text>
              </TouchableOpacity>
            )}

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {showCopyText && (
              <TouchableOpacity style={styles.listItem} onPress={handleCopyText}>
                <Copy size={20} color={colors.textPrimary} />
                <Text style={[styles.listItemText, { color: colors.textPrimary }]}>Copy Text</Text>
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
    maxWidth: scale(540),
    borderRadius: moderateScale(20),
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
    marginBottom: 0,
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
