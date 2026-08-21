import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeStore } from "../stores/themeStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { directoriesAPI } from "../services/api";
import { AppAvatar } from "../components/common";
import Toast from "react-native-toast-message";
import {
  ArrowLeft,
  Search,
  Globe,
  X,
  Trash2,
  Clock,
  CheckCircle,
} from "lucide-react-native";
import { scale, verticalScale, moderateScale } from "../utils/responsive";
import { getSocket } from "../chat/services/SocketManager";

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
];

const PAGE_LIMIT = 30;

/**
 * ExternalConnectionsScreen
 *
 * Lists Guest members (active) and pending Guest invitations for the current workspace.
 * Uses Chat App directoriesAPI — no FlowTask dependency.
 */
const ExternalConnectionsScreen = ({ navigation }) => {
  const { colors, effectiveTheme } = useThemeStore();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);

  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [removingId, setRemovingId] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const debounceRef = useRef(null);

  // activeWorkspace already carries the current user's role from the API
  const canManageGuests =
    activeWorkspace?.role === "owner" || activeWorkspace?.role === "admin";

  // Real-time: remove guest immediately when server emits workspace:member:removed
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = ({ userId }) => {
      setGuests((prev) => prev.filter((g) => g._id !== userId));
    };
    socket.on('workspace:member:removed', handler);
    return () => socket.off('workspace:member:removed', handler);
  }, []);

  // ─── Data Fetching ────────────────────────────────────────────────

  const fetchGuests = useCallback(
    async ({ searchVal = "", statusVal = "", pageNum = 1, append = false } = {}) => {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);

      try {
        const { data } = await directoriesAPI.getExternal({
          search: searchVal,
          status: statusVal,
          page: pageNum,
          limit: PAGE_LIMIT,
        });

        const result = data?.data || data || {};
        const newUsers = Array.isArray(result)
          ? result
          : (result.users || result.data?.users || []);
        const pages = result.pages || 1;

        setTotalPages(pages);
        setPage(pageNum);
        setGuests((prev) => (append ? [...prev, ...newUsers] : newUsers));
      } catch (err) {
        Toast.show({ type: "error", text1: "Failed to load external users" });
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchGuests({ searchVal: search, statusVal: statusFilter, pageNum: 1 });
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchChange = (val) => {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchGuests({ searchVal: val, statusVal: statusFilter, pageNum: 1 });
    }, 350);
  };

  const clearSearch = () => {
    setSearch("");
    fetchGuests({ searchVal: "", statusVal: statusFilter, pageNum: 1 });
  };

  const handleLoadMore = () => {
    if (loadingMore || page >= totalPages) return;
    fetchGuests({
      searchVal: search,
      statusVal: statusFilter,
      pageNum: page + 1,
      append: true,
    });
  };

  // ─── Remove Guest ─────────────────────────────────────────────────

  const handleRemove = (guest) => {
    const displayName = guest.name || guest.email || "this user";
    Alert.alert(
      "Remove Guest",
      `Remove ${displayName} from this workspace?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const targetId = guest._id;
            setRemovingId(targetId);
            try {
              if (directoriesAPI.removeExternalUser && activeWorkspaceId) {
                await directoriesAPI.removeExternalUser(activeWorkspaceId, targetId);
              }
              setGuests((prev) => prev.filter((g) => g._id !== targetId));
              Toast.show({ type: "success", text1: "Guest removed" });
            } catch (err) {
              Toast.show({
                type: "error",
                text1:
                  err?.response?.data?.message || "Failed to remove guest",
              });
            } finally {
              setRemovingId(null);
            }
          },
        },
      ]
    );
  };

  // ─── Render Helpers ───────────────────────────────────────────────

  const getAvatarHue = (name = "") =>
    [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

  const renderItem = ({ item: guest }) => {
    const name = guest.name || guest.email?.split("@")[0] || "Unknown";
    const isActive =
      guest.status === "active" || guest.membershipStatus === "active";
    const hue = getAvatarHue(name);
    const isRemoving = removingId === guest._id;

    return (
      <TouchableOpacity
        style={[
          styles.row,
          {
            backgroundColor:
              colors.backgroundSecondary || colors.card || colors.background,
            borderBottomColor: colors.border,
          },
        ]}
        activeOpacity={0.7}
        onPress={() => {
          if (guest.isPendingInvite) return;
          navigation.navigate("UserProfile", {
            user: {
              ...guest,
              workspaceRole: guest.workspaceRole || guest.role || "guest",
            },
          });
        }}
      >
        {/* Avatar */}
        <View style={styles.avatarWrap}>
          {guest.avatar ? (
            <AppAvatar uri={guest.avatar} name={name} size={scale(40)} />
          ) : (
            <View
              style={[
                styles.avatarFallback,
                {
                  backgroundColor: `hsl(${hue}, 55%, 42%)`,
                  width: scale(40),
                  height: scale(40),
                  borderRadius: scale(20),
                },
              ]}
            >
              <Text style={styles.avatarInitial}>
                {name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          {/* Globe badge */}
          <View
            style={[styles.globeBadge, { backgroundColor: colors.primary }]}
          >
            <Globe size={scale(9)} color="#fff" />
          </View>
        </View>

        {/* Info */}
        <View style={styles.info}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: scale(6) }}>
            <Text
              style={[styles.nameText, { color: colors.textPrimary, flexShrink: 1 }]}
              numberOfLines={1}
            >
              {name}
            </Text>
            {guest.ownWorkspaceName && (
              <View style={{ backgroundColor: colors.border, paddingHorizontal: scale(6), paddingVertical: verticalScale(2), borderRadius: moderateScale(10), flexShrink: 1 }}>
                <Text style={{ color: colors.textSecondary, fontSize: moderateScale(11), fontWeight: "600" }} numberOfLines={1}>
                  {guest.ownWorkspaceName}
                </Text>
              </View>
            )}
          </View>
          {guest.email && (
            <Text
              style={[styles.emailText, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {guest.email}
            </Text>
          )}
          {guest.invitedBy?.name && (
            <Text
              style={[
                styles.inviterText,
                { color: colors.textTertiary || colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              Invited by {guest.invitedBy.name}
            </Text>
          )}
        </View>

        {/* Role + status badges */}
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: "rgba(124, 58, 237, 0.15)", marginRight: scale(6) },
          ]}
        >
          <Text style={[styles.statusText, { color: "#7c3aed" }]}>Guest</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: isActive
                ? "rgba(52, 199, 89, 0.15)"
                : "rgba(255, 159, 10, 0.15)",
            },
          ]}
        >
          {isActive ? (
            <CheckCircle size={scale(11)} color="#34C759" />
          ) : (
            <Clock size={scale(11)} color="#FF9F0A" />
          )}
          <Text
            style={[
              styles.statusText,
              { color: isActive ? "#34C759" : "#FF9F0A" },
            ]}
          >
            {isActive ? "Active" : "Pending"}
          </Text>
        </View>

        {/* Remove button — visible only for active guests when user has permission */}
        {canManageGuests && !guest.isPendingInvite && (
          <TouchableOpacity
            onPress={(e) => {
              e?.stopPropagation?.();
              handleRemove(guest);
            }}
            disabled={isRemoving}
            style={styles.removeBtn}
            accessibilityLabel="Remove guest"
          >
            {isRemoving ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Trash2 size={scale(16)} color={colors.textSecondary} />
            )}
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyWrap}>
        <Globe size={scale(40)} color={colors.textSecondary} />
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
          No external users
        </Text>
        <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
          {search
            ? "Try a different search"
            : "Invite guests to collaborate in specific channels"}
        </Text>
      </View>
    );
  };

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <ActivityIndicator
        size="small"
        color={colors.primary}
        style={{ marginVertical: verticalScale(16) }}
      />
    );
  };

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <StatusBar barStyle={effectiveTheme === "dark" ? "light-content" : "dark-content"} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityLabel="Go back"
        >
          <ArrowLeft
            size={scale(22)}
            color={colors.textPrimary}
            strokeWidth={2}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          External Connections
        </Text>
      </View>

      {/* Search */}
      <View style={[styles.searchRow, { borderBottomColor: colors.border }]}>
        <View
          style={[
            styles.searchBox,
            {
              backgroundColor:
                colors.inputBackground || colors.card || colors.background,
              borderColor: colors.border,
            },
          ]}
        >
          <Search size={scale(15)} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search guests…"
            placeholderTextColor={colors.textSecondary}
            value={search}
            onChangeText={handleSearchChange}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={clearSearch}
              accessibilityLabel="Clear search"
            >
              <X size={scale(14)} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Status filter tabs */}
      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        {STATUS_TABS.map((tab) => {
          const isSelected = statusFilter === tab.value;
          return (
            <TouchableOpacity
              key={tab.value}
              onPress={() => setStatusFilter(tab.value)}
              style={[
                styles.tab,
                isSelected && { backgroundColor: colors.primary },
                !isSelected && { borderColor: colors.border, borderWidth: 1 },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { color: isSelected ? "#fff" : colors.textSecondary },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading guests…
          </Text>
        </View>
      ) : (
        <FlatList
          data={guests}
          keyExtractor={(item) => String(item._id)}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          contentContainerStyle={
            guests.length === 0 ? styles.flatListEmpty : undefined
          }
          showsVerticalScrollIndicator={false}
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
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    borderBottomWidth: 1,
  },
  backBtn: { marginRight: scale(12) },
  headerTitle: {
    fontSize: moderateScale(18),
    fontWeight: "700",
  },
  searchRow: {
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(10),
    borderBottomWidth: 1,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: moderateScale(10),
    borderWidth: 1,
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(7),
    gap: scale(8),
  },
  searchInput: {
    flex: 1,
    fontSize: moderateScale(14),
    paddingVertical: 0,
  },
  tabRow: {
    flexDirection: "row",
    gap: scale(8),
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(10),
    borderBottomWidth: 1,
  },
  tab: {
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(5),
    borderRadius: moderateScale(20),
  },
  tabLabel: {
    fontSize: moderateScale(13),
    fontWeight: "500",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarWrap: { position: "relative", marginRight: scale(12) },
  avatarFallback: {
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    color: "#fff",
    fontSize: moderateScale(16),
    fontWeight: "700",
  },
  globeBadge: {
    position: "absolute",
    bottom: scale(-2),
    right: scale(-2),
    width: scale(16),
    height: scale(16),
    borderRadius: scale(8),
    justifyContent: "center",
    alignItems: "center",
  },
  info: { flex: 1, paddingRight: scale(8) },
  nameText: {
    fontSize: moderateScale(15),
    fontWeight: "600",
  },
  emailText: {
    fontSize: moderateScale(12),
    marginTop: verticalScale(1),
  },
  inviterText: {
    fontSize: moderateScale(11),
    marginTop: verticalScale(2),
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(4),
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(4),
    borderRadius: moderateScale(20),
    marginRight: scale(8),
  },
  statusText: {
    fontSize: moderateScale(11),
    fontWeight: "600",
  },
  removeBtn: {
    padding: scale(6),
  },
  loaderWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: verticalScale(12),
  },
  loadingText: {
    fontSize: moderateScale(14),
  },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: scale(32),
    gap: verticalScale(12),
  },
  emptyTitle: {
    fontSize: moderateScale(17),
    fontWeight: "700",
  },
  emptySub: {
    fontSize: moderateScale(13),
    textAlign: "center",
    lineHeight: moderateScale(19),
  },
  flatListEmpty: { flex: 1 },
});

export default ExternalConnectionsScreen;
