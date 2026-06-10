/**
 * ReactionBar — renders emoji reaction pills below a message.
 *
 * Each pill shows: emoji + count. Highlighted if current user reacted.
 * Tap a pill to toggle the current user's reaction.
 * Tap the "+" button to open the emoji picker.
 *
 * Props:
 *   reactions       – array of { emoji, users, userIds, count }
 *   messageId       – message _id
 *   currentUserId   – logged-in user _id
 *   onAddReaction   – (emoji) => void
 *   onRemoveReaction – (emoji) => void
 *   onOpenPicker    – () => void  (opens emoji picker modal)
 *   colors          – theme colors
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SmilePlus } from 'lucide-react-native';

const ReactionBar = React.memo(function ReactionBar({
  reactions = [],
  messageId,
  currentUserId,
  onAddReaction,
  onRemoveReaction,
  onOpenPicker,
  colors,
}) {
  if (!reactions || reactions.length === 0) {
    // Show only the add button if no reactions
    return (
      <TouchableOpacity
        style={[styles.addButton, { borderColor: colors.border }]}
        onPress={onOpenPicker}
        activeOpacity={0.7}
      >
        <SmilePlus size={14} color={colors.textTertiary} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {reactions.map((r) => {
        // Use String() to handle ObjectId instances vs plain strings
        const hasReacted = r.userIds?.some(id => String(id) === String(currentUserId));
        return (
          <TouchableOpacity
            key={r.emoji}
            style={[
              styles.pill,
              {
                backgroundColor: hasReacted
                  ? (colors.primaryLight || colors.primary)
                  : (colors.backgroundTertiary || colors.background),
                borderColor: hasReacted
                  ? colors.primary
                  : colors.border,
              },
            ]}
            onPress={() => {
              if (hasReacted) {
                onRemoveReaction?.(r.emoji);
              } else {
                onAddReaction?.(r.emoji);
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.emoji}>{r.emoji}</Text>
            <Text style={[styles.count, {
              color: hasReacted ? colors.primary : colors.textSecondary,
            }]}>
              {r.count}
            </Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        style={[styles.addButton, { borderColor: colors.border }]}
        onPress={onOpenPicker}
        activeOpacity={0.7}
      >
        <SmilePlus size={14} color={colors.textTertiary} />
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  emoji: {
    fontSize: 14,
  },
  count: {
    fontSize: 12,
    fontWeight: '600',
  },
  addButton: {
    width: 30,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ReactionBar;
