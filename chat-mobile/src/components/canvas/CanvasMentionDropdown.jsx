import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from 'react-native';
import Avatar from '../Avatar';

export default function CanvasMentionDropdown({
  type = 'user', // 'user' or 'channel'
  items = [],
  query = '',
  onSelect,
}) {
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return items
      .filter((item) => {
        const field = type === 'user' ? item.name : item.title;
        return (field || '').toLowerCase().includes(q);
      })
      .slice(0, 8);
  }, [items, query, type]);

  if (filtered.length === 0) return null;

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item._id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.itemRow}
            onPress={() => onSelect(item)}
            activeOpacity={0.7}
          >
            {type === 'user' ? (
              <>
                <Avatar userId={item._id} size={28} />
                <View style={styles.textContainer}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.name || 'Unknown User'}
                  </Text>
                  {item.email && (
                    <Text style={styles.itemSubtext} numberOfLines={1}>
                      {item.email}
                    </Text>
                  )}
                </View>
              </>
            ) : (
              <View style={styles.channelRow}>
                <Text style={styles.hash}>#</Text>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.title || 'channel'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 50,
    left: 12,
    right: 12,
    maxHeight: 200,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    zIndex: 1000,
    elevation: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
  },
  textContainer: {
    marginLeft: 10,
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  itemSubtext: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 1,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hash: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6b7280',
    marginRight: 8,
  },
});
