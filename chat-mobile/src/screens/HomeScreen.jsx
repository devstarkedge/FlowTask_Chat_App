import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SectionList,
  StatusBar,
  RefreshControl,
  Platform,
  ScrollView,
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import { AppAvatar, HomeHeaderLoader } from "../components/common";
import FAB from "../components/common/FAB";
import AccountDrawer from "../components/AccountDrawer";
import CreateNewBottomSheet from "../components/CreateNewBottomSheet";
import CreateCategoryModal from "../components/CreateCategoryModal";
import CreateChannelModal from "../components/CreateChannelModal";
import ManageCategoryChannelsModal from "../components/ManageCategoryChannelsModal";
import CategoryActionSheet from "../components/CategoryActionSheet";
import CustomizeHomeModal from "../components/CustomizeHomeModal";
import { useThemeStore } from "../stores/themeStore";
import WorkspaceAvatar from "../components/WorkspaceAvatar";
import { useHomeData } from "../hooks/useHomeData";
import {
  SkeletonCard,
  SkeletonRow,
  QuickCard,
  SectionHeader,
  ChannelRow,
  AddChannelRow,
  DMRow
} from "../components/HomeComponents";
import {
  Hash,
  MessageSquare,
  Bookmark,
  Headphones,
  Layers,
  Settings,
  Edit3,
  Clock,
  Star,
  Folder,
  ChevronDown,
  Radio,
  Filter
} from "lucide-react-native";

const HomeScreen = ({ navigation }) => {
  if (!navigation) navigation = { navigate: () => {} };

  React.useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, []);
  const colors = useThemeStore((s) => s.colors);
  
  const {
    user,
    activeWorkspace,
    t,
    enabledHomeCards,
    toggleHomeCard,
    unreadThreadCount,
    savedCount,
    draftCount,
    scheduledCount,
    isChannelsLoading,
    isThreadsLoading,
    refreshing,
    error,
    sectionsExpanded,
    loadData,
    onRefresh,
    toggleSection,
    handleChannelPress,
    handleDMPress,
    unreadConversations,
    starredChannels,
    systemChannels,
    regularChannels,
    regularDMs,
    categories,
    departments,
    channels,
    unreads,
  } = useHomeData(navigation);

  const [accountDrawerVisible, setAccountDrawerVisible] = useState(false);
  const [customizeModalVisible, setCustomizeModalVisible] = useState(false);
  const [createNewVisible, setCreateNewVisible] = useState(false);
  const [createChannelVisible, setCreateChannelVisible] = useState(false);
  const [createCategoryVisible, setCreateCategoryVisible] = useState(false);
  const [manageCategoryVisible, setManageCategoryVisible] = useState(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);
  const [categoryModalMode, setCategoryModalMode] = useState('add');

  const sections = useMemo(() => {
    const result = [];

    if (unreadConversations.length > 0) {
      result.push({
        key: "unreads",
        title: t("Unreads"),
        icon: Filter,
        data: sectionsExpanded.unreads !== false ? unreadConversations : [],
        type: "mixed",
        showAddChannel: false,
      });
    }
    if (starredChannels && starredChannels.length > 0) {
      result.push({
        key: "starred",
        title: t("Starred"),
        icon: Star,
        data: sectionsExpanded.starred !== false ? starredChannels : [],
        type: "mixed",
        showAddChannel: false,
      });
    }

    if (systemChannels && systemChannels.length > 0) {
      result.push({
        key: "system",
        title: "SYSTEM",
        icon: Radio, 
        data: sectionsExpanded.system !== false ? systemChannels : [],
        type: "channel",
        showAddChannel: false,
      });
    }

    // Categories Header
    result.push({
      key: "categories_header",
      title: "Categories",
      icon: Folder,
      data: [],
      type: "categories_header",
      showAddChannel: false,
    });

    // Categories sections
    categories?.forEach(cat => {
      let catChannels = [];
      if (cat.type === 'department') {
        catChannels = channels.filter(c => {
          if (c.type === 'dm' || c.type === 'self' || c.isArchived) return false;
          const targetDeptId = String(cat.departmentId?.externalId || cat.departmentId?._id || cat.departmentId);
          if (!targetDeptId || targetDeptId === "undefined") return false;
          const fEntityId = String(c.flowTaskRef?.entityId?._id || c.flowTaskRef?.entityId);
          const isDepartmentChannel = c.flowTaskRef?.entityType === "department" && fEntityId === targetDeptId;
          const cDeptId = String(c.departmentRef?.departmentId?._id || c.departmentRef?.departmentId);
          const isProjectInDepartment = c.departmentRef?.departmentId && cDeptId === targetDeptId;
          return isDepartmentChannel || isProjectInDepartment;
        });
      } else {
        catChannels = channels.filter(c => cat.channelIds?.includes(c._id));
      }
   
      // Hide empty department categories
      if (cat.type === "department" && catChannels.length === 0) return;

      result.push({
        key: `cat_${cat._id}`,
        title: cat.name,
        emojiIcon: cat.icon || '📁',
        icon: null,
        data: sectionsExpanded[`cat_${cat._id}`] !== false ? [cat] : [],
        type: "category_parent",
        showAddChannel: false,
      });
    });

    // Channels section (only render if there are regular channels)
    const hasRegularChannels = regularChannels && regularChannels.length > 0;
    if (hasRegularChannels) {
      result.push({
        key: "channels",
        title: t("Channels"),
        icon: Hash,
        data: sectionsExpanded.channels !== false ? regularChannels : [],
        type: "channel",
        showAddChannel: true,
      });
    }
    
    // Direct Messages section (always rendered)
    result.push({
      key: "dms",
      title: t("Direct Messages"),
      icon: MessageSquare,
      data: sectionsExpanded.dms !== false ? regularDMs : [],
      type: "dm",
      showAddChannel: false,
    });
    return result;
  }, [unreadConversations, starredChannels, systemChannels, regularChannels, regularDMs, sectionsExpanded, isChannelsLoading, channels.length, categories, departments, t]);

  const handleCategoryAction = (cat) => {
    // Only custom categories have actions menu
    if (cat.type === 'department') {
      // Department categories are read-only, no actions menu
      return;
    }
    
    // Open the action sheet
    setActiveCategory(cat);
    setActionSheetVisible(true);
  };

  const renderSectionHeader = ({ section }) => {
    const isCategoryHeader = section.type === "categories_header";
    const isCategoryParent = section.type === "category_parent";
    
    // For category parent sections, check if it's a department category
    const category = isCategoryParent ? (section.data[0] || (categories || []).find(c => `cat_${c._id}` === section.key)) : null;
    const isDepartment = category?.type === 'department';
    
    return (
      <SectionHeader
        title={section.title}
        icon={section.icon}
        emojiIcon={section.emojiIcon}
        indentLevel={isCategoryParent ? 1 : 0}
        sectionKey={section.key}
        isExpanded={sectionsExpanded[section.key] ?? true}
        onToggle={isCategoryHeader ? null : toggleSection}
        colors={colors}
        onAdd={isCategoryHeader ? () => setCreateCategoryVisible(true) : undefined}
        addIconSize={isCategoryHeader ? 22 : 16}
        hideChevron={isCategoryHeader}
        // Only show menu for custom categories, not departments
        onMenu={isCategoryParent && !isDepartment ? () => {
          if (category) handleCategoryAction(category);
        } : undefined}
      />
    );
  };

  const renderSectionFooter = ({ section }) => {
    if (!section.showAddChannel || !sectionsExpanded[section.key]) return null;
    return <AddChannelRow onPress={() => setCreateChannelVisible(true)} colors={colors} indentLevel={1} />;
  };
  const renderItem = ({ item, section }) => {
    if (section.type === "category_parent") {
      const cat = item;
      const catExpanded = sectionsExpanded[`cat_${cat._id}`] !== false;
      
      let catChannels = [];
      if (cat.type === 'department') {
        catChannels = channels.filter(c => {
          if (c.type === 'dm' || c.type === 'self' || c.isArchived) return false;
          const targetDeptId = String(cat.departmentId?.externalId || cat.departmentId?._id || cat.departmentId);
          if (!targetDeptId || targetDeptId === "undefined") return false;
          const fEntityId = String(c.flowTaskRef?.entityId?._id || c.flowTaskRef?.entityId);
          const isDepartmentChannel = c.flowTaskRef?.entityType === "department" && fEntityId === targetDeptId;
          const cDeptId = String(c.departmentRef?.departmentId?._id || c.departmentRef?.departmentId);
          const isProjectInDepartment = c.departmentRef?.departmentId && cDeptId === targetDeptId;
          return isDepartmentChannel || isProjectInDepartment;
        });
      } else {
        catChannels = channels.filter(c => cat.channelIds?.includes(c._id));
      }
      


      return (
        <View>
          {catExpanded && catChannels.length > 0 && catChannels.map(channel => {
            const unread = unreads[channel._id] || 0;
            return (
              <ChannelRow
                key={channel._id}
                channel={channel}
                unreadCount={unread}
                onPress={handleChannelPress}
                colors={colors}
                indentLevel={2}
              />
            );
          })}
        </View>
      );
    }

    const unreadCount = unreads[item._id] || 0;
    if (section.type === "dm" || (section.type === "mixed" && item.type === "dm")) {
      const isSelf = item.dmRecipientId === user?._id;
      return <DMRow channel={item} unreadCount={unreadCount} onPress={handleDMPress} colors={colors} isSelf={isSelf} indentLevel={1} />;
    }
    
    return (
      <ChannelRow 
        channel={item} 
        unreadCount={unreadCount} 
        onPress={handleChannelPress} 
        colors={colors} 
        indentLevel={1}
      />
    );
  };

  const isInitialLoading = (isChannelsLoading || isThreadsLoading) && channels.length === 0;
  const showHomeLoader = refreshing || isInitialLoading;

  // iOS ignores transparent tintColor on RefreshControl — use scroll-based pull-to-refresh instead.
  const pullRefreshLock = useRef(false);
  const handleIOSPullRefreshEndDrag = useCallback((event) => {
    if (Platform.OS === "android" || refreshing || pullRefreshLock.current) return;
    const offsetY = event.nativeEvent.contentOffset.y;
    if (offsetY < -verticalScale(60)) {
      pullRefreshLock.current = true;
      onRefresh().finally(() => {
        pullRefreshLock.current = false;
      });
    }
  }, [refreshing, onRefresh]);

  const quickCardsTotal = unreadThreadCount + savedCount + draftCount + scheduledCount;

  const visibleCards = useMemo(() => {
    const cards = [];
    
    if (enabledHomeCards.threads !== false) {
      cards.push({ key: "threads", icon: MessageSquare, label: t("Threads"), subtitle: `${unreadThreadCount} new`, onPress: () => navigation.navigate("Threads") });
    }
    if (enabledHomeCards.huddles !== false) {
      cards.push({ key: "huddles", icon: Headphones, label: t("Huddles"), subtitle: t("0 live"), onPress: () => {} });
    }
    if (enabledHomeCards.later !== false) {
      cards.push({ key: "later", icon: Bookmark, label: t("Later"), subtitle: `${savedCount} items`, onPress: () => navigation.navigate("Later") });
    }
    if (enabledHomeCards.drafts !== false) {
      cards.push({ key: "drafts", icon: Edit3, label: t("Drafts"), subtitle: `${draftCount} items`, onPress: () => navigation.navigate("Drafts") });
    }
    if (enabledHomeCards.scheduled !== false) {
      cards.push({ key: "scheduled", icon: Clock, label: t("Scheduled"), subtitle: `${scheduledCount} items`, onPress: () => navigation.navigate("Scheduled") });
    }
    if (enabledHomeCards.settings !== false) {
      cards.push({ key: "settings", icon: Settings, label: t("Settings"), subtitle: t("Customize"), onPress: () => setCustomizeModalVisible(true) });
    }
    return cards;
  }, [enabledHomeCards, quickCardsTotal, unreadThreadCount, savedCount, draftCount, scheduledCount, navigation, isThreadsLoading, t]);

  const ListHeader = useMemo(() => (
    <View style={{ backgroundColor: colors.backgroundSecondary }}>
      {visibleCards.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow} style={{ backgroundColor: colors.backgroundSecondary }}>
          {visibleCards.map((card) => (
            <QuickCard key={card.key} icon={card.icon} label={card.label} subtitle={card.subtitle} onPress={card.onPress} colors={colors} />
          ))}
        </ScrollView>
      )}
    </View>
  ), [visibleCards, colors]);



  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundSecondary }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} translucent />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.primary }}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerLeft} onPress={() => navigation.navigate("WorkspaceSwitcher")} activeOpacity={0.7}>
            <WorkspaceAvatar workspace={activeWorkspace} size={32} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
              <Text style={[styles.wsName, { color: colors.textOnPrimary }]} numberOfLines={1}>
                {activeWorkspace?.name || t("Workspace")}
              </Text>
            </View>
          </TouchableOpacity>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => setAccountDrawerVisible(true)}>
              <AppAvatar user={user} size={30} showStatus statusSize={8} />
            </TouchableOpacity>
          </View>
        </View>
        {showHomeLoader && <HomeHeaderLoader colors={colors} />}
      </SafeAreaView>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.textPrimary, marginBottom: 4 }]}>
            {t("No Internet Connection")}
          </Text>
          <Text style={{ color: colors.textSecondary, marginBottom: 12, textAlign: 'center' }}>
            {t("Please check your network and try again.")}
          </Text>
          <TouchableOpacity style={[styles.errorBtn, { backgroundColor: colors.primary }]} onPress={loadData}>
            <Text style={{ color: colors.textInverse, fontWeight: "600" }}>{t("Try Again")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
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
              Platform.OS === "android"
                ? (
                  <RefreshControl
                    refreshing={false}
                    onRefresh={onRefresh}
                    colors={["transparent"]}
                    progressBackgroundColor="transparent"
                    progressViewOffset={-1000}
                  />
                )
                : undefined
            }
            onScrollEndDrag={Platform.OS !== "android" ? handleIOSPullRefreshEndDrag : undefined}
            style={{ backgroundColor: colors.backgroundSecondary }}
          />

          <FAB onPress={() => setCreateNewVisible(true)} />
        </>
      )}
      <AccountDrawer visible={accountDrawerVisible} onClose={() => setAccountDrawerVisible(false)} navigation={navigation} />
      <CustomizeHomeModal visible={customizeModalVisible} onClose={() => setCustomizeModalVisible(false)} enabledCards={enabledHomeCards} onToggleCard={toggleHomeCard} />
      <CreateNewBottomSheet visible={createNewVisible} onClose={() => setCreateNewVisible(false)} navigation={navigation} />
      <CreateCategoryModal visible={createCategoryVisible} onClose={() => setCreateCategoryVisible(false)} />
      <CreateChannelModal visible={createChannelVisible} onClose={() => setCreateChannelVisible(false)} navigation={navigation} />
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
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: moderateScale(16), paddingVertical: moderateScale(10) },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 8 },
  wsLogo: { width: moderateScale(32), height: moderateScale(32), borderRadius: moderateScale(6), justifyContent: "center", alignItems: "center" },
  logo: { width: moderateScale(32), height: moderateScale(32), resizeMode: "contain" },
  wsName: { fontSize: moderateScale(16), fontWeight: "800", flexShrink: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardsRow: { flexDirection: "row", paddingHorizontal: moderateScale(16), paddingVertical: moderateScale(14), gap: 10 },
  errorContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: moderateScale(20), gap: 12 },
  errorText: { fontSize: moderateScale(16), fontWeight: "600" },
  errorBtn: { paddingHorizontal: moderateScale(20), paddingVertical: moderateScale(10), borderRadius: moderateScale(6) },
});

export default HomeScreen;
