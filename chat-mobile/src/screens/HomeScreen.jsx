import React, { useEffect, useState } from "react";
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
} from "react-native";
import Animated, {
  FadeInDown,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

import WorkspaceSwitcher from "../components/WorkspaceSwitcher";
import AccountDrawer from "../components/AccountDrawer";

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
  ChevronRight,
  ChevronDown,
  Plus,
  Headphones,
} from "lucide-react-native";

let connectSocket = () => {};
try {
  const socketModule = require("../services/socket");
  connectSocket = socketModule.connectSocket || (() => {});
} catch (e) {
  console.warn("Socket service not found");
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

const HomeScreen = ({ navigation }) => {
  if (!navigation) {
    navigation = { navigate: () => {} };
  }

  const { colors, effectiveTheme } = useThemeStore();
  const activeWorkspace = useWorkspaceStore((state) => state.activeWorkspace);
  const fetchWorkspaces = useWorkspaceStore((state) => state.fetchWorkspaces);
  const { user } = useAuthStore();
  const channels = useChannelStore((state) => state.channels) || [];
  const fetchChannels = useChannelStore((state) => state.fetchChannels);
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

  useEffect(() => {
    if (!activeWorkspace?._id) {
      setIsLoading(false);
      return;
    }
    loadData();
    try {
      connectSocket();
    } catch (e) {
      console.warn("Socket connection failed");
    }
  }, [activeWorkspace?._id]);

  const loadData = async () => {
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
    } catch (error) {
      console.error("Error loading data:", error);
      setError(error.message);
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
    setSectionsExpanded((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const systemChannels = channels.filter((ch) => ch.type === "system");
  const publicChannels = channels.filter(
    (ch) =>
      ch.type !== "dm" && ch.type !== "system" && ch.visibility !== "private",
  );
  const privateChannels = channels.filter(
    (ch) =>
      ch.type !== "dm" && ch.type !== "system" && ch.visibility === "private",
  );
  const dms = channels.filter((ch) => ch.type === "dm");

  const styles = createStyles(colors);

  const QuickActionCard = ({
    icon: Icon,
    title,
    count,
    onPress,
    color,
    index,
  }) => {
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(
      () => ({
        transform: [{ scale: scale.value }],
      }),
      [],
    );

    return (
      <Animated.View entering={FadeInDown.delay(index * 100).springify()}>
        <AnimatedTouchable
          style={[styles.quickCard, animatedStyle]}
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
            style={[styles.quickCardIcon, { backgroundColor: color + "15" }]}
          >
            <Icon size={20} color={color} strokeWidth={2} />
          </View>
          <Text style={[styles.quickCardTitle, { color: colors.textPrimary }]}>
            {title}
          </Text>
          <Text
            style={[styles.quickCardCount, { color: colors.textSecondary }]}
          >
            {count} {count === 1 ? "item" : "items"}
          </Text>
        </AnimatedTouchable>
      </Animated.View>
    );
  };

  const ChannelItem = ({ channel, index }) => {
    const unreadCount = unreads[channel._id] || 0;
    const isDM = channel.type === "dm";
    const isSystem = channel.type === "system";
    const isPrivate = channel.visibility === "private";
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(
      () => ({
        transform: [{ scale: scale.value }],
        backgroundColor: interpolate(
          scale.value,
          [0.98, 1],
          [colors.backgroundSecondary, colors.background],
        ),
      }),
      [colors.backgroundSecondary, colors.background],
    );

    return (
      <Animated.View entering={FadeIn.delay(index * 30)}>
        <AnimatedTouchable
          style={[styles.channelItem, animatedStyle]}
          onPressIn={() => {
            scale.value = withTiming(0.98);
          }}
          onPressOut={() => {
            scale.value = withTiming(1);
          }}
          onPress={() =>
            navigation.navigate("Chat", {
              channelId: channel._id,
              channelName: channel.name,
            })
          }
          activeOpacity={1}
        >
          <View style={styles.channelIconContainer}>
            {isDM ? (
              <View
                style={[
                  styles.avatarPlaceholder,
                  { backgroundColor: colors.card },
                ]}
              >
                <Text
                  style={[styles.avatarText, { color: colors.textPrimary }]}
                >
                  {channel.name?.substring(0, 1).toUpperCase()}
                </Text>
                <View
                  style={[
                    styles.statusIndicator,
                    { backgroundColor: colors.online },
                  ]}
                />
              </View>
            ) : isSystem ? (
              <View
                style={[styles.iconWrapper, { backgroundColor: colors.card }]}
              >
                <Volume2 size={16} color={colors.textPrimary} strokeWidth={2} />
              </View>
            ) : isPrivate ? (
              <View
                style={[styles.iconWrapper, { backgroundColor: colors.card }]}
              >
                <Lock size={16} color={colors.textPrimary} strokeWidth={2} />
              </View>
            ) : (
              <View
                style={[styles.iconWrapper, { backgroundColor: colors.card }]}
              >
                <Hash size={18} color={colors.textPrimary} strokeWidth={2} />
              </View>
            )}
          </View>

          <View style={styles.channelInfo}>
            <Text
              style={[
                styles.channelName,
                {
                  color:
                    unreadCount > 0 ? colors.textPrimary : colors.textSecondary,
                },
                unreadCount > 0 && styles.unreadName,
              ]}
              numberOfLines={1}
            >
              {channel.name}
            </Text>
            {!!channel.lastMessagePreview && (
              <Text
                style={[styles.lastMessage, { color: colors.textTertiary }]}
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
                styles.unreadBadge,
                { backgroundColor: colors.badgeBackground },
              ]}
            >
              <Text style={[styles.unreadText, { color: colors.badgeText }]}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </Animated.View>
          )}
        </AnimatedTouchable>
      </Animated.View>
    );
  };

  const SectionHeader = ({ title, count, icon: Icon, section }) => {
    const rotation = useSharedValue(sectionsExpanded[section] ? 0 : -90);

    useEffect(() => {
      rotation.value = withTiming(sectionsExpanded[section] ? 0 : -90);
    }, [sectionsExpanded[section]]);

    const animatedStyle = useAnimatedStyle(
      () => ({
        transform: [{ rotate: `${rotation.value}deg` }],
      }),
      [],
    );

    return (
      <TouchableOpacity
        style={[
          styles.sectionHeader,
          { backgroundColor: colors.backgroundSecondary },
        ]}
        onPress={() => toggleSection(section)}
        activeOpacity={0.7}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flex: 1,
            gap: 10,
          }}
        >
          <Animated.View style={animatedStyle}>
            <ChevronDown
              size={16}
              color={colors.textSecondary}
              strokeWidth={2.5}
            />
          </Animated.View>
          {Icon && (
            <Icon size={16} color={colors.textPrimary} strokeWidth={2.5} />
          )}
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            {title}
          </Text>
        </View>
        {count > 0 && (
          <View style={[styles.countBadge, { backgroundColor: colors.card }]}>
            <Text
              style={[styles.sectionCount, { color: colors.textSecondary }]}
            >
              {count}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const fabAnimatedStyle = useAnimatedStyle(
    () => ({
      transform: [{ scale: fabScale.value }],
    }),
    [],
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
            <Text style={{ color: "#FFFFFF", fontWeight: "600" }}>
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
            <View
              style={[
                styles.workspaceLogo,
                { backgroundColor: "rgba(255,255,255,0.3)" },
              ]}
            >
              <Text style={styles.workspaceLogoText}>
                {activeWorkspace?.name?.substring(0, 1).toUpperCase() || "W"}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.workspaceName} numberOfLines={1}>
                {activeWorkspace?.name || "Workspace"}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.userAvatarButton}
            onPress={() => setAccountDrawerVisible(true)}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.userAvatar,
                { backgroundColor: "rgba(255,255,255,0.3)" },
              ]}
            >
              <Text style={styles.userAvatarText}>
                {user?.name?.substring(0, 1).toUpperCase() || "U"}
              </Text>
              <View
                style={[
                  styles.statusIndicatorSmall,
                  { backgroundColor: colors.online },
                ]}
              />
            </View>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {WorkspaceSwitcher && (
        <WorkspaceSwitcher
          visible={workspaceSwitcherVisible}
          onClose={() => setWorkspaceSwitcherVisible(false)}
          navigation={navigation}
        />
      )}

      {AccountDrawer && (
        <AccountDrawer
          visible={accountDrawerVisible}
          onClose={() => setAccountDrawerVisible(false)}
          navigation={navigation}
        />
      )}

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
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
              {/* <QuickActionCard
                icon={Headphones}
                title="Huddles"
                count={0}
                color={colors.info}
                onPress={() => navigation.navigate('Huddles')}
                index={1}
              /> */}
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

          <View style={styles.channelsSection}>
            {systemChannels.length > 0 && (
              <>
                <SectionHeader
                  title="SYSTEM CHANNELS"
                  count={systemChannels.length}
                  icon={Volume2}
                  section="system"
                />
                {sectionsExpanded.system &&
                  systemChannels.map((ch, idx) => (
                    <ChannelItem key={ch._id} channel={ch} index={idx} />
                  ))}
              </>
            )}

            <SectionHeader
              title="CHANNELS"
              count={publicChannels.length}
              icon={Hash}
              section="public"
            />
            {sectionsExpanded.public &&
              publicChannels.map((ch, idx) => (
                <ChannelItem key={ch._id} channel={ch} index={idx} />
              ))}

            {privateChannels.length > 0 && (
              <>
                <SectionHeader
                  title="PRIVATE CHANNELS"
                  count={privateChannels.length}
                  icon={Lock}
                  section="private"
                />
                {sectionsExpanded.private &&
                  privateChannels.map((ch, idx) => (
                    <ChannelItem key={ch._id} channel={ch} index={idx} />
                  ))}
              </>
            )}

            <SectionHeader
              title="DIRECT MESSAGES"
              count={dms.length}
              icon={MessageSquare}
              section="dms"
            />
            {sectionsExpanded.dms &&
              dms.map((ch, idx) => (
                <ChannelItem key={ch._id} channel={ch} index={idx} />
              ))}
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
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
        <Plus size={28} color="#FFFFFF" strokeWidth={2.5} />
      </AnimatedTouchable>
    </SafeAreaView>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    headerGradient: {
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderBottomLeftRadius: 20,
      borderBottomRightRadius: 20,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 10,
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
    workspaceLogo: {
      width: 42,
      height: 42,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.4)",
    },
    workspaceLogoText: {
      fontWeight: "800",
      fontSize: 18,
      color: "#FFFFFF",
    },
    workspaceName: {
      fontSize: 17,
      fontWeight: "700",
      color: "#FFFFFF",
    },
    userAvatarButton: {
      marginLeft: 4,
    },
    userAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
      position: "relative",
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.4)",
    },
    userAvatarText: {
      fontSize: 16,
      fontWeight: "700",
      color: "#FFFFFF",
    },
    statusIndicatorSmall: {
      position: "absolute",
      bottom: -2,
      right: -2,
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2.5,
      borderColor: "white",
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
    errorText: {
      fontSize: 18,
      fontWeight: "600",
      marginBottom: 10,
    },
    errorSubtext: {
      fontSize: 14,
      marginBottom: 20,
      textAlign: "center",
    },
    errorButton: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 8,
    },
    quickActionsSection: {
      paddingVertical: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    quickActionsScroll: {
      paddingHorizontal: 12,
      gap: 12,
    },
    quickCard: {
      width: 120,
      padding: 14,
      borderRadius: 16,
      gap: 10,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    quickCardIcon: {
      width: 48,
      height: 48,
      borderRadius: 14,
      justifyContent: "center",
      alignItems: "center",
    },
    quickCardTitle: {
      fontSize: 15,
      fontWeight: "600",
      marginTop: 4,
    },
    quickCardCount: {
      fontSize: 13,
      fontWeight: "500",
    },
    channelsSection: {
      paddingBottom: 20,
    },
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
    sectionCount: {
      fontSize: 12,
      fontWeight: "600",
    },
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
    avatarPlaceholder: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: "center",
      alignItems: "center",
      position: "relative",
    },
    avatarText: {
      fontSize: 14,
      fontWeight: "600",
    },
    statusIndicator: {
      position: "absolute",
      bottom: -2,
      right: -2,
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: "white",
    },
    iconWrapper: {
      width: 36,
      height: 36,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
    },
    channelInfo: {
      flex: 1,
    },
    channelName: {
      fontSize: 15,
      fontWeight: "500",
    },
    unreadName: {
      fontWeight: "700",
    },
    lastMessage: {
      fontSize: 13,
      marginTop: 2,
    },
    unreadBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      minWidth: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    unreadText: {
      fontSize: 12,
      fontWeight: "700",
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
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 12,
    },
  });

export default HomeScreen;
