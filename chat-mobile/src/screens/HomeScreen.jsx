import React, { useCallback, useMemo, useState } from "react";
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
import { AppAvatar } from "../components/common";
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
    width: 88,
    height: 80,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
    gap: 3,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 11,
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
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 6,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 15,
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
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
    minHeight: 36,
  },
  name: {
    fontSize: 15,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    fontSize: 11,
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  text: {
    fontSize: 14,
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
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
    minHeight: 40,
  },
  name: {
    fontSize: 15,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
});

// ─── Main Component ──────────────────────────────────────────────────────────

const HomeScreen = ({ navigation }) => {
  if (!navigation) navigation = { navigate: () => {} };

  const { colors, effectiveTheme } = useThemeStore();
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const { user } = useAuthStore();
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

  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sectionsExpanded, setSectionsExpanded] = useState({
    unreads: true,
    channels: true,
    dms: true,
  });
  const [error, setError] = useState(null);
  const [accountDrawerVisible, setAccountDrawerVisible] = useState(false);
  const [customizeModalVisible, setCustomizeModalVisible] = useState(false);
  const [createNewVisible, setCreateNewVisible] = useState(false);

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
    if (unreadConversations.length > 0) {
      result.push({
        key: "unreads",
        title: "Unreads",
        icon: null,
        data: sectionsExpanded.unreads ? unreadConversations : [],
        type: "mixed",
        showAddChannel: false,
      });
    }
    result.push({
      key: "channels",
      title: "Channels",
      icon: Hash,
      data: sectionsExpanded.channels ? regularChannels : [],
      type: "channel",
      showAddChannel: true,
    });
    result.push({
      key: "dms",
      title: "Direct Messages",
      icon: null,
      data: sectionsExpanded.dms ? regularDMs : [],
      type: "dm",
      showAddChannel: false,
    });
    return result;
  }, [unreadConversations, regularChannels, regularDMs, sectionsExpanded]);

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
    const cards = [];
    if (enabledHomeCards.catchUp !== false) {
      cards.push({
        key: "catchUp",
        icon: Layers,
        label: "Catch Up",
        subtitle: `${quickCardsTotal} new`,
        onPress: () => navigation.navigate("Threads"),
      });
    }
    if (enabledHomeCards.threads !== false) {
      cards.push({
        key: "threads",
        icon: MessageSquare,
        label: "Threads",
        subtitle: `${unreadThreadCount} new`,
        onPress: () => navigation.navigate("Threads"),
      });
    }
    if (enabledHomeCards.huddles !== false) {
      cards.push({
        key: "huddles",
        icon: Headphones,
        label: "Huddles",
        subtitle: "0 live",
        onPress: () => {},
      });
    }
    if (enabledHomeCards.later !== false) {
      cards.push({
        key: "later",
        icon: Bookmark,
        label: "Later",
        subtitle: `${savedCount} items`,
        onPress: () => navigation.navigate("Later"),
      });
    }
    if (enabledHomeCards.drafts !== false) {
      cards.push({
        key: "drafts",
        icon: Edit3,
        label: "Drafts",
        subtitle: `${draftCount} items`,
        onPress: () => navigation.navigate("Drafts"),
      });
    }
    if (enabledHomeCards.scheduled !== false) {
      cards.push({
        key: "scheduled",
        icon: Clock,
        label: "Scheduled",
        subtitle: `${scheduledCount} items`,
        onPress: () => navigation.navigate("Scheduled"),
      });
    }
    if (enabledHomeCards.settings !== false) {
      cards.push({
        key: "settings",
        icon: Settings,
        label: "Settings",
        subtitle: "Customize",
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
            {visibleCards.map((card) => (
              <QuickCard
                key={card.key}
                icon={card.icon}
                label={card.label}
                subtitle={card.subtitle}
                onPress={card.onPress}
                colors={colors}
              />
            ))}
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
            Error loading data
          </Text>
          <TouchableOpacity
            style={[styles.errorBtn, { backgroundColor: colors.primary }]}
            onPress={loadData}
          >
            <Text style={{ color: colors.textInverse, fontWeight: "600" }}>
              Try Again
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
              {activeWorkspace?.name || "Workspace"}
            </Text>
          </TouchableOpacity>

          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => setAccountDrawerVisible(true)}>
              <AppAvatar user={user} size={30} showStatus statusSize={8} />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          renderSectionFooter={renderSectionFooter}
          ListHeaderComponent={ListHeader}
          ListFooterComponent={<View style={{ height: 100 }} />}
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
              tintColor={colors.primary}
            />
          }
          style={{ backgroundColor: colors.backgroundSecondary }}
        />
      )}

      {/* Floating "+" button for create new menu */}
      <TouchableOpacity
        style={[
          styles.fab,
          {
            backgroundColor: colors.primary,
            shadowColor: colors.shadow || "#000",
          },
        ]}
        onPress={() => setCreateNewVisible(true)}
        activeOpacity={0.8}
      >
        <Plus size={24} color={colors.textOnPrimary} strokeWidth={2.5} />
      </TouchableOpacity>

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
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 8,
  },
  wsLogo: {
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: 22,
    height: 22,
    resizeMode: "contain",
  },
  wsLogoText: {
    fontSize: 14,
    fontWeight: "800",
  },
  wsName: {
    fontSize: 16,
    fontWeight: "800",
    flex: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingsBtn: {
    padding: 4,
  },
  menuBtn: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cardsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 14,
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
    padding: 20,
    gap: 12,
  },
  errorText: { fontSize: 16, fontWeight: "600" },
  errorBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 80,
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});

export default HomeScreen;
