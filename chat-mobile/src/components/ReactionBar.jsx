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
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SmilePlus, X } from 'lucide-react-native';
import AccessibleModal from './AccessibleModal';
import AppAvatar from './common/AppAvatar';
import { reactionAPI } from '../services/api';
import { scale, verticalScale, moderateScale } from '../utils/responsive';

/**
 * ReactionBar — renders emoji reaction pills below a message.
 *
 * Each pill shows: emoji + count. Highlighted if current user reacted.
 * Tapping a pill opens a Slack-style popup listing who reacted (name + avatar)
 * and the reaction count. Add/remove reaction is preserved via the popup's
 * toggle action, and the "+" button still opens the emoji picker.
 *
 * Props:
 *   reactions       – array of { emoji, users, userIds, count }
 *   messageId       – message _id
 *   currentUserId   – logged-in user _id
 *   channelMembers  – channel member objects: [{ _id, name, avatar, email }]
 *   onAddReaction   – (emoji) => void
 *   onRemoveReaction – (emoji) => void
 *   onOpenPicker    – () => void  (opens emoji picker modal)
 *   colors          – theme colors
 */
const EMOJI_SHORTCODES = {
  "🎉": "tada",
  "🎂": "cake",
  "👍": "thumbsup",
  "👍🏻": "thumbsup",
  "👍🏼": "thumbsup",
  "👍🏽": "thumbsup",
  "👍🏾": "thumbsup",
  "👍🏿": "thumbsup",
  "👎": "thumbsdown",
  "❤️": "heart",
  "♥️": "heart",
  "😍": "heart_eyes",
  "😂": "joy",
  "🤣": "rofl",
  "🔥": "fire",
  "😊": "smile",
  "🚀": "rocket",
  "✨": "sparkles",
  "🙏": "pray",
  "👏": "clap",
  "🙌": "raised_hands",
  "💡": "bulb",
  "💯": "100",
  "👀": "eyes",
  "🤔": "thinking_face",
  "😎": "sunglasses",
  "🥳": "partying_face",
  "💩": "poop",
  "✅": "check",
  "❌": "x",
};

function getEmojiShortcode(emoji) {
  if (!emoji) return "emoji";
  if (typeof emoji === "string" && emoji.startsWith(":") && emoji.endsWith(":")) {
    return emoji.slice(1, -1);
  }
  return EMOJI_SHORTCODES[emoji] || emoji;
}

function formatReactionUserNames(users, currentUserId) {
  if (!users || users.length === 0) return "No reactions";
  const currentUserIdStr = currentUserId != null ? String(currentUserId) : null;
  const names = users.map((u) => {
    const isMe = currentUserIdStr != null && String(u._id || u.userId) === currentUserIdStr;
    return isMe ? "You" : u.name || u.displayName || u.email?.split("@")[0] || "Someone";
  });

  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;

  const allButLast = names.slice(0, -1).join(", ");
  const last = names[names.length - 1];
  return `${allButLast}, and ${last}`;
}

/**
 * ReactionBar — renders emoji reaction pills below a message.
 *
 * Each pill shows: emoji + count. Highlighted if current user reacted.
 * Tapping a pill toggles the reaction or long pressing opens a floating popup.
 */
const ReactionBar = React.memo(function ReactionBar({
  reactions = [],
  messageId,
  currentUserId,
  channelMembers = [],
  onAddReaction,
  onRemoveReaction,
  onOpenPicker,
  colors,
}) {
  const [detailsEmoji, setDetailsEmoji] = useState(null);
  const [serverUsers, setServerUsers] = useState(null);

  const memberById = useMemo(() => {
    const map = new Map();
    (channelMembers || []).forEach((m) => {
      const id = m?._id ?? m?.userId;
      if (id != null) map.set(String(id), m);
    });
    return map;
  }, [channelMembers]);

  const details = detailsEmoji != null
    ? (reactions.find((r) => r.emoji === detailsEmoji) || null)
    : null;

  if (!reactions || reactions.length === 0) {
    return null;
  }

  const resolveUser = (u) => {
    if (!u) return null;
    const id = u?._id ?? u?.userId;
    if (id != null && memberById.has(String(id))) {
      const m = memberById.get(String(id));
      return { ...m, _id: m._id ?? m.userId ?? id };
    }
    return u;
  };

  const openDetails = async (emoji) => {
    setDetailsEmoji(emoji);
    setServerUsers(null);
    try {
      const { data } = await reactionAPI.get(messageId, emoji);
      setServerUsers(data?.users || null);
    } catch {
      setServerUsers(null);
    }
  };

  const rawUserList = (serverUsers && serverUsers.length
    ? serverUsers
    : (details?.users && details.users.length
      ? details.users
      : (details?.userIds || []).map((id) => ({ _id: id })))
  )
    .map(resolveUser)
    .filter(Boolean);

  const sortedUserList = [...rawUserList].sort((a, b) => {
    const aMe = String(a?._id ?? a?.userId) === String(currentUserId);
    const bMe = String(b?._id ?? b?.userId) === String(currentUserId);
    return (bMe ? 1 : 0) - (aMe ? 1 : 0);
  });

  const formattedNamesText = formatReactionUserNames(sortedUserList, currentUserId);
  const currentShortcode = getEmojiShortcode(details?.emoji);

  return (
    <>
      <View style={styles.container}>
        {reactions.map((r) => {
          const hasReacted = r.userIds?.some((id) => String(id) === String(currentUserId));
          return (
            <TouchableOpacity
              key={r.emoji}
              style={[
                styles.pill,
                {
                  backgroundColor: hasReacted
                    ? (colors.primaryLight || 'rgba(18, 100, 163, 0.15)')
                    : (colors.backgroundTertiary || 'rgba(255, 255, 255, 0.06)'),
                  borderColor: hasReacted
                    ? (colors.primary || '#1264a3')
                    : (colors.border || 'rgba(255, 255, 255, 0.12)'),
                },
              ]}
              onPress={() => {
                if (hasReacted) {
                  onRemoveReaction?.(r.emoji);
                  setDetailsEmoji(null);
                } else {
                  onAddReaction?.(r.emoji);
                }
              }}
              onLongPress={() => openDetails(r.emoji)}
              delayLongPress={250}
              activeOpacity={0.7}
            >
              <Text style={styles.emoji}>{r.emoji}</Text>
              <Text style={[styles.count, {
                color: hasReacted ? (colors.primary || '#1264a3') : colors.textSecondary,
                fontWeight: hasReacted ? '700' : '500',
              }]}>
                {r.count}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <AccessibleModal
        visible={!!details}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailsEmoji(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setDetailsEmoji(null)}
        >
          <View style={styles.popupCardContainer}>
            {/* White Square Emoji Box */}
            <View style={styles.emojiCardSquare}>
              <Text style={styles.modalEmojiLarge}>{details?.emoji}</Text>
            </View>

            {/* Formatted Natural User Names */}
            <ScrollView
              style={styles.namesScroll}
              contentContainerStyle={{ alignItems: 'center' }}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.formattedNamesText}>
                {formattedNamesText}
              </Text>
            </ScrollView>

            {/* Subtitle text */}
            <Text style={styles.subtitleText}>
              reacted with :{currentShortcode}:
            </Text>

            {/* Downward Caret Arrow */}
            <View style={styles.caretArrow} />
          </View>
        </TouchableOpacity>
      </AccessibleModal>
    </>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: verticalScale(4),
    gap: scale(5),
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(9),
    paddingVertical: verticalScale(3),
    borderRadius: moderateScale(16),
    borderWidth: 1,
    gap: scale(5),
    minHeight: verticalScale(24),
  },
  emoji: {
    fontSize: moderateScale(13),
  },
  count: {
    fontSize: moderateScale(12),
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: scale(20),
  },
  popupCardContainer: {
    position: 'relative',
    backgroundColor: '#1e1f23',
    borderRadius: moderateScale(16),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
    paddingHorizontal: scale(22),
    paddingTop: verticalScale(20),
    paddingBottom: verticalScale(18),
    alignItems: 'center',
    width: '85%',
    maxWidth: moderateScale(290),
    gap: verticalScale(12),
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
  },
  emojiCardSquare: {
    width: scale(60),
    height: verticalScale(60),
    borderRadius: moderateScale(12),
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  modalEmojiLarge: {
    fontSize: moderateScale(34),
  },
  namesScroll: {
    maxHeight: verticalScale(120),
    width: '100%',
  },
  formattedNamesText: {
    fontSize: moderateScale(14),
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: moderateScale(20),
  },
  subtitleText: {
    fontSize: moderateScale(13),
    fontWeight: '500',
    color: '#38bdf8',
    textAlign: 'center',
  },
  caretArrow: {
    position: 'absolute',
    bottom: verticalScale(-7),
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: scale(7),
    borderRightWidth: scale(7),
    borderTopWidth: verticalScale(7),
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#1e1f23',
  },
});

export default ReactionBar;

