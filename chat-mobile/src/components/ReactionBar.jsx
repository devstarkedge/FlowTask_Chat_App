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
import { scale, verticalScale, moderateScale } from '../utils/responsive';


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
    return null;
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
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: verticalScale(4),
    gap: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(3),
    borderRadius: moderateScale(12),
    borderWidth: 1,
    gap: 4,
  },
  emoji: {
    fontSize: moderateScale(14),
  },
  count: {
    fontSize: moderateScale(12),
    fontWeight: '600',
  },
  addButton: {
    width: scale(30),
    height: verticalScale(26),
    borderRadius: moderateScale(13),
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ReactionBar;
