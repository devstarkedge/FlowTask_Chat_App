import React, { useCallback, useMemo, useState } from "react";
import { scale, verticalScale, moderateScale } from '../utils/responsive';

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Platform,
} from "react-native";
import { AppAvatar, AppScreen, FAB } from "../components/common";
import AccountDrawer from "../components/AccountDrawer";
import CreateNewBottomSheet from "../components/CreateNewBottomSheet";
import { SafeAreaView } from "react-native-safe-area-context";
import { useChannelStore } from "../stores/channelStore";
import { useAuthStore } from "../stores/authStore";
import { useUIStore } from "../stores/uiStore";
import { useThemeStore } from "../stores/themeStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { directoriesAPI } from "../services/api";
import {
  Edit3,
  Search,
  X,
  Plus,
  MessageSquare,
  Building2,
  CheckSquare
} from "lucide-react-native";
import logger from '../utils/logger';
import { formatRelativeTime } from '../utils/dateUtils';

import DMListItem from "../components/DMListItem";

// ─── DM Item (Slack mobile: avatar + name + preview + time, flat) ────────────

const DMItem = React.memo(({ channel, onPress, isSelf }) => {
  const { colors } = useThemeStore();
  const unreads = useChannelStore((s) => s.unreads) || {};
  const unreadCount = unreads[channel._id] || 0;
  const currentUser = useAuthStore((s) => s.user);
  const members = useWorkspaceStore((s) => s.members) || [];
  const liveMember = members.find(m => m._id === channel.dmRecipientId || m.userId?._id === channel.dmRecipientId);
  const liveOnlineStatus = liveMember?.onlineStatus || liveMember?.userId?.onlineStatus || channel.onlineStatus || 'offline';

  const displayName = React.useMemo(() => {
    if (isSelf) return "You";
    if (channel.dmRecipientName) return channel.dmRecipientName;
    if (channel.name) {
      const parts = channel.name.split(',').map(p => p.trim());
      if (parts.length === 2) {
        const other = parts.find(p => p.toLowerCase() !== currentUser?.name?.toLowerCase());
        if (other) return other;
      }
    }
    return channel.name || "Direct Message";
  }, [channel, currentUser, isSelf]);

  const dmUser = {
    ...channel,
    _id: channel.dmRecipientId,
    name: displayName,
    avatar: channel.avatar,
    onlineStatus: liveOnlineStatus,
  };

  return (
    <DMListItem 
      channel={{ ...channel, name: displayName, avatar: channel.avatar }}
      onPress={onPress}
      unreadCount={unreadCount}
    />
  );
});

const dmItem = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(10),
    gap: 12,
  },
  textCol: {
    flex: 1,
    gap: 4,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  name: {
    fontSize: moderateScale(15),
    flex: 1,
  },
  time: {
    fontSize: moderateScale(11),
    marginLeft: scale(8),
  },
  preview: {
    fontSize: moderateScale(13),
    lineHeight: moderateScale(20),
  },
  badge: {
    minWidth: scale(18),
    height: scale(18),
    borderRadius: moderateScale(9),
    paddingHorizontal: scale(5),
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: moderateScale(11),
    fontWeight: "700",
  },
});

// NewDMModal has been removed in favor of the shared CreateNewBottomSheet

// ─── Main Component ──────────────────────────────────────────────────────────

const DMListScreen = ({ navigation }) => {
  if (!navigation) navigation = { navigate: () => {} };

  const { colors, effectiveTheme } = useThemeStore();
  const { openDrawer } = useUIStore();
  const channels = useChannelStore((s) => s.channels) || [];
  const unreads = useChannelStore((s) => s.unreads) || {};
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const { user: currentUser } = useAuthStore();

  const [createNewVisible, setCreateNewVisible] = useState(false);
  const [accountDrawerVisible, setAccountDrawerVisible] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  const dmChannels = useMemo(() => {
    let dms = channels.filter((c) => c.type === "dm");
    
    if (activeFilter === "unreads") {
      dms = dms.filter(c => (unreads[c._id] || 0) > 0);
    } else if (activeFilter === "external") {
      // Assuming external means they are not in our primary domain or there's an isExternal flag
      dms = dms.filter(c => c.isExternal);
    }

    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      dms = dms.filter((c) => c.name?.toLowerCase().includes(q));
    }
    
    dms.sort((a, b) => {
      const aTime = new Date(a.lastMessageAt || a.lastMessage?.createdAt || 0).getTime();
      const bTime = new Date(b.lastMessageAt || b.lastMessage?.createdAt || 0).getTime();
      return bTime - aTime;
    });
    
    return dms;
  }, [channels, filterQuery, activeFilter, unreads]);

  const handlePress = useCallback(
    (channel) => {
      setActiveChannel(channel._id);
      navigation.navigate("Chat", { channelId: channel._id, channelName: channel.name });
    },
    [navigation, setActiveChannel]
  );

  const renderItem = useCallback(
    ({ item }) => {
      const isSelf = item.dmRecipientId === currentUser?._id;
      return <DMItem channel={item} onPress={handlePress} isSelf={isSelf} />;
    },
    [handlePress, currentUser]
  );

  const renderRecentItem = useCallback(
    ({ item }) => {
      const isSelf = item.dmRecipientId === currentUser?._id;
      let displayName = item.dmRecipientName || item.name || "User";
      const members = useWorkspaceStore.getState().members || [];
      const liveMember = members.find(m => m._id === item.dmRecipientId || m.userId?._id === item.dmRecipientId);
      const liveOnlineStatus = liveMember?.onlineStatus || liveMember?.userId?.onlineStatus || item.onlineStatus || 'offline';
      if (isSelf) displayName = "You";
      // Get first name
      const firstName = displayName.split(' ')[0];
      
      const dmUser = {
        ...item,
        _id: item.dmRecipientId,
        name: displayName,
        avatar: item.avatar,
        onlineStatus: liveOnlineStatus,
      };

      return (
        <TouchableOpacity style={styles.recentItem} onPress={() => handlePress(item)}>
          <AppAvatar user={dmUser} size={64} showStatus={true} statusSize={14} style={{ borderRadius: moderateScale(18) }} />
          <Text style={[styles.recentName, { color: colors.textPrimary }]} numberOfLines={1}>{firstName}</Text>
        </TouchableOpacity>
      );
    },
    [handlePress, currentUser, colors.textPrimary]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header Area */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <SafeAreaView edges={['top']} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: scale(16), paddingBottom: verticalScale(12), paddingTop: verticalScale(12) }}>
          <Text style={[styles.title, { color: '#ffffff' }]}>DMs</Text>
          <TouchableOpacity onPress={() => setAccountDrawerVisible(true)}>
            <AppAvatar user={currentUser} size={30} showStatus={true} statusSize={8} />
          </TouchableOpacity>
        </SafeAreaView>
      </View>

      {/* Recent List */}
      <View style={styles.recentContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={dmChannels.slice(0, 10)}
          keyExtractor={(item) => item._id}
          renderItem={renderRecentItem}
          contentContainerStyle={{ paddingHorizontal: scale(16), paddingVertical: verticalScale(16), gap: 16 }}
        />
      </View>

      {/* Filter Pills */}
      <View style={styles.pillsContainer}>
        <TouchableOpacity 
          onPress={() => setActiveFilter('all')}
          style={[styles.pill, activeFilter === 'all' ? [styles.pillActive, { backgroundColor: colors.primary, borderColor: colors.primary }] : { borderColor: colors.border }]}
        >
          <MessageSquare size={14} color={activeFilter === 'all' ? '#fff' : colors.textSecondary} style={{ marginRight: scale(6) }} />
          <Text style={[styles.pillText, { color: activeFilter === 'all' ? '#fff' : colors.textSecondary, fontWeight: activeFilter === 'all' ? '600' : '500' }]}>All</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          onPress={() => setActiveFilter('unreads')}
          style={[styles.pill, activeFilter === 'unreads' ? [styles.pillActive, { backgroundColor: colors.primary, borderColor: colors.primary }] : { borderColor: colors.border }]}
        >
          <CheckSquare size={14} color={activeFilter === 'unreads' ? '#fff' : colors.textSecondary} style={{ marginRight: scale(6) }} />
          <Text style={[styles.pillText, { color: activeFilter === 'unreads' ? '#fff' : colors.textSecondary, fontWeight: activeFilter === 'unreads' ? '600' : '500' }]}>Unreads</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          onPress={() => setActiveFilter('external')}
          style={[styles.pill, activeFilter === 'external' ? [styles.pillActive, { backgroundColor: colors.primary, borderColor: colors.primary }] : { borderColor: colors.border }]}
        >
          <Building2 size={14} color={activeFilter === 'external' ? '#fff' : colors.textSecondary} style={{ marginRight: scale(6) }} />
          <Text style={[styles.pillText, { color: activeFilter === 'external' ? '#fff' : colors.textSecondary, fontWeight: activeFilter === 'external' ? '600' : '500' }]}>External</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        data={dmChannels}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={11}
        removeClippedSubviews={Platform.OS !== 'web'}
        contentContainerStyle={{ paddingTop: verticalScale(4), paddingBottom: verticalScale(80) }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No direct messages yet</Text>
            <TouchableOpacity onPress={() => setCreateNewVisible(true)}>
              <Text style={[styles.emptyLink, { color: colors.primary }]}>Start a conversation</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <FAB onPress={() => setCreateNewVisible(true)} />

      <CreateNewBottomSheet
        visible={createNewVisible}
        onClose={() => setCreateNewVisible(false)}
        navigation={navigation}
      />

      <AccountDrawer 
        visible={accountDrawerVisible}
        onClose={() => setAccountDrawerVisible(false)}
        navigation={navigation}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
  },
  title: {
    fontSize: moderateScale(20),
    fontWeight: "800",
  },
  recentContainer: {
  },
  recentItem: {
    alignItems: 'center',
    width: scale(72),
    gap: 8,
  },
  recentName: {
    fontSize: moderateScale(12),
    fontWeight: '500',
    textAlign: 'center',
  },
  pillsContainer: {
    flexDirection: 'row',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(8),
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(16),
    borderWidth: 1,
  },
  pillActive: {
  },
  pillText: {
    fontSize: moderateScale(13),
    fontWeight: '500',
  },
  empty: {
    alignItems: "center",
    paddingTop: verticalScale(60),
    gap: 12,
  },
  emptyText: {
    fontSize: moderateScale(15),
  },
  emptyLink: {
    fontSize: moderateScale(15),
    fontWeight: "600",
  },
});

export default DMListScreen;
