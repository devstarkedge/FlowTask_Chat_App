import React, { useCallback, useMemo, useState } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { useChannelStore } from "../stores/channelStore";
import { useAuthStore } from "../stores/authStore";
import { useUIStore } from "../stores/uiStore";
import { useThemeStore } from "../stores/themeStore";
import { directoriesAPI } from "../services/api";
import {
  Edit3,
  Search,
  X,
} from "lucide-react-native";
import logger from '../utils/logger';

// ─── DM Item (Slack mobile: avatar + name + preview + time, flat) ────────────

const DMItem = React.memo(({ channel, onPress, isSelf }) => {
  const { colors } = useThemeStore();
  const unreads = useChannelStore((s) => s.unreads) || {};
  const unreadCount = unreads[channel._id] || 0;
  const currentUser = useAuthStore((s) => s.user);

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
    onlineStatus: channel.onlineStatus || "offline",
  };

  const preview = channel.lastMessagePreview || "No messages yet";

  const timeStr = channel.lastMessageAt
    ? new Date(channel.lastMessageAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  return (
    <TouchableOpacity
      style={dmItem.row}
      onPress={() => onPress(channel)}
      activeOpacity={0.5}
    >
      <AppAvatar user={dmUser} size={36} showStatus={true} statusSize={8} />
      <View style={dmItem.textCol}>
        <View style={dmItem.topRow}>
          <Text
            style={[
              dmItem.name,
              {
                color: colors.textPrimary,
                fontWeight: unreadCount > 0 ? "700" : "500",
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
          numberOfLines={1}
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  name: {
    fontSize: 15,
    flex: 1,
  },
  time: {
    fontSize: 12,
    marginLeft: 8,
  },
  preview: {
    fontSize: 13,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
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
          <View style={{ width: 22 }} />
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
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
  },
  toRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
  },
  toLabel: {
    fontSize: 15,
  },
  toInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  userName: {
    fontSize: 15,
    fontWeight: "500",
  },
  userEmail: {
    fontSize: 12,
  },
});

// ─── Main Component ──────────────────────────────────────────────────────────

const DMListScreen = ({ navigation }) => {
  if (!navigation) navigation = { navigate: () => {} };

  const { colors, effectiveTheme } = useThemeStore();
  const { openDrawer } = useUIStore();
  const channels = useChannelStore((s) => s.channels) || [];
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const { user: currentUser } = useAuthStore();

  const [newDMVisible, setNewDMVisible] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");

  const dmChannels = useMemo(() => {
    let dms = channels.filter((c) => c.type === "dm");
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      dms = dms.filter((c) => c.name?.toLowerCase().includes(q));
    }
    
    dms.sort((a, b) => {
      const aIsSelf = a.dmRecipientId === currentUser?._id;
      const bIsSelf = b.dmRecipientId === currentUser?._id;
      
      if (aIsSelf && !bIsSelf) return -1;
      if (!aIsSelf && bIsSelf) return 1;
      
      const aTime = new Date(a.lastMessageAt || a.lastMessage?.createdAt || 0).getTime();
      const bTime = new Date(b.lastMessageAt || b.lastMessage?.createdAt || 0).getTime();
      return bTime - aTime;
    });
    
    return dms;
  }, [channels, filterQuery, currentUser]);

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

  return (
    <AppScreen style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      {/* Header: "DMs" title + compose */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>DMs</Text>
        {/* <TouchableOpacity
          onPress={() => setNewDMVisible(true)}
          style={styles.composeBtn}
          hitSlop={8}
        >
          <Edit3 size={18} color={colors.primary} />
        </TouchableOpacity> */}
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.inputBackground }]}>
        <Search size={14} color={colors.inputPlaceholder} />
        <TextInput
          style={[styles.searchInput, { color: colors.inputText }]}
          placeholder="Search DMs"
          placeholderTextColor={colors.inputPlaceholder}
          value={filterQuery}
          onChangeText={setFilterQuery}
          autoCorrect={false}
        />
        {filterQuery.length > 0 && (
          <TouchableOpacity onPress={() => setFilterQuery("")} hitSlop={8}>
            <X size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      <FlatList
        data={dmChannels}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 4 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No direct messages yet</Text>
            <TouchableOpacity onPress={() => setNewDMVisible(true)}>
              <Text style={[styles.emptyLink, { color: colors.primary }]}>Start a conversation</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <NewDMModal
        visible={newDMVisible}
        onClose={() => setNewDMVisible(false)}
        navigation={navigation}
      />
      </AppScreen>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
  },
  composeBtn: {
    padding: 4,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  empty: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
  },
  emptyLink: {
    fontSize: 15,
    fontWeight: "600",
  },
});

export default DMListScreen;
