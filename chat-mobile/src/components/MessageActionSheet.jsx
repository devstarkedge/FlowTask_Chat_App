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
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';

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
}) => {
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={[styles.sheetContainer, { backgroundColor: colors.background }]}>
          {/* Drag indicator */}
          <View style={styles.indicatorContainer}>
            <View style={[styles.indicator, { backgroundColor: colors.border }]} />
          </View>

          {/* Quick Emoji Row */}
          <View style={styles.emojisRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojisScroll}>
              {QUICK_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.emojiCircle, { backgroundColor: colors.backgroundSecondary }]}
                  onPress={() => { onReact(emoji); onClose(); }}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
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
              <Forward size={24} color={colors.textPrimary} style={{ marginBottom: 8 }} />
              <Text style={[styles.bigActionText, { color: colors.textPrimary }]}>Forward</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.bigActionBtn, { backgroundColor: colors.backgroundSecondary }]}
              onPress={() => { onSave(); onClose(); }}
            >
              <Bookmark
                size={24}
                color={colors.textPrimary}
                style={{ marginBottom: 8 }}
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
                <MessageSquare size={24} color={colors.textPrimary} style={{ marginBottom: 8 }} />
                <Text style={[styles.bigActionText, { color: colors.textPrimary }]}>Reply</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* List Actions */}
          <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
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

            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
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
  sheetContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
    maxHeight: '90%',
  },
  indicatorContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  indicator: {
    width: 40,
    height: 5,
    borderRadius: 3,
  },
  emojisRow: {
    marginBottom: 20,
  },
  emojisScroll: {
    gap: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  emojiCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: {
    fontSize: 24,
  },
  bigActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  bigActionBtn: {
    flex: 1,
    height: 90,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  listContainer: {
    marginBottom: Platform.OS === 'ios' ? 20 : 0,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 16,
  },
  listItemText: {
    fontSize: 16,
    fontWeight: '400',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
});

export default MessageActionSheet;
