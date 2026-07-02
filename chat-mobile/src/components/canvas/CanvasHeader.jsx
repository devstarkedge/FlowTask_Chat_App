import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { ArrowLeft, MessageSquare, History, MoreVertical, Users } from 'lucide-react-native';
import Avatar from '../Avatar';

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

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.iconBtn}>
        <ArrowLeft size={22} color="#1f2937" />
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

        <TouchableOpacity onPress={onCommentsPress} style={styles.iconBtn}>
          <MessageSquare size={20} color="#4b5563" />
          {commentCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{commentCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={onHistoryPress} style={styles.iconBtn}>
          <History size={20} color="#4b5563" />
        </TouchableOpacity>

        <TouchableOpacity onPress={onOptionsPress} style={styles.iconBtn}>
          <MoreVertical size={20} color="#4b5563" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  iconBtn: {
    padding: 8,
    position: 'relative',
  },
  titleContainer: {
    flex: 1,
    marginLeft: 4,
    marginRight: 8,
  },
  titleTouchable: {
    paddingVertical: 6,
  },
  titleText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  titleInput: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    paddingVertical: 2,
    borderBottomWidth: 1.5,
    borderBottomColor: '#4f46e5',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  presenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarWrapper: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ffffff',
    overflow: 'hidden',
  },
  moreUsersCount: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  moreUsersText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#4b5563',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: 'bold',
  },
});
