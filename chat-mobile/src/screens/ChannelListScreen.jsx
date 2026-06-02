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
} from 'react-native';
import { useChannelStore } from '../stores/channelStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { useThemeStore } from '../stores/themeStore';
import { connectSocket } from '../services/socket';
import { 
  Hash, 
  MessageSquare, 
  Menu,
  Plus, 
  ChevronRight,
  ChevronDown,
  Lock,
  Volume2,
  Users,
} from 'lucide-react-native';

const ChannelListScreen = ({ navigation }) => {
  const { channels, isLoading, fetchChannels, setActiveChannel, unreads } = useChannelStore();
  const { activeWorkspace } = useWorkspaceStore();
  const { user } = useAuthStore();
  const { openDrawer, sectionsExpanded, toggleSection } = useUIStore();
  const { colors } = useThemeStore();

  useEffect(() => {
    fetchChannels();
    connectSocket();
  }, []);

  // Categorize channels
  const dms = channels.filter((ch) => ch.type === 'dm');
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

  const renderChannelItem = ({ item }) => {
    const unreadCount = unreads[item._id] || 0;
    const isDM = item.type === 'dm';
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
          {isDM ? (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.backgroundTertiary }]}>
              <Text style={[styles.avatarText, { color: colors.textSecondary }]}>
                {item.name?.substring(0, 1).toUpperCase()}
              </Text>
              <View style={[styles.statusIndicator, { backgroundColor: colors.online }]} />
            </View>
          ) : isSystem ? (
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
              unreadCount > 0 && styles.unreadName
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
    >{sectionsExpanded[section] ? (<ChevronDown size={16} color={colors.textSecondary} />) : (<ChevronRight size={16} color={colors.textSecondary} />)}<Icon size={16} color={colors.textSecondary} /><Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>{count > 0 && (<Text style={[styles.sectionCount, { color: colors.textTertiary }]}>{count}</Text>)}<TouchableOpacity style={styles.sectionAction}><Plus size={18} color={colors.primary} /></TouchableOpacity></TouchableOpacity>
    );
  };

  const buildListData = () => {
    const data = [];
    
    // Direct Messages
    data.push({ type: 'header', key: 'dms-header', section: 'dms', title: 'DIRECT MESSAGES', count: dms.length, icon: MessageSquare });
    if (sectionsExpanded.dms) {
      dms.forEach(ch => data.push({ type: 'channel', ...ch }));
    }
    
    // System Channels
    if (systemChannels.length > 0) {
      data.push({ type: 'header', key: 'system-header', section: 'system', title: 'SYSTEM CHANNELS', count: systemChannels.length, icon: Volume2 });
      if (sectionsExpanded.system) {
        systemChannels.forEach(ch => data.push({ type: 'channel', ...ch }));
      }
    }
    
    // Public Channels
    data.push({ type: 'header', key: 'public-header', section: 'public', title: 'CHANNELS', count: publicChannels.length, icon: Hash });
    if (sectionsExpanded.public) {
      publicChannels.forEach(ch => data.push({ type: 'channel', ...ch }));
    }
    
    // Private Channels
    if (privateChannels.length > 0) {
      data.push({ type: 'header', key: 'private-header', section: 'private', title: 'PRIVATE CHANNELS', count: privateChannels.length, icon: Lock });
      if (sectionsExpanded.private) {
        privateChannels.forEach(ch => data.push({ type: 'channel', ...ch }));
      }
    }
    
    return data;
  };

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.effectiveTheme === 'dark' ? 'light-content' : 'dark-content'} />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.iconButton} onPress={openDrawer}>
          <Menu size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.workspaceInfo}>
          <View style={[styles.workspaceLogo, { backgroundColor: colors.primary }]}>
            <Text style={[styles.workspaceLogoText, { color: colors.textInverse }]}>
              {activeWorkspace?.name?.substring(0, 1).toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.workspaceName, { color: colors.textPrimary }]} numberOfLines={1}>
            {activeWorkspace?.name}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={buildListData()}
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

const createStyles = (colors) => StyleSheet.create({
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
  workspaceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    justifyContent: 'center',
  },
  workspaceLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  workspaceLogoText: {
    fontWeight: '800',
    fontSize: 16,
  },
  workspaceName: {
    fontSize: 17,
    fontWeight: '700',
  },
  iconButton: {
    padding: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
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
  sectionAction: {
    padding: 4,
  },
  listContainer: {
    paddingBottom: 20,
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  channelIconContainer: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: 'white',
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

export default ChannelListScreen;