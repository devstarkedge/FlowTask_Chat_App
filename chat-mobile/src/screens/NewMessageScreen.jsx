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
import { useNewMessageSearch } from '../hooks/useNewMessageSearch';
import { AppAvatar } from '../components/common';
import { X, Hash, Lock, Volume2, Search } from 'lucide-react-native';

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
  const [searchQuery, setSearchQuery] = useState('');

  const { recent, channels: channelResults, dms: dmResults, filtered } = useNewMessageSearch(
    channels,
    searchQuery
  );

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

    return result;
  }, [filtered, recent, channelResults, dmResults]);

  const renderItem = useCallback(
    ({ item, section }) => {
      if (section.type === 'dm') {
        return <DMListItem channel={item} onPress={handleChannelPress} colors={colors} />;
      }
      return <ChannelListItem channel={item} onPress={handleChannelPress} colors={colors} />;
    },
    [handleChannelPress, colors]
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
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <X size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>New Message</Text>
        <View style={{ width: 24 }} />
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
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  listContent: {
    paddingBottom: 20,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemName: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  dmInfo: {
    flex: 1,
    gap: 2,
  },
  dmPreview: {
    fontSize: 13,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
  },
});

export default NewMessageScreen;
