import React, { useMemo } from 'react';
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
  BellOff,
  Edit2,
  Link as LinkIcon,
  MoreHorizontal,
  Trash2,
  Mail,
  SmilePlus,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';

const QUICK_EMOJIS = ['🎉', '👍', '😂', '🙂', '✅'];

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
  onMarkUnread,
  onToggleNotifications,
}) => {
  if (!message) return null;

  const isAuthor = message.authorId?._id === user?._id || message.authorId === user?._id;

  const handleCopyText = async () => {
    await Clipboard.setStringAsync(message.content || '');
    Toast.show({ type: 'success', text1: 'Text copied to clipboard' });
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
        <View
          style={[
            styles.sheetContainer,
            { backgroundColor: colors.background }
          ]}
        >
          {/* Top Pill / Indicator */}
          <View style={styles.indicatorContainer}>
            <View style={[styles.indicator, { backgroundColor: colors.border }]} />
          </View>

          {/* Quick Emojis Row */}
          <View style={styles.emojisRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojisScroll}>
              {QUICK_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.emojiCircle, { backgroundColor: colors.backgroundSecondary }]}
                  onPress={() => {
                    onReact(emoji);
                    onClose();
                  }}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.emojiCircle, { backgroundColor: colors.backgroundSecondary }]}
                onPress={() => {
                  onClose();
                  // Give modal time to close before opening picker on some devices
                  setTimeout(() => onOpenEmojiPicker(), 150);
                }}
              >
                <SmilePlus size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Big Action Buttons */}
          <View style={styles.bigActionsRow}>
            <TouchableOpacity
              style={[styles.bigActionBtn, { backgroundColor: colors.backgroundSecondary }]}
              onPress={() => {
                onClose();
                setTimeout(() => onForward(), 100);
              }}
            >
              <Forward size={24} color={colors.textPrimary} style={{ marginBottom: 8 }} />
              <Text style={[styles.bigActionText, { color: colors.textPrimary }]}>Forward</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.bigActionBtn, { backgroundColor: colors.backgroundSecondary }]}
              onPress={() => {
                onSave();
                onClose();
              }}
            >
              <Bookmark size={24} color={colors.textPrimary} style={{ marginBottom: 8 }} fill={isSaved ? colors.textPrimary : 'transparent'} />
              <Text style={[styles.bigActionText, { color: colors.textPrimary }]}>
                {isSaved ? 'Unsave' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* List Actions */}
          <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
            <TouchableOpacity style={styles.listItem} onPress={() => {
              onMarkUnread();
              onClose();
            }}>
              <Mail size={20} color={colors.textPrimary} />
              <Text style={[styles.listItemText, { color: colors.textPrimary }]}>Mark Unread</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.listItem}
              onPress={() => {
                onClose();
                setTimeout(() => onRemind(), 100);
              }}
            >
              <Clock size={20} color={colors.textPrimary} />
              <Text style={[styles.listItemText, { color: colors.textPrimary }]}>Remind Me</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.listItem} onPress={() => {
              onToggleNotifications();
              onClose();
            }}>
              <BellOff size={20} color={colors.textPrimary} />
              <Text style={[styles.listItemText, { color: colors.textPrimary }]}>Don't Get Reply Notifications</Text>
            </TouchableOpacity>

            {isAuthor && (
              <TouchableOpacity
                style={styles.listItem}
                onPress={() => {
                  onClose();
                  setTimeout(() => onEdit(), 100);
                }}
              >
                <Edit2 size={20} color={colors.textPrimary} />
                <Text style={[styles.listItemText, { color: colors.textPrimary }]}>Edit Message</Text>
              </TouchableOpacity>
            )}

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <TouchableOpacity style={styles.listItem} onPress={() => {
              onCopyLink();
              onClose();
            }}>
              <LinkIcon size={20} color={colors.textPrimary} />
              <Text style={[styles.listItemText, { color: colors.textPrimary }]}>Copy Link to Message</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.listItem} onPress={handleCopyText}>
              <Text style={[styles.listItemText, { color: colors.textPrimary, marginLeft: 36 }]}>Copy Text</Text>
            </TouchableOpacity>
            
            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {isAuthor && (
              <TouchableOpacity
                style={styles.listItem}
                onPress={() => {
                  onClose();
                  setTimeout(() => onDelete(), 100);
                }}
              >
                <Trash2 size={20} color="#ef4444" />
                <Text style={[styles.listItemText, { color: "#ef4444" }]}>Delete Message</Text>
              </TouchableOpacity>
            )}
            
            {/* Bottom padding for safety */}
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
    fontSize: 15,
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
