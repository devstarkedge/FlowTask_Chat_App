import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useChannelStore } from '../stores/channelStore';
import { MessageSquare, Search } from 'lucide-react-native';

const DMListScreen = ({ navigation }) => {
  const { channels, setActiveChannel } = useChannelStore();
  const dmChannels = channels.filter((ch) => ch.type === 'dm');

  const renderDM = ({ item }) => (
    <TouchableOpacity
      style={styles.dmItem}
      onPress={() => {
        setActiveChannel(item._id);
        navigation.navigate('DirectMessage', { channelId: item._id, name: item.name });
      }}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.name?.substring(0, 1).toUpperCase()}</Text>
        <View style={styles.statusOnline} />
      </View>
      <View style={styles.dmInfo}>
        <Text style={styles.dmName}>{item.name}</Text>
        {item.lastMessagePreview && (
          <Text style={styles.lastMessage} numberOfLines={1}>
            {item.lastMessagePreview}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.searchBar}>
        <Search size={18} color="#9ca3af" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search people..."
          placeholderTextColor="#9ca3af"
        />
      </View>
      <FlatList
        data={dmChannels}
        renderItem={renderDM}
        keyExtractor={(item) => item._id}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MessageSquare size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>No direct messages yet</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  dmItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4b5563',
  },
  statusOnline: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: 'white',
  },
  dmInfo: {
    flex: 1,
  },
  dmName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  lastMessage: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 2,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 15,
    color: '#9ca3af',
    marginTop: 12,
  },
});

export default DMListScreen;
