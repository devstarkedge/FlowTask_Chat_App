import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { ArrowLeft, MessageSquare, History, Users } from 'lucide-react-native';
import Avatar from '../Avatar';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';
import { useThemeStore } from '../../stores/themeStore';

export default function CanvasHeader({
  title,
  presence = [],
  commentCount = 0,
  onBack,
  onTitleChange,
  onHistoryPress,
  onCommentsPress,
  onOptionsPress,
}) {
  const { colors } = useThemeStore();
  const [isEditing, setIsEditing] = useState(false);
  const [tempTitle, setTempTitle] = useState(title);

  const handleBlur = () => {
    setIsEditing(false);
    if (tempTitle.trim() && tempTitle !== title) {
      onTitleChange(tempTitle.trim());
    } else {
      setTempTitle(title);
    }
  };

  React.useEffect(() => {
    setTempTitle(title);
  }, [title]);

  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.iconBtn}>
        <ArrowLeft size={22} color={colors.textPrimary} />
      </TouchableOpacity>

      <View style={styles.titleContainer}>
        {isEditing ? (
          <TextInput
            style={styles.titleInput}
            value={tempTitle}
            onChangeText={setTempTitle}
            onBlur={handleBlur}
            autoFocus
            maxLength={60}
            returnKeyType="done"
            cursorColor={colors.primary}
          />
        ) : (
          <TouchableOpacity onPress={() => setIsEditing(true)} activeOpacity={0.7} style={styles.titleTouchable}>
            <Text style={styles.titleText} numberOfLines={1}>
              {title || 'Untitled Canvas'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.actions}>
        {/* Presence Avatars */}
        {presence.length > 0 && (
          <View style={styles.presenceContainer}>
            {presence.slice(0, 3).map((user, index) => (
              <View
                key={user._id}
                style={[
                  styles.avatarWrapper,
                  { marginLeft: index > 0 ? -10 : 0, zIndex: 10 - index },
                ]}
              >
                <Avatar userId={user._id} size={24} />
              </View>
            ))}
            {presence.length > 3 && (
              <View style={[styles.avatarWrapper, styles.moreUsersCount, { marginLeft: -10 }]}>
                <Text style={styles.moreUsersText}>+{presence.length - 3}</Text>
              </View>
            )}
          </View>
        )}

        {/* History Button */}
        {/* <TouchableOpacity onPress={onHistoryPress} style={styles.actionPill}>
          <History size={16} color={colors.textSecondary} />
        </TouchableOpacity> */}

        {/* Comments Button */}
        {/* <TouchableOpacity onPress={onCommentsPress} style={styles.actionPill}>
          <MessageSquare size={16} color={colors.textSecondary} />
          {commentCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{commentCount}</Text>
            </View>
          )}
        </TouchableOpacity> */}

        {/* Share Button */}
        <TouchableOpacity onPress={onOptionsPress} style={styles.shareBtn}>
          <Users size={16} color={colors.textOnPrimary || '#ffffff'} />
          <Text style={styles.shareText}>Share</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    height: verticalScale(56),
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(8),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  iconBtn: {
    padding: moderateScale(8),
    position: 'relative',
  },
  titleContainer: {
    flex: 1,
    marginLeft: scale(4),
    marginRight: scale(8),
  },
  titleTouchable: {
    paddingVertical: verticalScale(6),
  },
  titleText: {
    fontSize: moderateScale(18),
    fontWeight: '700',
    color: colors.textPrimary,
  },
  titleInput: {
    fontSize: moderateScale(18),
    fontWeight: '700',
    color: colors.textPrimary,
    paddingVertical: verticalScale(2),
    borderBottomWidth: 1.5,
    borderBottomColor: colors.primary,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
  },
  presenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: scale(4),
  },
  avatarWrapper: {
    borderRadius: moderateScale(12),
    borderWidth: 2,
    borderColor: colors.background,
    overflow: 'hidden',
  },
  moreUsersCount: {
    width: scale(24),
    height: verticalScale(24),
    borderRadius: moderateScale(12),
    backgroundColor: colors.surfaceHover,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  moreUsersText: {
    fontSize: moderateScale(9),
    fontWeight: 'bold',
    color: colors.textSecondary,
  },
  actionPill: {
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(16),
    backgroundColor: colors.surfaceHover || '#f3f4f6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(16),
    gap: scale(4),
    marginLeft: scale(4),
  },
  shareText: {
    color: colors.textOnPrimary || '#ffffff',
    fontSize: moderateScale(13),
    fontWeight: '600',
  },
  badge: {
    position: 'absolute',
    top: -verticalScale(4),
    right: -scale(4),
    backgroundColor: colors.notification || '#ef4444',
    borderRadius: moderateScale(10),
    minWidth: scale(18),
    height: verticalScale(18),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(4),
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: moderateScale(9),
    fontWeight: 'bold',
  },
});
