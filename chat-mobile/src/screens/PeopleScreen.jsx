import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeStore } from "../stores/themeStore";
import { useChannelStore } from "../stores/channelStore";
import { directoriesAPI, channelAPI } from "../services/api";
import { AppAvatar } from "../components/common";
import Toast from "react-native-toast-message";
import {
  ArrowLeft,
  Search,
  Users,
  User,
  UserPlus,
} from "lucide-react-native";
import logger from '../utils/logger';

const PeopleScreen = ({ navigation }) => {
  const { colors, effectiveTheme } = useThemeStore();
  const createDM = useChannelStore((s) => s.createDM);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await directoriesAPI.getUsers({ limit: 100 });
      setUsers(data.data?.users || data.data || []);
    } catch (err) {
      setError("Failed to load people");
      logger.error("Failed to load users:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q)
    );
  }, [users, search]);

  const handleUserPress = useCallback(
    async (user) => {
      try {
        const channel = await createDM(user._id);
        if (channel) {
          setActiveChannel(channel._id);
          navigation.navigate("Chat", {
            channelId: channel._id,
            channelName: channel.name || user.name,
          });
        }
      } catch (err) {
        Toast.show({ type: "error", text1: "Failed to start conversation" });
      }
    },
    [createDM, navigation, setActiveChannel]
  );

  const renderUser = useCallback(
    ({ item }) => {
      const isOnline = item.presence === "online" || item.isOnline;
      return (
        <TouchableOpacity
          style={[styles.userRow, { borderBottomColor: colors.border }]}
          onPress={() => handleUserPress(item)}
          activeOpacity={0.6}
        >
          <AppAvatar user={item} size={44} showStatus />
          <View style={styles.userInfo}>
            <Text style={[styles.userName, { color: colors.textPrimary }]}>
              {item.name}
            </Text>
            {item.email && (
              <Text
                style={[styles.userEmail, { color: colors.textTertiary }]}
                numberOfLines={1}
              >
                {item.email}
              </Text>
            )}
          </View>
          {item.role && (
            <View style={[styles.roleBadge, { backgroundColor: colors.card }]}>
              <Text style={[styles.roleText, { color: colors.textSecondary }]}>
                {item.role}
              </Text>
            </View>
          )}
          <View
            style={[
              styles.presenceDot,
              {
                backgroundColor: isOnline ? colors.online : colors.offline,
              },
            ]}
          />
        </TouchableOpacity>
      );
    },
    [handleUserPress, colors]
  );

  const keyExtractor = useCallback((item) => item._id || item.id, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      <StatusBar barStyle={effectiveTheme === "dark" ? "light-content" : "dark-content"} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={8}
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          People
        </Text>
        <TouchableOpacity
          onPress={() => navigation.navigate("InviteManagement")}
          style={styles.backButton}
          hitSlop={8}
        >
          <UserPlus size={20} color={colors.accent || colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
        <Search size={16} color={colors.inputPlaceholder} />
        <TextInput
          style={[styles.searchInput, { color: colors.inputText }]}
          placeholder="Search people..."
          placeholderTextColor={colors.inputPlaceholder}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
            <Text style={{ color: colors.textTertiary, fontSize: 16 }}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Count */}
      <View style={styles.countRow}>
        <Users size={14} color={colors.textTertiary} />
        <Text style={[styles.countText, { color: colors.textTertiary }]}>
          {filteredUsers.length} {filteredUsers.length === 1 ? "member" : "members"}
        </Text>
      </View>

      {/* User list */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          <TouchableOpacity onPress={loadUsers} style={styles.retryBtn}>
            <Text style={{ color: colors.primary, fontWeight: "600" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          renderItem={renderUser}
          keyExtractor={keyExtractor}
          initialNumToRender={20}
          maxToRenderPerBatch={10}
          windowSize={11}
          ListEmptyComponent={
            <View style={styles.center}>
              <User size={40} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {search ? "No matching people" : "No people found"}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
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
  backButton: { padding: 4 },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 6,
  },
  countText: {
    fontSize: 12,
    fontWeight: "500",
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 0.5,
  },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: "600" },
  userEmail: { fontSize: 13, marginTop: 2 },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  roleText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 12,
  },
  errorText: { fontSize: 14, textAlign: "center" },
  retryBtn: { padding: 8 },
  emptyText: { fontSize: 14, marginTop: 8 },
});

export default PeopleScreen;
