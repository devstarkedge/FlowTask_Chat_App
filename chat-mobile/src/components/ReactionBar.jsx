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
  // ─── Hooks must run unconditionally (Rules of Hooks) ─────────────────────
  // All hooks are declared before any early return so the hook count never
  // changes between renders — otherwise React throws "Rendered more hooks
  // than during the previous render" when a message gains/loses reactions.
  const [detailsEmoji, setDetailsEmoji] = useState(null);
  // Server-fetched users who reacted (populated), source of truth for the popup.
  const [serverUsers, setServerUsers] = useState(null);

  const memberById = useMemo(() => {
    const map = new Map();
    (channelMembers || []).forEach((m) => {
      const id = m?._id ?? m?.userId;
      if (id != null) map.set(String(id), m);
    });
    return map;
  }, [channelMembers]);

  // Derive the live reaction from `reactions` each render so the open popup
  // reflects real-time socket updates (adds/removes) without manual refresh.
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

  // Open the details popup and fetch the filtered reaction (users who reacted)
  // from the server, so the list reflects the database, not local stale data.
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
                    ? (colors.primaryLight || colors.primary)
                    : (colors.backgroundTertiary || colors.background),
                  borderColor: hasReacted
                    ? colors.primary
                    : colors.border,
                },
              ]}
              onPress={() => {
                // Only the user who added the reaction may remove it. Other
                // users cannot remove someone else's reaction by tapping the pill.
                if (hasReacted) {
                  onRemoveReaction?.(r.emoji);
                  setDetailsEmoji(null);
                }
              }}
              onLongPress={() => openDetails(r.emoji)}
              delayLongPress={350}
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

      <AccessibleModal
        visible={!!details}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailsEmoji(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card || colors.background }]}>
            {/* Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={styles.modalEmoji}>{details?.emoji}</Text>
              <Text style={[styles.modalCount, { color: colors.textPrimary }]}>
                {details?.count}
              </Text>
              <Text style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => setDetailsEmoji(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Users list */}
            <ScrollView style={{ maxHeight: verticalScale(300) }}>
                            {(() => {
                const list = (serverUsers && serverUsers.length
                  ? serverUsers
                  : (details?.users && details.users.length
                    ? details.users
                    : (details?.userIds || []).map((id) => ({ _id: id })))
                )
                  .map(resolveUser)
                  .filter(Boolean);
                const sorted = [...list].sort((a, b) => {
                  const aMe = String(a?._id ?? a?.userId) === String(currentUserId);
                  const bMe = String(b?._id ?? b?.userId) === String(currentUserId);
                  return (bMe ? 1 : 0) - (aMe ? 1 : 0);
                });
                if (sorted.length === 0) {
                  return (
                    <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No reactions</Text>
                  );
                }
                return sorted.map((u, i) => {
                  const isMe = String(u?._id ?? u?.userId) === String(currentUserId);
                  const name = isMe
                    ? 'You'
                    : (u?.name || u?.displayName || (u?.email ? u.email.split('@')[0] : '') || 'Unknown user');
                  return (
                    <View key={String(u?._id ?? u?.userId) || `${name}-${i}`} style={styles.userRow}>
                      <AppAvatar member={u} size={32} />
                      <Text
                        numberOfLines={1}
                        style={[styles.userName, {
                          color: colors.textPrimary,
                          fontWeight: isMe ? '700' : '500',
                        }]}
                      >
                        {name}
                      </Text>
                      {isMe && (
                        <Text style={[styles.youTag, { color: colors.primary }]}>you</Text>
                      )}
                    </View>
                  );
                });
              })()}
            </ScrollView>

            {/* Footer — preserves add/remove */}
            <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
              {/* <TouchableOpacity
                style={[styles.footerBtn, { backgroundColor: colors.backgroundTertiary || colors.background, borderColor: colors.border }]}
                activeOpacity={0.7}
                onPress={() => {
                  const emoji = details?.emoji;
                  const hasReacted = details?.userIds?.some((id) => String(id) === String(currentUserId));
                  if (hasReacted) onRemoveReaction?.(emoji);
                  else onAddReaction?.(emoji);
                  setDetailsEmoji(null);
                }}
              >
                <Text style={[styles.footerBtnText, { color: colors.textPrimary }]}>
                  {details?.userIds?.some((id) => String(id) === String(currentUserId))}
                </Text>
              </TouchableOpacity> */}
              <TouchableOpacity
                style={[styles.addIconBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                activeOpacity={0.7}
                onPress={() => {
                  setDetailsEmoji(null);
                  onOpenPicker?.();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <SmilePlus size={18} color={colors.textOnPrimary || '#fff'} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: scale(20),
  },
  modalCard: {
    width: '100%',
    maxWidth: moderateScale(360),
    borderRadius: moderateScale(14),
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(12),
    borderBottomWidth: 1,
  },
  modalEmoji: {
    fontSize: moderateScale(22),
  },
  modalCount: {
    fontSize: moderateScale(16),
    fontWeight: '700',
  },
  emptyText: {
    fontSize: moderateScale(14),
    textAlign: 'center',
    paddingVertical: verticalScale(24),
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(8),
  },
  userName: {
    fontSize: moderateScale(15),
    flex: 1,
  },
  youTag: {
    fontSize: moderateScale(12),
    fontWeight: '600',
    textTransform: 'lowercase',
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(10),
    borderTopWidth: 1,
  },
  footerBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: verticalScale(9),
    borderRadius: moderateScale(9),
    borderWidth: 1,
  },
  footerBtnText: {
    fontSize: moderateScale(14),
    fontWeight: '600',
  },
  addIconBtn: {
    width: scale(38),
    height: verticalScale(36),
    borderRadius: moderateScale(18),
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ReactionBar;
