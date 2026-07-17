import React, { useCallback, useMemo, useState } from "react";
import { scale, verticalScale, moderateScale } from '../utils/responsive';

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SectionList,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  Platform,
  ScrollView,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppAvatar, HomeHeaderLoader } from "../components/common";
import FAB from "../components/common/FAB";
import AccountDrawer from "../components/AccountDrawer";
import CustomizeHomeModal from "../components/CustomizeHomeModal";
import CreateNewBottomSheet from "../components/CreateNewBottomSheet";
import { useUIStore } from "../stores/uiStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useAuthStore } from "../stores/authStore";
import { useThemeStore } from "../stores/themeStore";
import { useChannelStore } from "../stores/channelStore";
import { useThreadStore } from "../stores/threadStore";
import { useLaterStore } from "../stores/laterStore";
import { useDraftStore } from "../stores/draftStore";
import { useScheduledStore } from "../stores/scheduledStore";
import {
  Hash,
  Lock,
  Volume2,
  MessageSquare,
  Bookmark,
  Headphones,
  Layers,
  Plus,
  ChevronUp,
  ChevronDown,
  Menu,
  Settings,
  Send,
  Edit3,
  Clock,
} from "lucide-react-native";
import CreateChannelModal from "../components/CreateChannelModal";
import { useTranslation } from "../utils/i18n";

const SkeletonCard = ({ colors }) => (
  <View style={[qcStyles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
    <View style={[{ width: scale(20), height: verticalScale(20), borderRadius: moderateScale(10), opacity: 0.5, backgroundColor: colors.border }]} />
    <View style={[{ width: scale(50), height: verticalScale(10), borderRadius: moderateScale(4), opacity: 0.5, backgroundColor: colors.border }]} />
    <View style={[{ width: scale(30), height: verticalScale(8), borderRadius: moderateScale(4), opacity: 0.5, backgroundColor: colors.border }]} />
  </View>
);

const SkeletonRow = ({ colors }) => (
  <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: scale(16), paddingVertical: verticalScale(6), gap: 8, minHeight: verticalScale(36) }}>
    <View style={[{ width: scale(16), height: verticalScale(16), borderRadius: moderateScale(4), opacity: 0.5, backgroundColor: colors.border }]} />
    <View style={[{ width: scale(120), height: verticalScale(14), borderRadius: moderateScale(4), opacity: 0.5, backgroundColor: colors.border }]} />
  </View>
);

// ─── Quick Access Card ──────────────────────────────────────────────────────

const QuickCard = React.memo(
  ({ icon: Icon, label, subtitle, onPress, colors }) => (
    <TouchableOpacity
      style={[
        qcStyles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Icon size={20} color={colors.textSecondary} strokeWidth={1.5} />
      <Text style={[qcStyles.label, { color: colors.textPrimary }]}>
        {label}
      </Text>
      <Text style={[qcStyles.subtitle, { color: colors.textSecondary }]}>
        {subtitle}
      </Text>
    </TouchableOpacity>
  ),
);

const qcStyles = StyleSheet.create({
  card: {
    width: scale(88),
    height: scale(80),
    borderRadius: moderateScale(10),
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: scale(6),
    gap: 3,
  },
  label: {
    fontSize: moderateScale(12),
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    fontSize: moderateScale(11),
    textAlign: "center",
  },
});

// ─── Section Header ─────────────────────────────────────────────────────────

const SectionHeader = React.memo(
  ({ title, icon: Icon, sectionKey, isExpanded, onToggle, colors }) => (
    <TouchableOpacity
      style={shStyles.header}
      onPress={() => onToggle(sectionKey)}
      activeOpacity={0.7}
    >
      <View style={shStyles.left}>
        {Icon && <Icon size={14} color={colors.textPrimary} strokeWidth={2} />}
        <Text style={[shStyles.title, { color: colors.textPrimary }]}>
          {title}
        </Text>
      </View>
      {isExpanded ? (
        <ChevronUp size={16} color={colors.textSecondary} />
      ) : (
        <ChevronDown size={16} color={colors.textSecondary} />
      )}
    </TouchableOpacity>
  ),
);

const shStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(18),
    paddingBottom: verticalScale(6),
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: moderateScale(15),
    fontWeight: "800",
  },
});

// ─── Channel Row ────────────────────────────────────────────────────────────

const ChannelRow = React.memo(({ channel, unreadCount, onPress, colors }) => {
  const isPrivate = channel.visibility === "private";
  const isSystem = channel.type === "system";
  const Icon = isSystem ? Volume2 : isPrivate ? Lock : Hash;

  return (
    <TouchableOpacity
      style={chStyles.row}
      onPress={() => onPress(channel)}
      activeOpacity={0.5}
    >
      <Icon
        size={16}
        color={unreadCount > 0 ? colors.textPrimary : colors.textTertiary}
        strokeWidth={1.5}
      />
      <Text
        style={[
          chStyles.name,
          {
            color: unreadCount > 0 ? colors.textPrimary : colors.textSecondary,
            fontWeight: unreadCount > 0 ? "700" : "400",
            flex: 1,
          },
        ]}
        numberOfLines={1}
      >
        {channel.name}
      </Text>
      {unreadCount > 0 && (
        <View style={[chStyles.badge, { backgroundColor: colors.primary }]}>
          <Text style={[chStyles.badgeText, { color: colors.textOnPrimary }]}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

const chStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(6),
    gap: 8,
    minHeight: verticalScale(36),
  },
  name: {
    fontSize: moderateScale(15),
  },
  badge: {
    minWidth: scale(20),
    height: scale(20),
    borderRadius: moderateScale(10),
    paddingHorizontal: scale(6),
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    fontSize: moderateScale(11),
    fontWeight: "700",
  },
});

// ─── "+ Add channel" Row ────────────────────────────────────────────────────

const AddChannelRow = ({ onPress, colors }) => (
  <TouchableOpacity style={addStyles.row} onPress={onPress} activeOpacity={0.5}>
    <Plus size={16} color={colors.textTertiary} strokeWidth={1.5} />
    <Text style={[addStyles.text, { color: colors.textTertiary }]}>
      Add channel
    </Text>
  </TouchableOpacity>
);

const addStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(8),
    gap: 8,
  },
  text: {
    fontSize: moderateScale(14),
  },
});

// ─── DM Row ─────────────────────────────────────────────────────────────────

const DMRow = React.memo(
  ({ channel, unreadCount, onPress, colors, isSelf }) => {
    const dmUser = {
      _id: channel.dmRecipientId,
      name: channel.name,
      avatar: channel.avatar,
      onlineStatus: channel.onlineStatus || "offline",
    };

    return (
      <TouchableOpacity
        style={dmStyles.row}
        onPress={() => onPress(channel)}
        activeOpacity={0.5}
      >
        <AppAvatar user={dmUser} size={28} showStatus statusSize={8} />
        <Text
          style={[
            dmStyles.name,
            {
              color:
                unreadCount > 0 ? colors.textPrimary : colors.textSecondary,
              fontWeight: unreadCount > 0 ? "700" : "400",
              flex: 1,
            },
          ]}
          numberOfLines={1}
        >
          {isSelf ? "You" : channel.name}
        </Text>
        {unreadCount > 0 && (
          <View style={[dmStyles.badge, { backgroundColor: colors.primary }]}>
            <Text style={[dmStyles.badgeText, { color: colors.textOnPrimary }]}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  },
);

const dmStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(6),
    gap: 8,
    minHeight: verticalScale(40),
  },
  name: {
    fontSize: moderateScale(15),
  },
  badge: {
    minWidth: scale(20),
    height: scale(20),
    borderRadius: moderateScale(10),
    paddingHorizontal: scale(6),
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    fontSize: moderateScale(11),
    fontWeight: "700",
  },
});

// ─── Main Component ──────────────────────────────────────────────────────────

const HomeScreen = ({ navigation }) => {
  if (!navigation) navigation = { navigate: () => {} };

  const { colors, effectiveTheme } = useThemeStore();
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const { user, preferences } = useAuthStore();
  const { t } = useTranslation();
  const { enabledHomeCards, toggleHomeCard } = useUIStore();
  const channels = useChannelStore((s) => s.channels) || [];
  const fetchChannels = useChannelStore((s) => s.fetchChannels);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const unreads = useChannelStore((s) => s.unreads) || {};
  const starredIds = useChannelStore((s) => s.starredIds) || [];
  const [createChannelVisible, setCreateChannelVisible] = useState(false);
  const unreadThreadCount = useThreadStore((s) => s.unreadThreadCount) || 0;
  const fetchThreads = useThreadStore((s) => s.fetchThreads);
  const savedCount = useLaterStore((s) => s.savedCount) || 0;
  const fetchSavedMessages = useLaterStore((s) => s.fetchSavedMessages);
  const draftCount = useDraftStore((s) => s.draftCount) || 0;
  const fetchDrafts = useDraftStore((s) => s.fetchDrafts);
  const scheduledCount = useScheduledStore((s) => s.scheduledCount) || 0;
  const fetchScheduledMessages = useScheduledStore(
    (s) => s.fetchScheduledMessages,
  );

  const isChannelsLoading = useChannelStore((s) => s.isLoading);
  const isThreadsLoading = useThreadStore((s) => s.isLoading);

  const [refreshing, setRefreshing] = useState(false);
  const [sectionsExpanded, setSectionsExpanded] = useState({
    unreads: true,
    channels: true,
    dms: true,
  });
  const [error, setError] = useState(null);
  const [accountDrawerVisible, setAccountDrawerVisible] = useState(false);
  const [customizeModalVisible, setCustomizeModalVisible] = useState(false);
  const [createNewVisible, setCreateNewVisible] = useState(false);

  const loadData = useCallback(() => {
    if (!activeWorkspace?._id) return;
    setError(null);
    // Fetch independently without blocking
    fetchChannels?.().catch((err) => setError(err.message));
    fetchThreads?.().catch(console.error);
    fetchSavedMessages?.().catch(console.error);
    fetchDrafts?.(activeWorkspace?._id).catch(console.error);
    fetchScheduledMessages?.().catch(console.error);
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

  const toggleSection = useCallback((key) => {
    setSectionsExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
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

  // Categorize channels
  const { unreadConversations, regularChannels, regularDMs } = useMemo(() => {
    const unread = channels.filter((c) => (unreads[c._id] || 0) > 0);
    const regularCh = channels.filter((c) => c.type !== "dm" && (unreads[c._id] || 0) === 0);
    const regularD = channels.filter((c) => c.type === "dm" && (unreads[c._id] || 0) === 0);

    regularD.sort((a, b) => {
      const aIsSelf = a.dmRecipientId === user?._id;
      const bIsSelf = b.dmRecipientId === user?._id;
      if (aIsSelf && !bIsSelf) return -1;
      if (!aIsSelf && bIsSelf) return 1;
      const aTime = new Date(
        a.lastMessageAt || a.lastMessage?.createdAt || 0,
      ).getTime();
      const bTime = new Date(
        b.lastMessageAt || b.lastMessage?.createdAt || 0,
      ).getTime();
      return bTime - aTime;
    });

    return {
      unreadConversations: unread,
      regularChannels: regularCh,
      regularDMs: regularD,
    };
  }, [channels, unreads, user]);

  const sections = useMemo(() => {
    const result = [];
    
    // Inject skeletons for Channels & DMs if loading and empty
    const showSkeletons = isChannelsLoading && channels.length === 0;
    const skeletonData = showSkeletons 
      ? [{ _id: "skel1", isSkeleton: true }, { _id: "skel2", isSkeleton: true }, { _id: "skel3", isSkeleton: true }] 
      : [];

    if (unreadConversations.length > 0) {
      result.push({
        key: "unreads",
        title: t("Unreads"),
        icon: null,
        data: sectionsExpanded.unreads ? unreadConversations : [],
        type: "mixed",
        showAddChannel: false,
      });
    }
    result.push({
      key: "channels",
      title: t("Channels"),
      icon: Hash,
      data: sectionsExpanded.channels ? (showSkeletons ? skeletonData : regularChannels) : [],
      type: "channel",
      showAddChannel: true,
    });
    result.push({
      key: "dms",
      title: t("Direct Messages"),
      icon: null,
      data: sectionsExpanded.dms ? (showSkeletons ? skeletonData : regularDMs) : [],
      type: "dm",
      showAddChannel: false,
    });
    return result;
  }, [unreadConversations, regularChannels, regularDMs, sectionsExpanded, isChannelsLoading, channels.length, t]);

  const renderSectionHeader = useCallback(
    ({ section }) => (
      <SectionHeader
        title={section.title}
        icon={section.icon}
        sectionKey={section.key}
        isExpanded={sectionsExpanded[section.key] ?? true}
        onToggle={toggleSection}
        colors={colors}
      />
    ),
    [sectionsExpanded, toggleSection, colors],
  );

  const renderSectionFooter = useCallback(
    ({ section }) => {
      if (!section.showAddChannel || !sectionsExpanded[section.key])
        return null;
      return (
        <AddChannelRow
          onPress={() => setCreateChannelVisible(true)}
          colors={colors}
        />
      );
    },
    [sectionsExpanded, colors],
  );

  const renderItem = useCallback(
    ({ item, section }) => {
      if (item.isSkeleton) {
        return <SkeletonRow colors={colors} />;
      }
      const unreadCount = unreads[item._id] || 0;
      if (section.type === "dm" || (section.type === "mixed" && item.type === "dm")) {
        const isSelf = item.dmRecipientId === user?._id;
        return (
          <DMRow
            channel={item}
            unreadCount={unreadCount}
            onPress={handleDMPress}
            colors={colors}
            isSelf={isSelf}
          />
        );
      }
      return (
        <ChannelRow
          channel={item}
          unreadCount={unreadCount}
          onPress={handleChannelPress}
          colors={colors}
        />
      );
    },
    [unreads, handleChannelPress, handleDMPress, colors, user],
  );

  // Quick access cards
  const quickCardsTotal =
    unreadThreadCount + savedCount + draftCount + scheduledCount;

  // Filter cards based on user preferences
  const visibleCards = useMemo(() => {
    const isLoadingCards = isThreadsLoading && quickCardsTotal === 0;
    if (isLoadingCards) {
      return [
        { key: "skel1", isSkeleton: true },
        { key: "skel2", isSkeleton: true },
        { key: "skel3", isSkeleton: true },
        { key: "skel4", isSkeleton: true },
      ];
    }

    const cards = [];
    if (enabledHomeCards.catchUp !== false) {
      cards.push({
        key: "catchUp",
        icon: Layers,
        label: t("Catch Up"),
        subtitle: `${quickCardsTotal} new`,
        onPress: () => navigation.navigate("Threads"),
      });
    }
    if (enabledHomeCards.threads !== false) {
      cards.push({
        key: "threads",
        icon: MessageSquare,
        label: t("Threads"),
        subtitle: `${unreadThreadCount} new`,
        onPress: () => navigation.navigate("Threads"),
      });
    }
    if (enabledHomeCards.huddles !== false) {
      cards.push({
        key: "huddles",
        icon: Headphones,
        label: t("Huddles"),
        subtitle: t("0 live"),
        onPress: () => {},
      });
    }
    if (enabledHomeCards.later !== false) {
      cards.push({
        key: "later",
        icon: Bookmark,
        label: t("Later"),
        subtitle: `${savedCount} items`,
        onPress: () => navigation.navigate("Later"),
      });
    }
    if (enabledHomeCards.drafts !== false) {
      cards.push({
        key: "drafts",
        icon: Edit3,
        label: t("Drafts"),
        subtitle: `${draftCount} items`,
        onPress: () => navigation.navigate("Drafts"),
      });
    }
    if (enabledHomeCards.scheduled !== false) {
      cards.push({
        key: "scheduled",
        icon: Clock,
        label: t("Scheduled"),
        subtitle: `${scheduledCount} items`,
        onPress: () => navigation.navigate("Scheduled"),
      });
    }
    if (enabledHomeCards.settings !== false) {
      cards.push({
        key: "settings",
        icon: Settings,
        label: t("Settings"),
        subtitle: t("Customize"),
        onPress: () => setCustomizeModalVisible(true),
      });
    }
    return cards;
  }, [
    enabledHomeCards,
    quickCardsTotal,
    unreadThreadCount,
    savedCount,
    draftCount,
    scheduledCount,
    navigation,
    isThreadsLoading,
    t,
  ]);

  const ListHeader = useMemo(
    () => (
      <View style={{ backgroundColor: colors.backgroundSecondary }}>
        {visibleCards.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardsRow}
            style={{ backgroundColor: colors.backgroundSecondary }}
          >
            {visibleCards.map((card) =>
              card.isSkeleton ? (
                <SkeletonCard key={card.key} colors={colors} />
              ) : (
                <QuickCard
                  key={card.key}
                  icon={card.icon}
                  label={card.label}
                  subtitle={card.subtitle}
                  onPress={card.onPress}
                  colors={colors}
                />
              )
            )}
          </ScrollView>
        )}
      </View>
    ),
    [visibleCards, colors],
  );

  if (error) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.textPrimary }]}>
            {t("Error loading data")}
          </Text>
          <TouchableOpacity
            style={[styles.errorBtn, { backgroundColor: colors.primary }]}
            onPress={loadData}
          >
            <Text style={{ color: colors.textInverse, fontWeight: "600" }}>
              {t("Try Again")}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.backgroundSecondary },
      ]}
    >
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* ─── Dark Header Bar ─── */}
      <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.primary }}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerLeft}
            onPress={() => navigation.navigate("WorkspaceSwitcher")}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.wsLogo,
                { backgroundColor: colors.primaryOverlay },
              ]}
            >
              <Image
                source={require("../../assets/logo.png")}
                style={styles.logo}
              />
            </View>
            <Text
              style={[styles.wsName, { color: colors.textOnPrimary }]}
              numberOfLines={1}
            >
              {activeWorkspace?.name || t("Workspace")}
            </Text>
          </TouchableOpacity>

          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => setAccountDrawerVisible(true)}>
              <AppAvatar user={user} size={30} showStatus statusSize={8} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Dynamic Header Loader */}
        {(isChannelsLoading || isThreadsLoading || refreshing) && (
          <HomeHeaderLoader colors={colors} />
        )}
      </SafeAreaView>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        renderSectionFooter={renderSectionFooter}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={<View style={{ height: scale(100) }} />}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        initialNumToRender={20}
        maxToRenderPerBatch={10}
        windowSize={11}
        removeClippedSubviews={Platform.OS !== "web"}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="transparent"
            colors={["transparent"]}
            progressBackgroundColor="transparent"
          />
        }
        style={{ backgroundColor: colors.backgroundSecondary }}
      />

      {/* Floating "+" button for create new menu */}
      <FAB onPress={() => setCreateNewVisible(true)} />

      <AccountDrawer
        visible={accountDrawerVisible}
        onClose={() => setAccountDrawerVisible(false)}
        navigation={navigation}
      />

      <CustomizeHomeModal
        visible={customizeModalVisible}
        onClose={() => setCustomizeModalVisible(false)}
        enabledCards={enabledHomeCards}
        onToggleCard={toggleHomeCard}
      />

      <CreateNewBottomSheet
        visible={createNewVisible}
        onClose={() => setCreateNewVisible(false)}
        navigation={navigation}
      />

      <CreateChannelModal
        visible={createChannelVisible}
        onClose={() => setCreateChannelVisible(false)}
        navigation={navigation}
        onCreated={(channel) => {
          console.log("Channel created:", channel?.name);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(10),
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 8,
  },
  wsLogo: {
    width: scale(28),
    height: scale(28),
    borderRadius: moderateScale(6),
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: scale(22),
    height: scale(22),
    resizeMode: "contain",
  },
  wsLogoText: {
    fontSize: moderateScale(14),
    fontWeight: "800",
  },
  wsName: {
    fontSize: moderateScale(16),
    fontWeight: "800",
    flex: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingsBtn: {
    padding: moderateScale(4),
  },
  menuBtn: {
    borderRadius: moderateScale(16),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(6),
  },
  cardsRow: {
    flexDirection: "row",
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(14),
    gap: 10,
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
    padding: moderateScale(20),
    gap: 12,
  },
  errorText: { fontSize: moderateScale(16), fontWeight: "600" },
  errorBtn: {
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(6),
  },
  fab: {
    position: "absolute",
    right: scale(20),
    bottom: verticalScale(20),
    width: scale(52),
    height: scale(52),
    borderRadius: moderateScale(26),
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowOffset: { width: scale(0), height: scale(2) },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});

export default HomeScreen;
