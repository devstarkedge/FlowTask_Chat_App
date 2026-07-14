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
import { AppAvatar, AppScreen } from "../components/common";
import AccountDrawer from "../components/AccountDrawer";
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

  const previewPrefix = channel.lastMessage?.senderId === currentUser?._id ? "You: " : "";
  let preview = channel.lastMessagePreview || "No messages yet";
  if (channel.lastMessagePreview && channel.lastMessage?.senderId === currentUser?._id) {
    preview = `${previewPrefix}${preview}`;
  }

  const timeStr = channel.lastMessageAt ? formatRelativeTime(channel.lastMessageAt) : "";

  return (
    <TouchableOpacity
      style={dmItem.row}
      onPress={() => onPress(channel)}
      activeOpacity={0.5}
    >
      <AppAvatar user={dmUser} size={40} showStatus={true} statusSize={10} style={{ borderRadius: 8 }} />
      <View style={dmItem.textCol}>
        <View style={dmItem.topRow}>
          <Text
            style={[
              dmItem.name,
              {
                color: colors.textPrimary,
                fontWeight: unreadCount > 0 ? "700" : "600",
              },
            ]}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          {timeStr ? (
            <Text style={[dmItem.time, { color: colors.textTertiary }]}>{timeStr}</Text>
          ) : null}
        </View>
        <Text
          style={[
            dmItem.preview,
            {
              color: unreadCount > 0 ? colors.textPrimary : colors.textTertiary,
              fontWeight: unreadCount > 0 ? "600" : "400",
            },
          ]}
          numberOfLines={2}
        >
          {preview}
        </Text>
      </View>
      {unreadCount > 0 && (
        <View style={[dmItem.badge, { backgroundColor: colors.primary }]}>
          <Text style={dmItem.badgeText}>{unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
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

const NewDMModal = ({ visible, onClose, navigation }) => {
  const { colors } = useThemeStore();
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const { createDM } = useChannelStore();
  const { user: currentUser } = useAuthStore();

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await directoriesAPI.getUsers({ page: 1, limit: 50 });
      setUsers(Array.isArray(data) ? data : data?.users || []);
    } catch (e) {
      logger.error("Failed to fetch users:", e);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  React.useEffect(() => {
    if (visible) loadUsers();
  }, [visible, loadUsers]);

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter((u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  }, [users, searchQuery]);

  const handleCreateDM = useCallback(
    async (targetUser) => {
      setCreating(true);
      try {
        const result = await createDM(targetUser._id);
        onClose();
        navigation.navigate("Chat", { channelId: result._id, channelName: result.name });
      } catch (e) {
        logger.error("Create DM error:", e);
      } finally {
        setCreating(false);
      }
    },
    [createDM, navigation, onClose]
  );

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header */}
        <View style={[ndmStyles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}>
            <X size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[ndmStyles.title, { color: colors.textPrimary }]}>New message</Text>
          <View style={{ width: scale(22) }} />
        </View>

        {/* To field */}
        <View style={[ndmStyles.toRow, { borderBottomColor: colors.border }]}>
          <Text style={[ndmStyles.toLabel, { color: colors.textTertiary }]}>To:</Text>
          <TextInput
            style={[ndmStyles.toInput, { color: colors.inputText }]}
            placeholder="Search people"
            placeholderTextColor={colors.inputPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
        </View>

        {/* User list */}
        {loadingUsers ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: verticalScale(40) }} />
        ) : (
          <FlatList
            data={filteredUsers.filter((u) => u._id !== currentUser?._id)}
            keyExtractor={(item) => item._id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={ndmStyles.userRow}
                onPress={() => handleCreateDM(item)}
                disabled={creating}
                activeOpacity={0.5}
              >
                <AppAvatar user={item} size={32} showStatus />
                <View style={{ flex: 1 }}>
                  <Text style={[ndmStyles.userName, { color: colors.textPrimary }]}>
                    {item.name}
                  </Text>
                  <Text style={[ndmStyles.userEmail, { color: colors.textTertiary }]} numberOfLines={1}>
                    {item.email}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
};

const ndmStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    borderBottomWidth: 1,
  },
  title: {
    fontSize: moderateScale(17),
    fontWeight: "600",
  },
  toRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(10),
    gap: 8,
    borderBottomWidth: 1,
  },
  toLabel: {
    fontSize: moderateScale(15),
  },
  toInput: {
    flex: 1,
    fontSize: moderateScale(15),
    padding: 0,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(10),
    gap: 10,
  },
  userName: {
    fontSize: moderateScale(15),
    fontWeight: "500",
  },
  userEmail: {
    fontSize: moderateScale(12),
  },
});

// ─── Main Component ──────────────────────────────────────────────────────────

const DMListScreen = ({ navigation }) => {
  if (!navigation) navigation = { navigate: () => {} };

  const { colors, effectiveTheme } = useThemeStore();
  const { openDrawer } = useUIStore();
  const channels = useChannelStore((s) => s.channels) || [];
  const unreads = useChannelStore((s) => s.unreads) || {};
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const { user: currentUser } = useAuthStore();

  const [newDMVisible, setNewDMVisible] = useState(false);
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
          <AppAvatar user={dmUser} size={64} showStatus={true} statusSize={14} style={{ borderRadius: 18 }} />
          <Text style={[styles.recentName, { color: colors.textPrimary }]} numberOfLines={1}>{firstName}</Text>
        </TouchableOpacity>
      );
    },
    [handlePress, currentUser, colors.textPrimary]
  );

  // Hardcoded Slackbot
  const slackbot = {
    _id: 'slackbot',
    name: 'Slackbot',
    dmRecipientId: 'slackbot',
    dmRecipientName: 'Slackbot',
    onlineStatus: 'online',
    avatar: 'https://ca.slack-edge.com/T00000000-U00000000-g00000000000-512'
  };

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
          data={[slackbot, ...dmChannels.slice(0, 10)]}
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
          <MessageSquare size={14} color={activeFilter === 'all' ? '#fff' : colors.textSecondary} style={{ marginRight: 6 }} />
          <Text style={[styles.pillText, { color: activeFilter === 'all' ? '#fff' : colors.textSecondary, fontWeight: activeFilter === 'all' ? '600' : '500' }]}>All</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          onPress={() => setActiveFilter('unreads')}
          style={[styles.pill, activeFilter === 'unreads' ? [styles.pillActive, { backgroundColor: colors.primary, borderColor: colors.primary }] : { borderColor: colors.border }]}
        >
          <CheckSquare size={14} color={activeFilter === 'unreads' ? '#fff' : colors.textSecondary} style={{ marginRight: 6 }} />
          <Text style={[styles.pillText, { color: activeFilter === 'unreads' ? '#fff' : colors.textSecondary, fontWeight: activeFilter === 'unreads' ? '600' : '500' }]}>Unreads</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          onPress={() => setActiveFilter('external')}
          style={[styles.pill, activeFilter === 'external' ? [styles.pillActive, { backgroundColor: colors.primary, borderColor: colors.primary }] : { borderColor: colors.border }]}
        >
          <Building2 size={14} color={activeFilter === 'external' ? '#fff' : colors.textSecondary} style={{ marginRight: 6 }} />
          <Text style={[styles.pillText, { color: activeFilter === 'external' ? '#fff' : colors.textSecondary, fontWeight: activeFilter === 'external' ? '600' : '500' }]}>External</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        data={dmChannels}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: verticalScale(4), paddingBottom: verticalScale(80) }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No direct messages yet</Text>
            <TouchableOpacity onPress={() => setNewDMVisible(true)}>
              <Text style={[styles.emptyLink, { color: colors.primary }]}>Start a conversation</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity 
        style={[styles.fab, { backgroundColor: colors.primary }]} 
        activeOpacity={0.8}
        onPress={() => setNewDMVisible(true)}
      >
        <Plus size={28} color="#fff" />
      </TouchableOpacity>

      <NewDMModal
        visible={newDMVisible}
        onClose={() => setNewDMVisible(false)}
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
  fab: {
    position: 'absolute',
    bottom: verticalScale(20),
    right: scale(20),
    width: scale(56),
    height: scale(56),
    borderRadius: scale(28),
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  }
});

export default DMListScreen;
