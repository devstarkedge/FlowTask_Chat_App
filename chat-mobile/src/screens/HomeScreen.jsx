import React, { useMemo, useState, useEffect } from "react";
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
} from "lucide-react-native";

const HomeScreen = ({ navigation }) => {
  if (!navigation) navigation = { navigate: () => {} };

  React.useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, []);
  const { colors } = useThemeStore();
  
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
    const showSkeletons = isChannelsLoading && channels.length === 0;
    const skeletonData = showSkeletons 
      ? [{ _id: "skel1", isSkeleton: true }, { _id: "skel2", isSkeleton: true }, { _id: "skel3", isSkeleton: true }] 
      : [];

    if (unreadConversations.length > 0) {
      result.push({
        key: "unreads",
        title: t("Unreads"),
        icon: null,
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
        icon: null, // Just text like web app
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
          if (c.visibility === 'private' || c.isArchived) return false;
          const targetDeptId = cat.departmentId?.externalId || cat.departmentId?._id || cat.departmentId;
          if (!targetDeptId) return false;
          const isDepartmentChannel = c.flowTaskRef?.entityType === "department" && String(c.flowTaskRef?.entityId) === String(targetDeptId);
          const isProjectInDepartment = c.departmentRef?.departmentId && String(c.departmentRef.departmentId) === String(targetDeptId);
          return isDepartmentChannel || isProjectInDepartment;
        });
      } else {
        catChannels = channels.filter(c => cat.channelIds?.includes(c._id));
      }

      // Hide empty department categories
      if (cat.type === "department" && catChannels.length === 0) return;

      result.push({
        key: `cat_${cat._id}`,
        title: `${cat.icon || '📁'} ${cat.name}`,
        icon: null,
        data: sectionsExpanded[`cat_${cat._id}`] !== false ? [cat] : [],
        type: "category_parent",
        showAddChannel: false,
      });
    });

    // Channels section (always rendered, data based on expanded state)
    result.push({
      key: "channels",
      title: t("Channels"),
      icon: Hash,
      data: sectionsExpanded.channels !== false ? (showSkeletons ? skeletonData : regularChannels) : [],
      type: "channel",
      showAddChannel: true,
    });
    // Direct Messages section (always rendered)
    result.push({
      key: "dms",
      title: t("Direct Messages"),
      icon: MessageSquare,
      data: sectionsExpanded.dms !== false ? (showSkeletons ? skeletonData : regularDMs) : [],
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
        sectionKey={section.key}
        isExpanded={sectionsExpanded[section.key] ?? true}
        onToggle={isCategoryHeader ? () => {} : toggleSection}
        colors={colors}
        onAdd={isCategoryHeader ? () => setCreateCategoryVisible(true) : undefined}
        // Only show menu for custom categories, not departments
        onMenu={isCategoryParent && !isDepartment ? () => {
          if (category) handleCategoryAction(category);
        } : undefined}
      />
    );
  };

  const renderSectionFooter = ({ section }) => {
    if (!section.showAddChannel || !sectionsExpanded[section.key]) return null;
    return <AddChannelRow onPress={() => setCreateChannelVisible(true)} colors={colors} />;
  };
  const renderItem = ({ item, section }) => {
    if (item.isSkeleton) return <SkeletonRow colors={colors} />;
    
    if (section.type === "category_parent") {
      const cat = item;
      const catExpanded = sectionsExpanded[`cat_${cat._id}`] !== false;
      
      let catChannels = [];
      if (cat.type === 'department') {
        catChannels = channels.filter(c => {
          if (c.visibility === 'private' || c.isArchived) return false;
          const targetDeptId = cat.departmentId?.externalId || cat.departmentId?._id || cat.departmentId;
          if (!targetDeptId) return false;
          const isDepartmentChannel = c.flowTaskRef?.entityType === "department" && String(c.flowTaskRef?.entityId) === String(targetDeptId);
          const isProjectInDepartment = c.departmentRef?.departmentId && String(c.departmentRef.departmentId) === String(targetDeptId);
          return isDepartmentChannel || isProjectInDepartment;
        });
      } else {
        catChannels = channels.filter(c => cat.channelIds?.includes(c._id));
      }
      
      if (catChannels.length === 0 && catExpanded && cat.type !== 'department') {
        return (
          <TouchableOpacity 
            onPress={() => {
              setActiveCategory(cat);
              setActionSheetVisible(true);
            }} 
            style={{ paddingLeft: 12, paddingVertical: 8 }}
          >
            <Text style={{ fontSize: 13, paddingHorizontal: 30, color: colors.textPrimary, opacity: 0.8, fontWeight: "600" }}>
              + Add Channels
            </Text>
          </TouchableOpacity>
        );
      }

      return (
        <View style={{ paddingLeft: 12 }}>
          {catExpanded && catChannels.map(channel => {
            const unread = unreads[channel._id] || 0;
            return (
              <ChannelRow
                key={channel._id}
                channel={channel}
                unreadCount={unread}
                onPress={handleChannelPress}
                colors={colors}
              />
            );
          })}
        </View>
      );
    }

    const unreadCount = unreads[item._id] || 0;
    if (section.type === "dm" || (section.type === "mixed" && item.type === "dm")) {
      const isSelf = item.dmRecipientId === user?._id;
      return <DMRow channel={item} unreadCount={unreadCount} onPress={handleDMPress} colors={colors} isSelf={isSelf} />;
    }
    
    return (
      <ChannelRow 
        channel={item} 
        unreadCount={unreadCount} 
        onPress={handleChannelPress} 
        colors={colors} 
      />
    );
  };

  const quickCardsTotal = unreadThreadCount + savedCount + draftCount + scheduledCount;

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
          {visibleCards.map((card) => card.isSkeleton ? (
            <SkeletonCard key={card.key} colors={colors} />
          ) : (
            <QuickCard key={card.key} icon={card.icon} label={card.label} subtitle={card.subtitle} onPress={card.onPress} colors={colors} />
          ))}
        </ScrollView>
      )}
    </View>
  ), [visibleCards, colors]);

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.textPrimary }]}>{t("Error loading data")}</Text>
          <TouchableOpacity style={[styles.errorBtn, { backgroundColor: colors.primary }]} onPress={loadData}>
            <Text style={{ color: colors.textInverse, fontWeight: "600" }}>{t("Try Again")}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundSecondary }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.primary }}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerLeft} onPress={() => navigation.navigate("WorkspaceSwitcher")} activeOpacity={0.7}>
            <View style={[styles.wsLogo, { backgroundColor: colors.primaryOverlay }]}>
              <Image source={require("../../assets/logo.png")} style={styles.logo} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[styles.wsName, { color: colors.textOnPrimary }]} numberOfLines={1}>
                {activeWorkspace?.name || t("Workspace")}
              </Text>
              <ChevronDown size={16} color={colors.textOnPrimary} strokeWidth={2.5} style={{ opacity: 0.8, marginTop: 2 }} />
            </View>
          </TouchableOpacity>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => setAccountDrawerVisible(true)}>
              <AppAvatar user={user} size={30} showStatus statusSize={8} />
            </TouchableOpacity>
          </View>
        </View>
        {(isChannelsLoading || isThreadsLoading || refreshing) && <HomeHeaderLoader colors={colors} />}
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="transparent" colors={["transparent"]} progressBackgroundColor="transparent" />}
        style={{ backgroundColor: colors.backgroundSecondary }}
      />

      <FAB onPress={() => setCreateNewVisible(true)} />
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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: scale(16), paddingVertical: verticalScale(10) },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 8 },
  wsLogo: { width: scale(28), height: scale(28), borderRadius: moderateScale(6), justifyContent: "center", alignItems: "center" },
  logo: { width: scale(22), height: scale(22), resizeMode: "contain" },
  wsName: { fontSize: moderateScale(16), fontWeight: "800", flex: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardsRow: { flexDirection: "row", paddingHorizontal: scale(16), paddingVertical: verticalScale(14), gap: 10 },
  errorContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: moderateScale(20), gap: 12 },
  errorText: { fontSize: moderateScale(16), fontWeight: "600" },
  errorBtn: { paddingHorizontal: scale(20), paddingVertical: verticalScale(10), borderRadius: moderateScale(6) },
});

export default HomeScreen;
