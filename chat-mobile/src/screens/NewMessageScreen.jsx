import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  SectionList,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../stores/themeStore';
import { useChannelStore } from '../stores/channelStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useAuthStore } from '../stores/authStore';
import { workspaceAPI } from '../services/api';
import logger from '../utils/logger';
import { useNewMessageSearch } from '../hooks/useNewMessageSearch';
import { AppAvatar , HeaderBackButton } from '../components/common';
import { X, Hash, Lock, Volume2, Search } from 'lucide-react-native';
import { scale, verticalScale, moderateScale } from '../utils/responsive';


// ─── Channel List Item ──────────────────────────────────────────────────────

const ChannelListItem = React.memo(({ channel, onPress, colors }) => {
  const isPrivate = channel.visibility === 'private';
  const isSystem = channel.type === 'system';
  const Icon = isSystem ? Volume2 : isPrivate ? Lock : Hash;

  return (
    <TouchableOpacity
      style={styles.listItem}
      onPress={() => onPress(channel)}
      activeOpacity={0.6}
    >
      <View style={[styles.iconContainer, { backgroundColor: colors.backgroundTertiary }]}>
        <Icon size={18} color={colors.textSecondary} strokeWidth={1.5} />
      </View>
      <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>
        {channel.name}
      </Text>
    </TouchableOpacity>
  );
});

// ─── DM List Item ───────────────────────────────────────────────────────────

const DMListItem = React.memo(({ channel, onPress, colors }) => {
  const dmUser = {
    _id: channel.dmRecipientId,
    name: channel.name,
    avatar: channel.avatar,
    onlineStatus: channel.onlineStatus || 'offline',
  };

  return (
    <TouchableOpacity
      style={styles.listItem}
      onPress={() => onPress(channel)}
      activeOpacity={0.6}
    >
      <AppAvatar user={dmUser} size={36} showStatus statusSize={10} />
      <View style={styles.dmInfo}>
        <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>
          {dmUser.name}
        </Text>
        {channel.lastMessagePreview && (
          <Text style={[styles.dmPreview, { color: colors.textTertiary }]} numberOfLines={1}>
            {channel.lastMessagePreview}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
});

// ─── User List Item ─────────────────────────────────────────────────────────

const UserListItem = React.memo(({ user, onPress, colors }) => {
  return (
    <TouchableOpacity
      style={styles.listItem}
      onPress={() => onPress(user)}
      activeOpacity={0.6}
    >
      <AppAvatar user={user} size={36} showStatus statusSize={10} />
      <View style={styles.dmInfo}>
        <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>
          {user.name}
        </Text>
        <Text style={[styles.dmPreview, { color: colors.textTertiary }]} numberOfLines={1}>
          {user.email}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

// ─── Section Header ─────────────────────────────────────────────────────────

const SectionHeader = React.memo(({ title, colors }) => (
  <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
    <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>{title}</Text>
  </View>
));

// ─── Main Component ─────────────────────────────────────────────────────────

const NewMessageScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const channels = useChannelStore(s => s.channels) || [];
  const setActiveChannel = useChannelStore(s => s.setActiveChannel);
  const { createDM } = useChannelStore();
  const { user: currentUser } = useAuthStore();
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId);
  const [searchQuery, setSearchQuery] = useState('');

  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!activeWorkspaceId) return;
    
    setLoadingUsers(true);
    try {
      const { data } = await workspaceAPI.getMembers(activeWorkspaceId, { limit: 1000 });
      const fetchedData = data?.data || data;
      let members = [];
      if (Array.isArray(fetchedData)) {
        members = fetchedData;
      } else if (fetchedData?.members && Array.isArray(fetchedData.members)) {
        members = fetchedData.members;
      }
      
      const normalizedUsers = members.map(m => {
        if (m.userId && typeof m.userId === 'object') {
          return { ...m.userId, membershipRole: m.role };
        }
        return m;
      }).filter(u => Boolean(u && u.name));
      setUsers(normalizedUsers);
    } catch (e) {
      logger.error("Failed to fetch workspace members:", e);
    } finally {
      setLoadingUsers(false);
    }
  }, [activeWorkspaceId]);

  React.useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const { recent, channels: channelResults, dms: dmResults, filtered } = useNewMessageSearch(
    channels,
    searchQuery
  );

  const userResults = useMemo(() => {
    let res = users.filter((u) => u._id !== currentUser?._id);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      res = res.filter((u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
    }
    return res;
  }, [users, searchQuery, currentUser]);

  const handleChannelPress = useCallback(
    (channel) => {
      if (channel.type === 'dm') {
        setActiveChannel(channel._id);
      }
      navigation.replace('Chat', {
        channelId: channel._id,
        channelName: channel.name,
      });
    },
    [navigation, setActiveChannel]
  );

  const handleUserPress = useCallback(async (targetUser) => {
    try {
      const result = await createDM(targetUser._id);
      navigation.replace("Chat", { channelId: result._id, channelName: result.name });
    } catch (e) {
      logger.error("Create DM error:", e);
    }
  }, [createDM, navigation]);

  // Build sections
  const sections = useMemo(() => {
    const result = [];
    
    if (!filtered && recent.length > 0) {
      result.push({ title: 'Recent', data: recent, type: 'dm' });
    }
    
    if (channelResults.length > 0) {
      result.push({ title: 'Channels', data: channelResults, type: 'channel' });
    }
    
    if (dmResults.length > 0) {
      result.push({ title: 'Direct Messages', data: dmResults, type: 'dm' });
    }

    if (userResults.length > 0) {
      result.push({ title: `People (${userResults.length})`, data: userResults, type: 'user' });
    }

    return result;
  }, [filtered, recent, channelResults, dmResults, userResults]);

  const renderItem = useCallback(
    ({ item, section }) => {
      if (section.type === 'user') {
        return <UserListItem user={item} onPress={handleUserPress} colors={colors} />;
      }
      if (section.type === 'dm') {
        return <DMListItem channel={item} onPress={handleChannelPress} colors={colors} />;
      }
      return <ChannelListItem channel={item} onPress={handleChannelPress} colors={colors} />;
    },
    [handleChannelPress, handleUserPress, colors]
  );

  const renderSectionHeader = useCallback(
    ({ section }) => <SectionHeader title={section.title} colors={colors} />,
    [colors]
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: verticalScale(10), bottom: verticalScale(10), left: scale(10), right: scale(10) }}
        >
          <X size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>New Message</Text>
        <View style={{ width: scale(24) }} />
      </View>

      {/* Search Input */}
      <View style={[styles.searchContainer, { backgroundColor: colors.backgroundSecondary }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.inputBackground }]}>
          <Search size={16} color={colors.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search channels and people"
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: verticalScale(8), bottom: verticalScale(8), left: scale(8), right: scale(8) }}
            >
              <X size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Results */}
      {sections.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
            {filtered ? 'No results found' : 'No channels or messages'}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          initialNumToRender={20}
          maxToRenderPerBatch={10}
          windowSize={11}
          removeClippedSubviews={Platform.OS !== 'web'}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: moderateScale(18),
    fontWeight: '700',
  },
  searchContainer: {
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(8),
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: moderateScale(16),
    padding: moderateScale(0),
  },
  listContent: {
    paddingBottom: verticalScale(20),
  },
  sectionHeader: {
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(16),
    paddingBottom: verticalScale(8),
  },
  sectionTitle: {
    fontSize: moderateScale(13),
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(10),
    gap: 12,
  },
  iconContainer: {
    width: scale(36),
    height: verticalScale(36),
    borderRadius: moderateScale(8),
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemName: {
    fontSize: moderateScale(16),
    fontWeight: '500',
    flex: 1,
  },
  dmInfo: {
    flex: 1,
    gap: 2,
  },
  dmPreview: {
    fontSize: moderateScale(13),
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(40),
  },
  emptyText: {
    fontSize: moderateScale(15),
    textAlign: 'center',
  },
});

export default NewMessageScreen;
