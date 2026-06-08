/**
 * EmojiPickerModal — grid of common emojis for adding reactions.
 *
 * Props:
 *   visible  – boolean
 *   onClose  – () => void
 *   onSelect – (emoji: string) => void
 *   colors   – theme colors
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Modal } from 'react-native';
import { X } from 'lucide-react-native';

// Emoji categories matching web app's common reactions
const EMOJI_DATA = [
  { label: 'Smileys', emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😮‍💨', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕'] },
  { label: 'Gestures', emojis: ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤝', '🙏', '💪', '👏', '🤲', '🫶'] },
  { label: 'Hearts', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '💕', '💞', '💓', '💗', '💖', '💘', '💝'] },
  { label: 'Objects', emojis: ['🔥', '⭐', '🌟', '✨', '💫', '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🎯', '💯', '✅', '❌', '⚡', '💡', '📌', '🔔', '💬', '👀', '💭', '🗯️'] },
  { label: 'Faces', emojis: ['🙈', '🙉', '🙊', '💩', '👻', '💀', '☠️', '👽', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'] },
];

const ALL_EMOJIS = EMOJI_DATA.flatMap(c => c.emojis);

const EmojiPickerModal = React.memo(function EmojiPickerModal({ visible, onClose, onSelect, colors }) {
  const handleSelect = (emoji) => {
    onSelect?.(emoji);
    onClose?.();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.container, {
            backgroundColor: colors.background || '#1a1a1a',
            borderColor: colors.border || '#333',
          }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border || '#333' }]}>
            <Text style={[styles.title, { color: colors.textPrimary || '#fff' }]}>
              Reactions
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.textSecondary || '#aaa'} />
            </TouchableOpacity>
          </View>

          {/* Emoji Grid */}
          <FlatList
            data={ALL_EMOJIS}
            numColumns={8}
            keyExtractor={(item, index) => `${item}-${index}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.emojiButton}
                onPress={() => handleSelect(item)}
                activeOpacity={0.6}
              >
                <Text style={styles.emoji}>{item}</Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 320 }}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  container: {
    width: '85%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: 400,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  closeButton: {
    padding: 4,
  },
  grid: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  emojiButton: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: '12.5%',
  },
  emoji: {
    fontSize: 24,
  },
});

export default EmojiPickerModal;
