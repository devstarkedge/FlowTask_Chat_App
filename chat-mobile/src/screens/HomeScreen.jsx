import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  SectionList,
  ScrollView,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  Image,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

import WorkspaceSwitcher from "../components/WorkspaceSwitcher";
import AccountDrawer from "../components/AccountDrawer";
import DMListItem from "../components/DMListItem";
import WorkspaceAvatar from "../components/WorkspaceAvatar";
import Avatar from "../components/Avatar";

import { useWorkspaceStore } from "../stores/workspaceStore";
import { useAuthStore } from "../stores/authStore";
import { useThemeStore } from "../stores/themeStore";
import { useChannelStore } from "../stores/channelStore";
import { useThreadStore } from "../stores/threadStore";
import { useLaterStore } from "../stores/laterStore";
import { useDraftStore } from "../stores/draftStore";
import { useScheduledStore } from "../stores/scheduledStore";

import {
  MessageSquare,
  Bookmark,
  Edit3,
  Clock,
  Hash,
  Lock,
  Volume2,
  CircleChevronDown ,
  Plus,
} from "lucide-react-native";

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

// ─── Extracted Sub-Components ────────────────────────────────────────────────

const QuickActionCard = React.memo(
  ({ icon: Icon, title, count, onPress, color, index }) => {
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(
      () => ({ transform: [{ scale: scale.value }] }),
      [],
    );

    return (
      <Animated.View entering={FadeInDown.delay(index * 100).springify()}>
        <AnimatedTouchable
          style={[hqStyles.quickCard, animatedStyle]}
          onPressIn={() => {
            scale.value = withSpring(0.95);
          }}
          onPressOut={() => {
            scale.value = withSpring(1);
          }}
          onPress={onPress}
          activeOpacity={1}
        >
          <View
            style={[hqStyles.quickCardIcon, { backgroundColor: color + "15" }]}
          >
            <Icon size={20} color={color} strokeWidth={2} />
          </View>
          <Text style={[hqStyles.quickCardTitle, { color }]}>{title}</Text>
          <Text style={hqStyles.quickCardCount}>
            {count} {count === 1 ? "item" : "items"}
          </Text>
        </AnimatedTouchable>
      </Animated.View>
    );
  },
);

const hqStyles = StyleSheet.create({
  quickCard: {
    width: 85,
    padding: 5,
    borderRadius: 16,
    gap: 10,
    boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.08)",
    elevation: 3,
  },
  quickCardIcon: {
    width: 20,
    height: 20,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  quickCardTitle: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
    alognItems: "center"
  },
  quickCardCount: {
    fontSize: 13,
    fontWeight: "500",
  },
});

const ChannelItem = React.memo(({ channel, unreadCount, onPress, colors }) => {
  const isSystem = channel.type === "system";
  const isPrivate = channel.visibility === "private";
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(
    () => ({
      transform: [{ scale: scale.value }],
    }),
    [],
  );

  const IconComponent = isSystem ? Volume2 : isPrivate ? Lock : Hash;
  const iconSize = isSystem ? 16 : isPrivate ? 16 : 18;

  return (
    <AnimatedTouchable
      style={[ciStyles.channelItem, animatedStyle]}
      onPressIn={() => {
        scale.value = withTiming(0.98);
      }}
      onPressOut={() => {
        scale.value = withTiming(1);
      }}
      onPress={() => onPress(channel)}
      activeOpacity={1}
    >
      <View style={ciStyles.channelIconContainer}>
        <View style={[ciStyles.iconWrapper, { backgroundColor: colors.card }]}>
          <IconComponent
            size={iconSize}
            color={colors.textPrimary}
            strokeWidth={2}
          />
        </View>
      </View>
      <View style={ciStyles.channelInfo}>
        <Text
          style={[
            ciStyles.channelName,
            {
              color:
                unreadCount > 0 ? colors.textPrimary : colors.textSecondary,
            },
            unreadCount > 0 && ciStyles.unreadName,
          ]}
          numberOfLines={1}
        >
          {channel.name}
        </Text>
        {!!channel.lastMessagePreview && (
          <Text
            style={[ciStyles.lastMessage, { color: colors.textTertiary }]}
            numberOfLines={1}
          >
            {channel.lastMessagePreview}
          </Text>
        )}
      </View>
      {unreadCount > 0 && (
        <Animated.View
          entering={FadeIn}
          style={[
            ciStyles.unreadBadge,
            { backgroundColor: colors.badgeBackground },
          ]}
        >
          <Text style={[ciStyles.unreadText, { color: colors.badgeText }]}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </Text>
        </Animated.View>
      )}
    </AnimatedTouchable>
  );
});

const ciStyles = StyleSheet.create({
  channelItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    marginHorizontal: 12,
    marginVertical: 2,
    borderRadius: 12,
  },
  channelIconContainer: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  channelInfo: { flex: 1 },
  channelName: { fontSize: 15, fontWeight: "500" },
  unreadName: { fontWeight: "700" },
  lastMessage: { fontSize: 13, marginTop: 2 },
  unreadBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadText: { fontSize: 12, fontWeight: "700" },
});

const DMItemRow = React.memo(({ channel, unreadCount, onPress, colors }) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(
    () => ({ transform: [{ scale: scale.value }] }),
    [],
  );

  return (
    <AnimatedTouchable
      style={[ciStyles.channelItem, animatedStyle]}
      onPressIn={() => {
        scale.value = withTiming(0.98);
      }}
      onPressOut={() => {
        scale.value = withTiming(1);
      }}
      onPress={() => onPress(channel)}
      activeOpacity={1}
    >
      <DMListItem
        channel={channel}
        onPress={onPress}
        unreadCount={unreadCount}
        touchable={false}
        containerStyle={{
          paddingHorizontal: 0,
          paddingVertical: 0,
          backgroundColor: "transparent",
        }}
      />
    </AnimatedTouchable>
  );
});

const SectionHeader = React.memo(
  ({ title, count, icon: Icon, section, isExpanded, onToggle, colors }) => {
    const rotation = useSharedValue(isExpanded ? 0 : -90);

    React.useEffect(() => {
      rotation.value = withTiming(isExpanded ? 0 : -90);
    }, [isExpanded]);

    const animatedStyle = useAnimatedStyle(
      () => ({ transform: [{ rotate: `${rotation.value}deg` }] }),
      [],
    );

    return (
      <TouchableOpacity
        style={[
          shStyles.sectionHeader,
          { backgroundColor: colors.backgroundSecondary },
        ]}
        onPress={() => onToggle(section)}
        activeOpacity={0.7}
      >
        <View style={shStyles.leftGroup}>
          <Animated.View style={animatedStyle}>
            <CircleChevronDown 
              size={16}
              color={colors.textSecondary}
              strokeWidth={2.5}
            />
          </Animated.View>
          {Icon && (
            <Icon size={16} color={colors.textPrimary} strokeWidth={2.5} />
          )}
          <Text style={[shStyles.sectionTitle, { color: colors.textPrimary }]}>
            {title}
          </Text>
        </View>
        {count > 0 && (
          <View style={[shStyles.countBadge, { backgroundColor: colors.card }]}>
            <Text
              style={[shStyles.sectionCount, { color: colors.textSecondary }]}
            >
              {count}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  },
);

const shStyles = StyleSheet.create({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginVertical: 8,
    marginHorizontal: 12,
    borderRadius: 12,
    gap: 8,
  },
  leftGroup: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sectionCount: { fontSize: 12, fontWeight: "600" },
});

// ─── Main Component ──────────────────────────────────────────────────────────

const HomeScreen = ({ navigation }) => {
  if (!navigation) {
    navigation = { navigate: () => {} };
  }

  const { colors, effectiveTheme } = useThemeStore();
  const activeWorkspace = useWorkspaceStore((state) => state.activeWorkspace);
  const { user } = useAuthStore();
  const channels = useChannelStore((state) => state.channels) || [];
  const fetchChannels = useChannelStore((state) => state.fetchChannels);
  const setActiveChannel = useChannelStore((state) => state.setActiveChannel);
  const unreads = useChannelStore((state) => state.unreads) || {};
  const unreadThreadCount =
    useThreadStore((state) => state.unreadThreadCount) || 0;
  const fetchThreads = useThreadStore((state) => state.fetchThreads);
  const savedCount = useLaterStore((state) => state.savedCount) || 0;
  const fetchSavedMessages = useLaterStore((state) => state.fetchSavedMessages);
  const draftCount = useDraftStore((state) => state.draftCount) || 0;
  const fetchDrafts = useDraftStore((state) => state.fetchDrafts);
  const scheduledCount =
    useScheduledStore((state) => state.scheduledCount) || 0;
  const fetchScheduledMessages = useScheduledStore(
    (state) => state.fetchScheduledMessages,
  );

  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [workspaceSwitcherVisible, setWorkspaceSwitcherVisible] =
    useState(false);
  const [accountDrawerVisible, setAccountDrawerVisible] = useState(false);
  const [sectionsExpanded, setSectionsExpanded] = useState({
    system: true,
    public: true,
    private: true,
    dms: true,
  });
  const [error, setError] = useState(null);

  const fabScale = useSharedValue(1);

  // Load data on workspace change
  const loadData = useCallback(async () => {
    if (!activeWorkspace?._id) {
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      await Promise.all([
        fetchChannels?.() || Promise.resolve(),
        fetchThreads?.() || Promise.resolve(),
        fetchSavedMessages?.() || Promise.resolve(),
        fetchDrafts?.(activeWorkspace?._id) || Promise.resolve(),
        fetchScheduledMessages?.() || Promise.resolve(),
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [
    activeWorkspace?._id,
    fetchChannels,
    fetchThreads,
    fetchSavedMessages,
    fetchDrafts,
    fetchScheduledMessages,
  ]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const toggleSection = useCallback((section) => {
    setSectionsExpanded((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const handleChannelPress = useCallback(
    (channel) => {
      navigation.navigate("Chat", {
        channelId: channel._id,
        channelName: channel.name,
      });
    },
    [navigation],
  );

  const handleDMPress = useCallback(
    (channel) => {
      setActiveChannel(channel._id);
      navigation.navigate("Chat", {
        channelId: channel._id,
        channelName: channel.name,
      });
    },
    [navigation, setActiveChannel],
  );

  // Memoized channel categories
  const { systemChannels, publicChannels, privateChannels, dms } =
    useMemo(() => {
      const system = [];
      const pub = [];
      const priv = [];
      const dm = [];
      for (const ch of channels) {
        if (ch.type === "system") system.push(ch);
        else if (ch.type === "dm") dm.push(ch);
        else if (ch.visibility === "private") priv.push(ch);
        else pub.push(ch);
      }
      return {
        systemChannels: system,
        publicChannels: pub,
        privateChannels: priv,
        dms: dm,
      };
    }, [channels]);

  // Build SectionList data
  const sections = useMemo(() => {
    const result = [];
    if (systemChannels.length > 0) {
      result.push({
        key: "system",
        title: "SYSTEM CHANNELS",
        icon: Volume2,
        data: sectionsExpanded.system ? systemChannels : [],
        count: systemChannels.length,
        type: "channel",
      });
    }
    result.push({
      key: "public",
      title: "CHANNELS",
      icon: Hash,
      data: sectionsExpanded.public ? publicChannels : [],
      count: publicChannels.length,
      type: "channel",
    });
    if (privateChannels.length > 0) {
      result.push({
        key: "private",
        title: "PRIVATE CHANNELS",
        icon: Lock,
        data: sectionsExpanded.private ? privateChannels : [],
        count: privateChannels.length,
        type: "channel",
      });
    }
    result.push({
      key: "dms",
      title: "DIRECT MESSAGES",
      icon: MessageSquare,
      data: sectionsExpanded.dms ? dms : [],
      count: dms.length,
      type: "dm",
    });
    return result;
  }, [systemChannels, publicChannels, privateChannels, dms, sectionsExpanded]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const fabAnimatedStyle = useAnimatedStyle(
    () => ({ transform: [{ scale: fabScale.value }] }),
    [],
  );

  const renderSectionHeader = useCallback(
    ({ section }) => (
      <SectionHeader
        title={section.title}
        count={section.count}
        icon={section.icon}
        section={section.key}
        isExpanded={sectionsExpanded[section.key]}
        onToggle={toggleSection}
        colors={colors}
      />
    ),
    [sectionsExpanded, toggleSection, colors],
  );

  const renderItem = useCallback(
    ({ item, section }) => {
      const unreadCount = unreads[item._id] || 0;
      if (section.type === "dm") {
        return (
          <DMItemRow
            channel={item}
            unreadCount={unreadCount}
            onPress={handleDMPress}
            colors={colors}
          />
        );
      }
      return (
        <ChannelItem
          channel={item}
          unreadCount={unreadCount}
          onPress={handleChannelPress}
          colors={colors}
        />
      );
    },
    [unreads, handleChannelPress, handleDMPress, colors],
  );

  const keyExtractor = useCallback((item) => item._id, []);

  const ListHeaderComponent = useMemo(
    () => (
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
            onPress={() => navigation.navigate("Threads")}
            index={0}
          />
          <QuickActionCard
            icon={Bookmark}
            title="Later"
            count={savedCount}
            color={colors.warning}
            onPress={() => navigation.navigate("Later")}
            index={2}
          />
          <QuickActionCard
            icon={Edit3}
            title="Drafts"
            count={draftCount}
            color={colors.success}
            onPress={() => navigation.navigate("Drafts")}
            index={3}
          />
          <QuickActionCard
            icon={Clock}
            title="Scheduled"
            count={scheduledCount}
            color={colors.error}
            onPress={() => navigation.navigate("Scheduled")}
            index={4}
          />
        </ScrollView>
      </View>
    ),
    [
      unreadThreadCount,
      savedCount,
      draftCount,
      scheduledCount,
      colors,
      navigation,
      styles,
    ],
  );

  if (error) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.textPrimary }]}>
            Error loading data
          </Text>
          <Text style={[styles.errorSubtext, { color: colors.textSecondary }]}>
            {error}
          </Text>
          <TouchableOpacity
            style={[styles.errorButton, { backgroundColor: colors.primary }]}
            onPress={loadData}
          >
            <Text style={{ color: colors.messageTextSent, fontWeight: "600" }}>
              Try Again
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <StatusBar
        barStyle={effectiveTheme === "dark" ? "light-content" : "dark-content"}
      />

      <LinearGradient
        colors={colors.headerGradient || [colors.primary, colors.primaryHover]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.workspaceInfo}
            onPress={() => setWorkspaceSwitcherVisible(true)}
            activeOpacity={0.8}
          >
            <Image
              source={require("../../assets/logo.png")}
              style={styles.logo}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.workspaceName} numberOfLines={1}>
                {activeWorkspace?.name || "Workspace"}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.avatarButton}
            onPress={() => setAccountDrawerVisible(true)}
            activeOpacity={0.8}
          >
            <Avatar user={user} size={40} showStatus />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <WorkspaceSwitcher
        visible={workspaceSwitcherVisible}
        onClose={() => setWorkspaceSwitcherVisible(false)}
        navigation={navigation}
      />

      <AccountDrawer
        visible={accountDrawerVisible}
        onClose={() => setAccountDrawerVisible(false)}
        navigation={navigation}
      />

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          ListHeaderComponent={ListHeaderComponent}
          ListFooterComponent={<View style={{ height: 100 }} />}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        />
      )}

      <AnimatedTouchable
        style={[
          styles.fab,
          { backgroundColor: colors.primary },
          fabAnimatedStyle,
        ]}
        onPressIn={() => {
          fabScale.value = withSpring(0.9);
        }}
        onPressOut={() => {
          fabScale.value = withSpring(1);
        }}
        onPress={() => navigation.navigate("CreateMessage")}
        activeOpacity={1}
      >
        <Plus size={28} color={colors.messageTextSent} strokeWidth={2.5} />
      </AnimatedTouchable>
    </SafeAreaView>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1 },
    headerGradient: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 14,
      borderBottomLeftRadius: 20,
      borderBottomRightRadius: 20,
      boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.2)",
      elevation: 8,
    },
    headerContent: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    workspaceInfo: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1,
    },
    logo: {
      width: 40,
      height: 40,
      borderRadius: 8,
    },
    workspaceName: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.messageTextSent,
    },
    avatarButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
    },
    loaderContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    errorContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    errorText: { fontSize: 18, fontWeight: "600", marginBottom: 10 },
    errorSubtext: { fontSize: 14, marginBottom: 20, textAlign: "center" },
    errorButton: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 8,
    },
    quickActionsSection: {
      paddingVertical: 20,
    },
    quickActionsScroll: {
      paddingHorizontal: 12,
      gap: 12,
    },
    fab: {
      position: "absolute",
      bottom: 24,
      right: 24,
      width: 60,
      height: 60,
      borderRadius: 30,
      justifyContent: "center",
      alignItems: "center",
      boxShadow: "0px 6px 12px rgba(0, 0, 0, 0.3)",
      elevation: 12,
    },
  });

export default HomeScreen;
