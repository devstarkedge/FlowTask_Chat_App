import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StatusBar,
  ScrollView,
} from 'react-native';
import { useChannelStore } from '../stores/channelStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { useThemeStore } from '../stores/themeStore';
import { connectSocket } from '../services/socket';
import {
  Menu,
  MessageSquare,
  Bookmark,
  PenTool,
  Clock,
  Hash,
  Lock,
  Volume2,
  ChevronRight,
  ChevronDown,
} from 'lucide-react-native';

const HomeScreen = ({ navigation }) => {
  const { channels, isLoading, fetchChannels, setActiveChannel, unreads } = useChannelStore();
  const { activeWorkspace } = useWorkspaceStore();
  const { user } = useAuthStore();
  const { openDrawer, sectionsExpanded, toggleSection } = useUIStore();
  const { colors } = useThemeStore();

  useEffect(() => {
    fetchChannels();
    connectSocket();
  }, []);

  // Quick access data
  const quickAccessItems = [
    { id: 'threads', label: 'Threads', icon: MessageSquare, count: 0 },
    { id: 'later', label: 'Later', icon: Bookmark, count: 6 },
    { id: 'drafts', label: 'Drafts', icon: PenTool, count: 0 },
  ];

  // Categorize channels
  const systemChannels = channels.filter((ch) => ch.type === 'system');
  const publicChannels = channels.filter((ch) =>
    ch.type !== 'dm' &&
    ch.type !== 'system' &&
    (ch.type === 'public' || ch.type === 'project' || ch.type === 'department' || ch.type === 'team') &&
    ch.visibility !== 'private'
  );
  const privateChannels = channels.filter((ch) =>
    ch.type !== 'dm' &&
    ch.type !== 'system' &&
    (ch.visibility === 'private' || ch.type === 'private')
  );

  const renderQuickAccessCard = ({ item }) => {
    const Icon = item.icon;
    return (
      <TouchableOpacity
        style={[styles.quickAccessCard, { backgroundColor: colors.channel, borderColor: colors.border }]}
        onPress={() => {
          if (item.id === 'threads') navigation.navigate('Threads');
          else if (item.id === 'later') navigation.navigate('Later');
          else if (item.id === 'drafts') navigation.navigate('Drafts');
        }}
        activeOpacity={0.6}
      >
        <View style={[styles.quickAccessIconContainer, { backgroundColor: colors.backgroundTertiary }]}>
          <Icon size={24} color={colors.primary} />
        </View>
        <Text style={[styles.quickAccessLabel, { color: colors.textPrimary }]}>
          {item.label}
        </Text>
        <Text style={[styles.quickAccessCount, { color: colors.textTertiary }]}>
          {item.count} {item.count === 1 ? 'item' : 'items'}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderChannelItem = ({ item }) => {
    const unreadCount = unreads[item._id] || 0;
    const isSystem = item.type === 'system';
    const isPrivate = item.visibility === 'private' || item.type === 'private';

    return (
      <TouchableOpacity
        style={[styles.channelItem, { backgroundColor: colors.channel }]}
        onPress={() => {
          setActiveChannel(item._id);
          navigation.navigate('Chat', { channelId: item._id, channelName: item.name });
        }}
        activeOpacity={0.7}
      >
        <View style={styles.channelIconContainer}>
          {isSystem ? (
            <View style={[styles.iconWrapper, { backgroundColor: colors.backgroundTertiary }]}>
              <Volume2 size={18} color={colors.textSecondary} />
            </View>
          ) : isPrivate ? (
            <View style={[styles.iconWrapper, { backgroundColor: colors.backgroundTertiary }]}>
              <Lock size={18} color={colors.textSecondary} />
            </View>
          ) : (
            <Hash size={20} color={colors.textSecondary} />
          )}
        </View>

        <View style={styles.channelInfo}>
          <Text
            style={[
              styles.channelName,
              { color: unreadCount > 0 ? colors.textPrimary : colors.textSecondary },
              unreadCount > 0 && styles.unreadName,
            ]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          {!!item.lastMessagePreview && (
            <Text style={[styles.lastMessage, { color: colors.textTertiary }]} numberOfLines={1}>
              {item.lastMessagePreview}
            </Text>
          )}
        </View>

        <View style={styles.channelRight}>
          {unreadCount > 0 && (
            <View style={[styles.unreadBadge, { backgroundColor: colors.badgeBackground }]}>
              <Text style={[styles.unreadText, { color: colors.badgeText }]}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
          <ChevronRight size={16} color={colors.border} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = (title, section, count, icon) => {
    const Icon = icon;
    return (
      <TouchableOpacity
        style={[styles.sectionHeader, { backgroundColor: colors.background }]}
        onPress={() => toggleSection(section)}
        activeOpacity={0.7}
      >
        {sectionsExpanded[section] ? (
          <ChevronDown size={16} color={colors.textSecondary} />
        ) : (
          <ChevronRight size={16} color={colors.textSecondary} />
        )}
        <Icon size={16} color={colors.textSecondary} />
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          {title}
        </Text>
        {count > 0 && (
          <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>
            {count}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const buildChannelListData = () => {
    const data = [];

    // System Channels
    if (systemChannels.length > 0) {
      data.push({
        type: 'header',
        key: 'system-header',
        section: 'system',
        title: 'SYSTEM CHANNELS',
        count: systemChannels.length,
        icon: Volume2,
      });
      if (sectionsExpanded.system !== false) {
        systemChannels.forEach((ch) => data.push({ type: 'channel', ...ch }));
      }
    }

    // Public Channels
    if (publicChannels.length > 0) {
      data.push({
        type: 'header',
        key: 'public-header',
        section: 'public',
        title: 'CHANNELS',
        count: publicChannels.length,
        icon: Hash,
      });
      if (sectionsExpanded.public !== false) {
        publicChannels.forEach((ch) => data.push({ type: 'channel', ...ch }));
      }
    }

    // Private Channels
    if (privateChannels.length > 0) {
      data.push({
        type: 'header',
        key: 'private-header',
        section: 'private',
        title: 'PRIVATE CHANNELS',
        count: privateChannels.length,
        icon: Lock,
      });
      if (sectionsExpanded.private !== false) {
        privateChannels.forEach((ch) => data.push({ type: 'channel', ...ch }));
      }
    }

    return data;
  };

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={colors.effectiveTheme === 'dark' ? 'light-content' : 'dark-content'}
      />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.iconButton} onPress={openDrawer}>
          <Menu size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          FlowTask
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={buildChannelListData()}
          ListHeaderComponent={
            <View style={styles.quickAccessContainer}>
              <FlatList
                data={quickAccessItems}
                renderItem={renderQuickAccessCard}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickAccessList}
              />
            </View>
          }
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return renderSectionHeader(item.title, item.section, item.count, item.icon);
            }
            return renderChannelItem({ item });
          }}
          keyExtractor={(item) => item.key || item._id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
    },
    iconButton: {
      padding: 8,
    },
    quickAccessContainer: {
      paddingVertical: 8,
    },
    quickAccessList: {
      paddingHorizontal: 16,
      gap: 2,
    },
    quickAccessCard: {
      width: 100,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
    },
    quickAccessIconContainer: {
      width: 48,
      height: 48,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    quickAccessLabel: {
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
    quickAccessCount: {
      fontSize: 12,
      textAlign: 'center',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 6,
      gap: 8,
    },
    sectionTitle: {
      flex: 1,
      fontSize: 13,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    sectionCount: {
      fontSize: 12,
      fontWeight: '600',
    },
    listContainer: {
      paddingBottom: 20,
    },
    channelItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 8,
    },
    channelIconContainer: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconWrapper: {
      width: 36,
      height: 36,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    channelInfo: {
      flex: 1,
    },
    channelName: {
      fontSize: 16,
      fontWeight: '500',
    },
    unreadName: {
      fontWeight: '700',
    },
    lastMessage: {
      fontSize: 13,
      marginTop: 2,
    },
    channelRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    unreadBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      minWidth: 20,
      alignItems: 'center',
    },
    unreadText: {
      fontSize: 11,
      fontWeight: '700',
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 40,
    },
  });

export default HomeScreen;