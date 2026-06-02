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
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import Avatar from '../components/Avatar';
import { MessageSquare, Search } from 'lucide-react-native';

const DMListScreen = ({ navigation }) => {
  const { channels, setActiveChannel } = useChannelStore();
  const { user } = useAuthStore();
  const { colors } = useThemeStore();
  const dmChannels = channels.filter((ch) => ch.type === 'dm');

  const renderDM = ({ item }) => {
    // Get DM user from channel members
    const dmUser = item.members?.find(m => m._id !== user?._id) || { name: item.name };
    
    return (
      <TouchableOpacity
        style={[styles.dmItem, { backgroundColor: colors.background }]}
        onPress={() => {
          setActiveChannel(item._id);
          navigation.navigate('DirectMessage', { channelId: item._id, name: item.name });
        }}
      >
        <Avatar 
          user={dmUser}
          size={44}
          showStatus={true}
        />
        <View style={styles.dmInfo}>
          <Text style={[styles.dmName, { color: colors.textPrimary }]}>{dmUser.name || item.name}</Text>
          {item.lastMessagePreview && (
            <Text style={[styles.lastMessage, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.lastMessagePreview}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.searchBar, { backgroundColor: colors.inputBackground }]}>
        <Search size={18} color={colors.inputPlaceholder} />
        <TextInput
          style={[styles.searchInput, { color: colors.inputText }]}
          placeholder="Search people..."
          placeholderTextColor={colors.inputPlaceholder}
        />
      </View>
      <FlatList
        data={dmChannels}
        renderItem={renderDM}
        keyExtractor={(item) => item._id}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MessageSquare size={48} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No direct messages yet</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  dmItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  dmInfo: {
    flex: 1,
  },
  dmName: {
    fontSize: 16,
    fontWeight: '600',
  },
  lastMessage: {
    fontSize: 13,
    marginTop: 2,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 15,
    marginTop: 12,
  },
});

export default DMListScreen;
