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
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUIStore } from "../stores/uiStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useAuthStore } from "../stores/authStore";
import { useThemeStore } from "../stores/themeStore";
import { useChannelStore } from "../stores/channelStore";
import { disconnectSocket } from "../services/socket";
import CreateChannelModal from "./CreateChannelModal";
import ManageCategoryChannelsModal from "./ManageCategoryChannelsModal";
import CategoryActionSheet from "./CategoryActionSheet";
import { scale, verticalScale, moderateScale } from '../utils/responsive';

import {
  Hash,
  Plus,
  ChevronDown,
  ChevronRight,
  Lock,
  Volume2,
  X,
  MoreVertical,
} from "lucide-react-native";

const { width } = Dimensions.get("window");
const DRAWER_WIDTH = Math.min(width * 0.8, 320);

// ─── Section Header ─────────────────────────────────────────────────────────

const SectionHeader = ({ title, isExpanded, onToggle, onAdd, onMenu, colors }) => (
  <View style={sHeader.row}>
    <TouchableOpacity style={sHeader.header} onPress={onToggle} activeOpacity={0.6}>
      <ChevronRight
        size={10}
        color={colors.textOnPrimary}
        style={{ opacity: 0.5, transform: [{ rotate: isExpanded ? "90deg" : "0deg" }] }}
      />
      <Text style={[sHeader.title, { color: colors.textOnPrimary }]}>{title}</Text>
    </TouchableOpacity>
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {onAdd && (
        <TouchableOpacity onPress={onAdd} style={sHeader.addBtn} hitSlop={10}>
          <Plus size={16} color={colors.textOnPrimary} style={{ opacity: 0.5 }} />
        </TouchableOpacity>
      )}
      {onMenu && (
        <TouchableOpacity onPress={onMenu} style={sHeader.addBtn} hitSlop={10}>
          <MoreVertical size={16} color={colors.textOnPrimary} style={{ opacity: 0.5 }} />
        </TouchableOpacity>
      )}
    </View>
  </View>
);

const sHeader = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(18),
    paddingBottom: verticalScale(4),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: moderateScale(13),
    fontWeight: "700",
    opacity: 0.7,
  },
  addBtn: {
    padding: moderateScale(4),
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
    paddingHorizontal: scale(16),
    paddingLeft: scale(30),
    paddingVertical: verticalScale(5),
    gap: 6,
    minHeight: verticalScale(32),
    borderRadius: moderateScale(6),
    marginHorizontal: scale(4),
  },
  name: {
    fontSize: moderateScale(15),
    flex: 1,
  },
  badge: {
    minWidth: scale(18),
    height: verticalScale(18),
    borderRadius: moderateScale(9),
    paddingHorizontal: scale(5),
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    fontSize: moderateScale(10),
    fontWeight: "700",
  },
});

// ─── DM Row ─────────────────────────────────────────────────────────────────

const DMRow = React.memo(({ channel, unreadCount, onPress, colors }) => {
  const otherUser = channel.members?.find((m) => m._id !== channel.selfId) || channel.otherUser;
  const rawTargetId = otherUser?._id || channel.dmRecipientId;
  const targetId = typeof rawTargetId === 'object' ? rawTargetId?._id || rawTargetId?.id : rawTargetId;
  const targetIdStr = targetId?.toString ? targetId.toString() : targetId;
  const liveOnlineStatus = useWorkspaceStore(s => s.presenceMap?.[targetIdStr]);
  
  const isOnline = liveOnlineStatus === 'online' || otherUser?.presence === "online" || otherUser?.isOnline || channel.onlineStatus === "online";
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
    paddingHorizontal: scale(16),
    paddingLeft: scale(30),
    paddingVertical: verticalScale(5),
    gap: 6,
    minHeight: verticalScale(32),
    borderRadius: moderateScale(6),
    marginHorizontal: scale(4),
  },
  dot: {
    width: scale(8),
    height: verticalScale(8),
    borderRadius: moderateScale(4),
  },
  name: {
    fontSize: moderateScale(15),
    flex: 1,
  },
  badge: {
    minWidth: scale(18),
    height: verticalScale(18),
    borderRadius: moderateScale(9),
    paddingHorizontal: scale(5),
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    fontSize: moderateScale(10),
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
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(9),
    gap: 8,
    borderRadius: moderateScale(6),
    marginHorizontal: scale(4),
  },
  label: {
    flex: 1,
    fontSize: moderateScale(15),
    fontWeight: "500",
    opacity: 0.8,
  },
  badge: {
    minWidth: scale(18),
    height: verticalScale(18),
    borderRadius: moderateScale(9),
    paddingHorizontal: scale(5),
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    fontSize: moderateScale(10),
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
  const categories = useChannelStore((s) => s.categories) || [];
  const unreads = useChannelStore((s) => s.unreads) || {};
  const starredIds = useChannelStore((s) => s.starredIds) || [];
  const slideAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;

  const [channelsExpanded, setChannelsExpanded] = useState(true);
  const [dmsExpanded, setDmsExpanded] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [createChannelVisible, setCreateChannelVisible] = useState(false);
  const [manageCategoryVisible, setManageCategoryVisible] = useState(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);
  const [categoryModalMode, setCategoryModalMode] = useState('add');

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isDrawerOpen ? 0 : DRAWER_WIDTH,
      duration: 220,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [isDrawerOpen]);

  const { starredChannels, regularChannels, dmChannels } = useMemo(() => {
    const starred = channels.filter((c) => starredIds.includes(c._id));
    const regular = channels.filter((c) => c.type !== "dm" && !c.categoryId && !starredIds.includes(c._id));
    const dms = channels.filter((c) => c.type === "dm" && !starredIds.includes(c._id));
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

  const handleCategoryAction = (cat) => {
    // Only custom categories have actions menu
    if (cat.type === 'department') {
      return;
    }
    setActiveCategory(cat);
    setActionSheetVisible(true);
  };

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
                ch.type === "dm" ? (
                  <DMRow key={ch._id} channel={ch} unreadCount={unreads[ch._id] || 0} onPress={handleDMPress} colors={colors} />
                ) : (
                  <ChannelRow key={ch._id} channel={ch} unreadCount={unreads[ch._id] || 0} onPress={handleChannelPress} colors={colors} />
                )
              ))}
            </>
          )}

          {/* Categories */}
          {categories.map((cat) => {
            const catChannels = channels.filter(c => c.categoryId === cat._id && !starredIds.includes(c._id));
            const isExpanded = expandedCategories[cat._id] !== false; // default true
            const isDepartment = cat.type === 'department';
            return (
              <React.Fragment key={cat._id}>
                <View style={[styles.sep, { backgroundColor: colors.primaryOverlayLight }]} />
                <SectionHeader
                  title={`${cat.icon || '📁'} ${cat.name}`}
                  isExpanded={isExpanded}
                  onToggle={() => setExpandedCategories(p => ({ ...p, [cat._id]: !isExpanded }))}
                  onMenu={!isDepartment ? () => handleCategoryAction(cat) : undefined}
                  colors={colors}
                />
                {isExpanded && catChannels.length === 0 && !isDepartment && (
                  <TouchableOpacity 
                    onPress={() => {
                      setActiveCategory(cat);
                      setActionSheetVisible(true);
                    }} 
                    style={{ paddingLeft: 12, paddingVertical: 8 }}
                  >
                    <Text style={{ fontSize: 13, paddingHorizontal: 30, color: colors.textOnPrimary, opacity: 0.8, fontWeight: "600" }}>
                      + Add Channels
                    </Text>
                  </TouchableOpacity>
                )}
                {isExpanded && catChannels.map((ch) => (
                  <ChannelRow key={ch._id} channel={ch} unreadCount={unreads[ch._id] || 0} onPress={handleChannelPress} colors={colors} />
                ))}
              </React.Fragment>
            );
          })}

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
          <NavItem label="Invite people" onPress={() => navigateAndClose("InviteManagement")} colors={colors} />
          <NavItem label="Starred messages" onPress={() => navigateAndClose("StarredMessages")} colors={colors} />
          <NavItem label="Saved items" onPress={() => navigateAndClose("Later")} colors={colors} />

          <View style={[styles.sep, { backgroundColor: colors.primaryOverlayLight }]} />
          <NavItem label="Sign out" onPress={handleLogout} colors={colors} />
          <View style={{ height: verticalScale(20) }} />
        </ScrollView>
      </Animated.View>

      <CreateChannelModal
        visible={createChannelVisible}
        onClose={() => setCreateChannelVisible(false)}
        navigation={navigation}
      />
      <CategoryActionSheet
        visible={actionSheetVisible}
        onClose={() => {
          setActionSheetVisible(false);
          setActiveCategory(null);
        }}
        category={activeCategory}
        onAddChannels={(cat) => {
          setActionSheetVisible(false);
          setActiveCategory(cat);
          setCategoryModalMode('add');
          setManageCategoryVisible(true);
        }}
        onRemoveChannels={(cat) => {
          setActionSheetVisible(false);
          setActiveCategory(cat);
          setCategoryModalMode('remove');
          setManageCategoryVisible(true);
        }}
      />
      <ManageCategoryChannelsModal 
        visible={manageCategoryVisible} 
        onClose={() => {
          setManageCategoryVisible(false);
          setActiveCategory(null);
        }} 
        category={activeCategory}
        mode={categoryModalMode}
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
    right: scale(0),
    top: verticalScale(0),
    bottom: verticalScale(0),
    width: DRAWER_WIDTH,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
  },
  closeBtn: {
    padding: moderateScale(4),
  },
  wsHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(4),
    paddingBottom: verticalScale(2),
    gap: 4,
  },
  wsName: {
    fontSize: moderateScale(17),
    fontWeight: "800",
    flex: 1,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(6),
    gap: 6,
  },
  statusDot: {
    width: scale(8),
    height: verticalScale(8),
    borderRadius: moderateScale(4),
  },
  userName: {
    fontSize: moderateScale(14),
    fontWeight: "500",
    opacity: 0.7,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: scale(16),
    marginVertical: verticalScale(8),
  },
  emptyText: {
    fontSize: moderateScale(12),
    paddingHorizontal: scale(16),
    paddingLeft: scale(30),
    opacity: 0.5,
    fontStyle: 'italic',
    paddingVertical: verticalScale(4),
  }
});

export default DrawerNavigation;
