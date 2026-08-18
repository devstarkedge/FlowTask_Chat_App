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
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useDirectoryUsers } from "../hooks/queries/useDirectoryUsers";
import { channelAPI } from "../services/api";
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
import { scale, verticalScale, moderateScale } from '../utils/responsive';


const PeopleScreen = ({ navigation }) => {
  const { colors, effectiveTheme } = useThemeStore();
  const createDM = useChannelStore((s) => s.createDM);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const { data: users = [], isLoading: loading, error, refetch: loadUsers } = useDirectoryUsers(activeWorkspaceId, { limit: 100 });
  const [search, setSearch] = useState("");

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
            <Text style={{ color: colors.textTertiary, fontSize: moderateScale(16) }}>×</Text>
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
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    borderBottomWidth: 1,
  },
  backButton: { padding: moderateScale(4) },
  headerTitle: {
    fontSize: moderateScale(17),
    fontWeight: "700",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: scale(16),
    marginVertical: verticalScale(10),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
    borderRadius: moderateScale(8),
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: moderateScale(14),
    padding: moderateScale(0),
  },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(16),
    paddingBottom: verticalScale(8),
    gap: 6,
  },
  countText: {
    fontSize: moderateScale(12),
    fontWeight: "500",
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    gap: 12,
    borderBottomWidth: 0.5,
  },
  userInfo: { flex: 1 },
  userName: { fontSize: moderateScale(15), fontWeight: "600" },
  userEmail: { fontSize: moderateScale(13), marginTop: verticalScale(2) },
  roleBadge: {
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(3),
    borderRadius: moderateScale(4),
  },
  roleText: {
    fontSize: moderateScale(11),
    fontWeight: "600",
    textTransform: "capitalize",
  },
  presenceDot: {
    width: scale(8),
    height: verticalScale(8),
    borderRadius: moderateScale(4),
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: moderateScale(40),
    gap: 12,
  },
  errorText: { fontSize: moderateScale(14), textAlign: "center" },
  retryBtn: { padding: moderateScale(8) },
  emptyText: { fontSize: moderateScale(14), marginTop: verticalScale(8) },
});

export default PeopleScreen;
