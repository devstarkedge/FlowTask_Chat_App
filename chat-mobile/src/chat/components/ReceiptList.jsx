import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import Avatar from '../../components/Avatar';

export const ReceiptList = ({ data, timeKey, title }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>{title} ({data.length})</Text>
      <FlatList
        data={data}
        keyExtractor={(item) => item.userId}
        renderItem={({ item }) => (
          <View style={styles.memberRow}>
            <Avatar user={item} size={36} />
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{item.name}</Text>
              {item[timeKey] && (
                <Text style={styles.timeText}>
                  {new Date(item[timeKey]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#8a8f9d',
    marginBottom: 8,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f0f0f2',
  },
  memberInfo: {
    marginLeft: 12,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memberName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1a1d21',
  },
  timeText: {
    fontSize: 12,
    color: '#8a8f9d',
  },
});

export default ReceiptList;
