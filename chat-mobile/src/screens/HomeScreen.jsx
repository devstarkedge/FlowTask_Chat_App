import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import WorkspaceSwitcher from '../components/WorkspaceSwitcher';
import AccountDrawer from '../components/AccountDrawer';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { useChannelStore } from '../stores/channelStore';
import { useThreadStore } from '../stores/threadStore';
import { useLaterStore } from '../stores/laterStore';
import { useDraftStore } from '../stores/draftStore';
import { useScheduledStore } from '../stores/scheduledStore';
import { connectSocket } from '../services/socket';
import { 
  MessageSquare,
  Bookmark,
  Edit3,
  Clock,
  Hash,
  Lock,
  Volume2,
  ChevronRight,
  ChevronDown,
  Plus,
} from 'lucide-react-native';

const HomeScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const activeWorkspace = useWorkspaceStore(state => state.activeWorkspace);
  const fetchWorkspaces = useWorkspaceStore(state => state.fetchWorkspaces);
  const { user } = useAuthStore();
  const channels = useChannelStore(state => state.channels || []);
  const fetchChannels = useChannelStore(state => state.fetchChannels);
  const unreads = useChannelStore(state => state.unreads || {});
  const unreadThreadCount = useThreadStore(state => state.unreadThreadCount || 0);
  const fetchThreads = useThreadStore(state => state.fetchThreads);
  const savedCount = useLaterStore(state => state.savedCount || 0);
  const fetchSavedMessages = useLaterStore(state => state.fetchSavedMessages);
  const draftCount = useDraftStore(state => state.draftCount || 0);
  const fetchDrafts = useDraftStore(state => state.fetchDrafts);
  const scheduledCount = useScheduledStore(state => state.scheduledCount || 0);
  const fetchScheduledMessages = useScheduledStore(state => state.fetchScheduledMessages);
  
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [workspaceSwitcherVisible, setWorkspaceSwitcherVisible] = useState(false);
  const [accountDrawerVisible, setAccountDrawerVisible] = useState(false);
  const [sectionsExpanded, setSectionsExpanded] = useState({
    system: true,
    public: true,
    private: true,
    dms: true,
  });

  // Safety check for colors
  if (!colors) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  useEffect(() => {
    if (!activeWorkspace?._id) return;
    loadData();
    connectSocket();
  }, [activeWorkspace?._id]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      await Promise.all([
        fetchChannels(),
        fetchThreads?.() || Promise.resolve(),
        fetchSavedMessages?.() || Promise.resolve(),
        fetchDrafts?.(activeWorkspace?._id) || Promise.resolve(),
        fetchScheduledMessages?.() || Promise.resolve(),
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const toggleSection = (section) => {
    setSectionsExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Categorize channels
  const systemChannels = channels.filter(ch => ch.type === 'system');
  const publicChannels = channels.filter(ch => 
    ch.type !== 'dm' && 
    ch.type !== 'system' && 
    ch.visibility !== 'private'
  );
  const privateChannels = channels.filter(ch => 
    ch.type !== 'dm' && 
    ch.type !== 'system' && 
    ch.visibility === 'private'
  );
  const dms = channels.filter(ch => ch.type === 'dm');

  const styles = createStyles(colors);

  const QuickActionCard = ({ icon: Icon, title, count, onPress, color }) => (
    <TouchableOpacity 
      style={[styles.quickCard, { backgroundColor: colors.card }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.quickCardIcon, { backgroundColor: color + '15' }]}>
        <Icon size={20} color={color} strokeWidth={2} />
      </View>
      <Text style={[styles.quickCardTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.quickCardCount, { color: colors.textSecondary }]}>
        {count} {count === 1 ? 'item' : 'items'}
      </Text>
    </TouchableOpacity>
  );

  const ChannelItem = ({ channel }) => {
    const unreadCount = unreads[channel._id] || 0;
    const isDM = channel.type === 'dm';
    const isSystem = channel.type === 'system';
    const isPrivate = channel.visibility === 'private';
    
    return (
      <TouchableOpacity
        style={[styles.channelItem, { backgroundColor: colors.background }]}
        onPress={() => navigation.navigate('Chat', { 
          channelId: channel._id, 
          channelName: channel.name 
        })}
        activeOpacity={0.7}
      >
        <View style={styles.channelIconContainer}>
          {isDM ? (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.backgroundTertiary }]}>
              <Text style={[styles.avatarText, { color: colors.textSecondary }]}>
                {channel.name?.substring(0, 1).toUpperCase()}
              </Text>
              <View style={[styles.statusIndicator, { backgroundColor: colors.online }]} />
            </View>
          ) : isSystem ? (
            <View style={[styles.iconWrapper, { backgroundColor: colors.backgroundTertiary }]}>
              <Volume2 size={16} color={colors.textSecondary} />
            </View>
          ) : isPrivate ? (
            <View style={[styles.iconWrapper, { backgroundColor: colors.backgroundTertiary }]}>
              <Lock size={16} color={colors.textSecondary} />
            </View>
          ) : (
            <Hash size={18} color={colors.textSecondary} />
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
            {channel.name}
          </Text>
          {!!channel.lastMessagePreview && (
            <Text style={[styles.lastMessage, { color: colors.textTertiary }]} numberOfLines={1}>
              {channel.lastMessagePreview}
            </Text>
          )}
        </View>

        {unreadCount > 0 && (
          <View style={[styles.unreadBadge, { backgroundColor: colors.badgeBackground }]}>
            <Text style={[styles.unreadText, { color: colors.badgeText }]}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const SectionHeader = ({ title, count, icon: Icon, section }) => (
    <TouchableOpacity
      style={[styles.sectionHeader, { backgroundColor: colors.background }]}
      onPress={() => toggleSection(section)}
      activeOpacity={0.7}
    >
      {sectionsExpanded[section] ? (
        <ChevronDown size={14} color={colors.textSecondary} />
      ) : (
        <ChevronRight size={14} color={colors.textSecondary} />
      )}
      <Icon size={14} color={colors.textSecondary} />
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.effectiveTheme === 'dark' ? 'light-content' : 'dark-content'} />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity 
          style={styles.workspaceInfo}
          onPress={() => setWorkspaceSwitcherVisible(true)}
          activeOpacity={0.7}
        >
          <View style={[styles.workspaceLogo, { backgroundColor: colors.primary }]}>
            <Text style={[styles.workspaceLogoText, { color: colors.textInverse }]}>
              {activeWorkspace?.name?.substring(0, 1).toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.workspaceName, { color: colors.textPrimary }]} numberOfLines={1}>
            {activeWorkspace?.name}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.iconButton}
          onPress={() => setAccountDrawerVisible(true)}
        >
          <View style={[styles.userAvatar, { backgroundColor: colors.primary }]}>
            <Text style={[styles.userAvatarText, { color: colors.textInverse }]}>
              {user?.name?.substring(0, 1).toUpperCase()}
            </Text>
            <View style={[styles.statusIndicatorSmall, { backgroundColor: colors.online }]} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Workspace Switcher Modal */}
      <WorkspaceSwitcher
        visible={workspaceSwitcherVisible}
        onClose={() => setWorkspaceSwitcherVisible(false)}
        navigation={navigation}
      />

      {/* Account Drawer */}
      <AccountDrawer
        visible={accountDrawerVisible}
        onClose={() => setAccountDrawerVisible(false)}
        navigation={navigation}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Quick Actions */}
        <View style={styles.quickActionsSection}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickActionsScroll}
          >
            <QuickActionCard
              icon={MessageSquare}
              title="Threads"
              count={unreadThreadCount}
              color={colors.primary}
              onPress={() => navigation.navigate('Threads')}
            />
            <QuickActionCard
              icon={Bookmark}
              title="Later"
              count={savedCount}
              color={colors.warning}
              onPress={() => navigation.navigate('Later')}
            />
            <QuickActionCard
              icon={Edit3}
              title="Drafts"
              count={draftCount}
              color={colors.info}
              onPress={() => navigation.navigate('Drafts')}
            />
            <QuickActionCard
              icon={Clock}
              title="Scheduled"
              count={scheduledCount}
              color={colors.success}
              onPress={() => navigation.navigate('Scheduled')}
            />
          </ScrollView>
        </View>

        {/* Channels Section */}
        <View style={styles.channelsSection}>
          {/* System Channels */}
          {systemChannels.length > 0 && (
            <>
              <SectionHeader 
                title="SYSTEM CHANNELS" 
                count={systemChannels.length}
                icon={Volume2}
                section="system"
              />
              {sectionsExpanded.system && systemChannels.map(ch => (
                <ChannelItem key={ch._id} channel={ch} />
              ))}
            </>
          )}

          {/* Public Channels */}
          <SectionHeader 
            title="CHANNELS" 
            count={publicChannels.length}
            icon={Hash}
            section="public"
          />
          {sectionsExpanded.public && publicChannels.map(ch => (
            <ChannelItem key={ch._id} channel={ch} />
          ))}

          {/* Private Channels */}
          {privateChannels.length > 0 && (
            <>
              <SectionHeader 
                title="PRIVATE CHANNELS" 
                count={privateChannels.length}
                icon={Lock}
                section="private"
              />
              {sectionsExpanded.private && privateChannels.map(ch => (
                <ChannelItem key={ch._id} channel={ch} />
              ))}
            </>
          )}

          {/* Direct Messages */}
          <SectionHeader 
            title="DIRECT MESSAGES" 
            count={dms.length}
            icon={MessageSquare}
            section="dms"
          />
          {sectionsExpanded.dms && dms.map(ch => (
            <ChannelItem key={ch._id} channel={ch} />
          ))}
        </View>
      </ScrollView>
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
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  userAvatarText: {
    fontSize: 14,
    fontWeight: '700',
  },
  statusIndicatorSmall: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: 'white',
  },
  quickActionsSection: {
    paddingVertical: 16,
  },
  quickActionsScroll: {
    paddingHorizontal: 8,
    gap: 2,
    borderRadius: 12,
  },
  quickCard: {
    width: 110,
    padding: 5,
    borderRadius: 12,
    gap: 2,
  },
  quickCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickCardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  quickCardCount: {
    fontSize: 13,
  },
  channelsSection: {
    paddingBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontSize: 11,
    fontWeight: '600',
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  channelIconContainer: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  avatarText: {
    fontSize: 13,
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
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  channelInfo: {
    flex: 1,
  },
  channelName: {
    fontSize: 15,
    fontWeight: '500',
  },
  unreadName: {
    fontWeight: '700',
  },
  lastMessage: {
    fontSize: 13,
    marginTop: 2,
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
});

export default HomeScreen;
