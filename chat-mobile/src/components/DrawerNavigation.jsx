import React, { useEffect, useRef, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Pressable,
  ScrollView,
  StatusBar,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUIStore } from "../stores/uiStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useAuthStore } from "../stores/authStore";
import { useThemeStore } from "../stores/themeStore";
import { useChannelStore } from "../stores/channelStore";
import { disconnectSocket } from "../services/socket";
import CreateChannelModal from "./CreateChannelModal";
import {
  Hash,
  Plus,
  ChevronDown,
  ChevronRight,
  Lock,
  Volume2,
  X,
} from "lucide-react-native";

const { width } = Dimensions.get("window");
const DRAWER_WIDTH = Math.min(width * 0.8, 320);

// ─── Section Header ─────────────────────────────────────────────────────────

const SectionHeader = ({ title, isExpanded, onToggle, onAdd, colors }) => (
  <View style={sHeader.row}>
    <TouchableOpacity style={sHeader.header} onPress={onToggle} activeOpacity={0.6}>
      <ChevronRight
        size={10}
        color={colors.textOnPrimary}
        style={{ opacity: 0.5, transform: [{ rotate: isExpanded ? "90deg" : "0deg" }] }}
      />
      <Text style={[sHeader.title, { color: colors.textOnPrimary }]}>{title}</Text>
    </TouchableOpacity>
    {onAdd && (
      <TouchableOpacity onPress={onAdd} style={sHeader.addBtn} hitSlop={10}>
        <Plus size={16} color={colors.textOnPrimary} style={{ opacity: 0.5 }} />
      </TouchableOpacity>
    )}
  </View>
);

const sHeader = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    opacity: 0.7,
  },
  addBtn: {
    padding: 4,
  },
});

// ─── Channel Row ────────────────────────────────────────────────────────────

const ChannelRow = React.memo(({ channel, unreadCount, onPress, colors }) => {
  const isPrivate = channel.visibility === "private";
  const isSystem = channel.type === "system";
  const Icon = isSystem ? Volume2 : isPrivate ? Lock : Hash;

  return (
    <TouchableOpacity
      style={[
        chRow.row,
        unreadCount > 0 && { backgroundColor: colors.primaryOverlay },
      ]}
      onPress={() => onPress(channel)}
      activeOpacity={0.5}
    >
      <Icon
        size={14}
        color={colors.textOnPrimary}
        style={{ opacity: unreadCount > 0 ? 1 : 0.45 }}
        strokeWidth={1.5}
      />
      <Text
        style={[
          chRow.name,
          {
            color: colors.textOnPrimary,
            opacity: unreadCount > 0 ? 1 : 0.6,
            fontWeight: unreadCount > 0 ? "700" : "400",
          },
        ]}
        numberOfLines={1}
      >
        {channel.name}
      </Text>
      {unreadCount > 0 && (
        <View style={[chRow.badge, { backgroundColor: colors.error }]}>
          <Text style={[chRow.badgeText, { color: colors.textOnPrimary }]}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

const chRow = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingLeft: 30,
    paddingVertical: 5,
    gap: 6,
    minHeight: 32,
    borderRadius: 6,
    marginHorizontal: 4,
  },
  name: {
    fontSize: 15,
    flex: 1,
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
    fontSize: 10,
    fontWeight: "700",
  },
});

// ─── DM Row ─────────────────────────────────────────────────────────────────

const DMRow = React.memo(({ channel, unreadCount, onPress, colors }) => {
  const otherUser = channel.members?.find((m) => m._id !== channel.selfId) || channel.otherUser;
  const isOnline = otherUser?.presence === "online" || otherUser?.isOnline || channel.onlineStatus === "online";
  const displayName = channel.name || otherUser?.name || "DM";

  return (
    <TouchableOpacity
      style={[
        dmRow.row,
        unreadCount > 0 && { backgroundColor: colors.primaryOverlay },
      ]}
      onPress={() => onPress(channel)}
      activeOpacity={0.5}
    >
      <View style={[dmRow.dot, { backgroundColor: isOnline ? colors.online : colors.primaryOverlayLight }]} />
      <Text
        style={[
          dmRow.name,
          {
            color: colors.textOnPrimary,
            opacity: unreadCount > 0 ? 1 : 0.6,
            fontWeight: unreadCount > 0 ? "700" : "400",
          },
        ]}
        numberOfLines={1}
      >
        {displayName}
      </Text>
      {unreadCount > 0 && (
        <View style={[dmRow.badge, { backgroundColor: colors.error }]}>
          <Text style={[dmRow.badgeText, { color: colors.textOnPrimary }]}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

const dmRow = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingLeft: 30,
    paddingVertical: 5,
    gap: 6,
    minHeight: 32,
    borderRadius: 6,
    marginHorizontal: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  name: {
    fontSize: 15,
    flex: 1,
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
    fontSize: 10,
    fontWeight: "700",
  },
});

// ─── Nav Item ───────────────────────────────────────────────────────────────

const NavItem = ({ label, onPress, badge, colors }) => (
  <TouchableOpacity
    style={navItem.row}
    onPress={onPress}
    activeOpacity={0.5}
  >
    <Text style={[navItem.label, { color: colors.textOnPrimary }]}>{label}</Text>
    {badge > 0 && (
      <View style={[navItem.badge, { backgroundColor: colors.error }]}>
        <Text style={[navItem.badgeText, { color: colors.textOnPrimary }]}>{badge > 99 ? "99+" : badge}</Text>
      </View>
    )}
  </TouchableOpacity>
);

const navItem = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 9,
    gap: 8,
    borderRadius: 6,
    marginHorizontal: 4,
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    opacity: 0.8,
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
    fontSize: 10,
    fontWeight: "700",
  },
});

// ─── Main Drawer (slides from RIGHT) ────────────────────────────────────────

const DrawerNavigation = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { isDrawerOpen, closeDrawer } = useUIStore();
  const { activeWorkspace } = useWorkspaceStore();
  const { user, logout } = useAuthStore();
  const { colors } = useThemeStore();
  const channels = useChannelStore((s) => s.channels) || [];
  const unreads = useChannelStore((s) => s.unreads) || {};
  const starredIds = useChannelStore((s) => s.starredIds) || [];
  const slideAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;

  const [channelsExpanded, setChannelsExpanded] = useState(true);
  const [dmsExpanded, setDmsExpanded] = useState(true);
  const [createChannelVisible, setCreateChannelVisible] = useState(false);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isDrawerOpen ? 0 : DRAWER_WIDTH,
      duration: 220,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [isDrawerOpen]);

  const { starredChannels, regularChannels, dmChannels } = useMemo(() => {
    const starred = channels.filter((c) => starredIds.includes(c._id) && c.type !== "dm");
    const regular = channels.filter((c) => c.type !== "dm" && !starredIds.includes(c._id));
    const dms = channels.filter((c) => c.type === "dm");
    return { starredChannels: starred, regularChannels: regular, dmChannels: dms };
  }, [channels, starredIds]);

  const handleLogout = async () => {
    closeDrawer();
    disconnectSocket();
    await logout();
  };

  const navigateAndClose = useCallback(
    (screen, params) => {
      closeDrawer();
      navigation.navigate(screen, params);
    },
    [navigation, closeDrawer]
  );

  const handleChannelPress = useCallback(
    (channel) => {
      navigateAndClose("Chat", { channelId: channel._id, channelName: channel.name });
    },
    [navigateAndClose]
  );

  const handleDMPress = useCallback(
    (channel) => {
      useChannelStore.getState().setActiveChannel(channel._id);
      navigateAndClose("Chat", { channelId: channel._id, channelName: channel.name });
    },
    [navigateAndClose]
  );

  if (!isDrawerOpen) return null;

  return (
    <View style={styles.overlay}>
      <StatusBar barStyle="light-content" />
      <Pressable onPress={closeDrawer} style={StyleSheet.absoluteFill}>
        <View style={[styles.backdrop, { backgroundColor: colors.overlay }]} />
      </Pressable>

      <Animated.View
        style={[
          styles.drawer,
          {
            backgroundColor: colors.primary,
            transform: [{ translateX: slideAnim }],
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {/* Close button */}
        <View style={styles.topRow}>
          <TouchableOpacity onPress={closeDrawer} style={styles.closeBtn}>
            <X size={20} color={colors.textOnPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Workspace name */}
          <TouchableOpacity
            style={styles.wsHeader}
            onPress={() => {
              closeDrawer();
              navigation.navigate("WorkspaceSwitcher");
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.wsName, { color: colors.textOnPrimary }]} numberOfLines={1}>
              {activeWorkspace?.name || "Workspace"}
            </Text>
            <ChevronDown size={14} color={colors.textOnPrimary} style={{ opacity: 0.5 }} />
          </TouchableOpacity>

          {/* User */}
          <View style={styles.userRow}>
            <View style={[styles.statusDot, { backgroundColor: colors.online }]} />
            <Text style={[styles.userName, { color: colors.textOnPrimary }]} numberOfLines={1}>
              {user?.name || "You"}
            </Text>
          </View>

          {/* Nav items */}
          <View style={[styles.sep, { backgroundColor: colors.primaryOverlayLight }]} />
          <NavItem label="Home" onPress={() => navigateAndClose("Main")} colors={colors} />
          <NavItem
            label="Direct messages"
            onPress={() => {
              closeDrawer();
              navigation.navigate("Main", { screen: "DMsTab" });
            }}
            colors={colors}
          />

          {/* Starred */}
          {starredChannels.length > 0 && (
            <>
              <View style={[styles.sep, { backgroundColor: colors.primaryOverlayLight }]} />
              <SectionHeader title="Starred" isExpanded={true} onToggle={() => {}} colors={colors} />
              {starredChannels.map((ch) => (
                <ChannelRow key={ch._id} channel={ch} unreadCount={unreads[ch._id] || 0} onPress={handleChannelPress} colors={colors} />
              ))}
            </>
          )}

          {/* Channels */}
          <View style={[styles.sep, { backgroundColor: colors.primaryOverlayLight }]} />
          <SectionHeader
            title="Channels"
            isExpanded={channelsExpanded}
            onToggle={() => setChannelsExpanded((p) => !p)}
            onAdd={() => setCreateChannelVisible(true)}
            colors={colors}
          />
          {channelsExpanded &&
            regularChannels.map((ch) => (
              <ChannelRow key={ch._id} channel={ch} unreadCount={unreads[ch._id] || 0} onPress={handleChannelPress} colors={colors} />
            ))}

          {/* Direct messages */}
          <View style={[styles.sep, { backgroundColor: colors.primaryOverlayLight }]} />
          <SectionHeader
            title="Direct messages"
            isExpanded={dmsExpanded}
            onToggle={() => setDmsExpanded((p) => !p)}
            onAdd={() => {
              closeDrawer();
              navigation.navigate("Main", { screen: "DMsTab" });
            }}
            colors={colors}
          />
          {dmsExpanded &&
            dmChannels.map((ch) => (
              <DMRow key={ch._id} channel={ch} unreadCount={unreads[ch._id] || 0} onPress={handleDMPress} colors={colors} />
            ))}

          {/* Bottom nav */}
          <View style={[styles.sep, { backgroundColor: colors.primaryOverlayLight }]} />
          <NavItem label="Profile" onPress={() => navigateAndClose("Profile")} colors={colors} />
          <NavItem label="Preferences" onPress={() => navigateAndClose("Preferences")} colors={colors} />
          <NavItem label="People" onPress={() => navigateAndClose("People")} colors={colors} />
          <NavItem label="Saved items" onPress={() => navigateAndClose("Later")} colors={colors} />

          <View style={[styles.sep, { backgroundColor: colors.primaryOverlayLight }]} />
          <NavItem label="Sign out" onPress={handleLogout} colors={colors} />
          <View style={{ height: 20 }} />
        </ScrollView>
      </Animated.View>

      <CreateChannelModal
        visible={createChannelVisible}
        onClose={() => setCreateChannelVisible(false)}
        navigation={navigation}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  backdrop: {
    flex: 1,
  },
  drawer: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeBtn: {
    padding: 4,
  },
  wsHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 2,
    gap: 4,
  },
  wsName: {
    fontSize: 17,
    fontWeight: "800",
    flex: 1,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  userName: {
    fontSize: 14,
    fontWeight: "500",
    opacity: 0.7,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginVertical: 8,
  },
});

export default DrawerNavigation;
