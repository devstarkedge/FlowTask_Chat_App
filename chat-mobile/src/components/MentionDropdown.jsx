/**
 * MentionDropdown — positioned overlay showing workspace/channel members
 * filtered by @mention query. Matches web app MentionDropdown behavior.
 *
 * Props:
 *   members  – array of member objects { _id, name, email, avatar }
 *   query    – current text after @ trigger
 *   onSelect – (member) => void
 *   onClose  – () => void
 *   colors   – theme colors
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from 'react-native';
import { AppAvatar } from './common';
import { scale, verticalScale, moderateScale } from '../utils/responsive';


const MentionDropdown = React.memo(function MentionDropdown({
  members = [],
  query = '',
  onSelect,
  onClose,
  colors,
}) {
  const filtered = useMemo(() => {
    if (!query) return members.slice(0, 8);
    const q = query.toLowerCase();
    return members
      .filter(m =>
        (m.name || '').toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [members, query]);

  if (filtered.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.cardBackground || colors.background, borderColor: colors.border }]}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item._id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.memberRow, { borderBottomColor: colors.border }]}
            onPress={() => onSelect(item)}
            activeOpacity={0.7}
          >
            <AppAvatar user={item} size={28} showStatus={false} />
            <View style={styles.memberInfo}>
              <Text style={[styles.memberName, { color: colors.textPrimary }]} numberOfLines={1}>
                {item.name || 'Unknown'}
              </Text>
              {item.email ? (
                <Text style={[styles.memberEmail, { color: colors.textTertiary }]} numberOfLines={1}>
                  {item.email}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: '100%',
    left: scale(12),
    right: scale(12),
    maxHeight: verticalScale(220),
    borderRadius: moderateScale(12),
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 100,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: scale(0), height: verticalScale(2) },
  },
  list: {
    maxHeight: verticalScale(220),
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: moderateScale(14),
    fontWeight: '600',
  },
  memberEmail: {
    fontSize: moderateScale(12),
    marginTop: verticalScale(1),
  },
});

export default MentionDropdown;
