import { useCallback, useMemo, useState, useEffect } from "react";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useAuthStore } from "../stores/authStore";
import { useUIStore } from "../stores/uiStore";
import { useChannelStore } from "../stores/channelStore";
import { useThreadStore } from "../stores/threadStore";
import { useLaterStore } from "../stores/laterStore";
import { useDraftStore } from "../stores/draftStore";
import { useScheduledStore } from "../stores/scheduledStore";
import { categoryAPI } from "../services/api";
import { useTranslation } from "../utils/i18n";
import { useShallow } from 'zustand/react/shallow';

export const useHomeData = (navigation) => {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const user = useAuthStore((s) => s.user);
  const { t } = useTranslation();
  const { enabledHomeCards, toggleHomeCard } = useUIStore(
    useShallow((s) => ({ enabledHomeCards: s.enabledHomeCards, toggleHomeCard: s.toggleHomeCard }))
  );
  
  const channels = useChannelStore((s) => s.channels) || [];
  const categories = useChannelStore((s) => s.categories) || [];
  const fetchChannels = useChannelStore((s) => s.fetchChannels);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const unreads = useChannelStore((s) => s.unreads) || {};
  const starredIds = useChannelStore((s) => s.starredIds) || [];
  const isChannelsLoading = useChannelStore((s) => s.isLoading);

  const unreadThreadCount = useThreadStore((s) => s.unreadThreadCount) || 0;
  const fetchThreads = useThreadStore((s) => s.fetchThreads);
  const isThreadsLoading = useThreadStore((s) => s.isLoading);

  const savedCount = useLaterStore((s) => s.savedCount) || 0;
  const fetchSavedMessages = useLaterStore((s) => s.fetchSavedMessages);

  const draftCount = useDraftStore((s) => s.draftCount) || 0;
  const fetchDrafts = useDraftStore((s) => s.fetchDrafts);

  const scheduledCount = useScheduledStore((s) => s.scheduledCount) || 0;
  const fetchScheduledMessages = useScheduledStore((s) => s.fetchScheduledMessages);

  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [sectionsExpanded, setSectionsExpanded] = useState({
    unreads: true,
    starred: true,
    channels: true,
    dms: true,
  });

  useEffect(() => {
    import("@react-native-async-storage/async-storage")
      .then((AsyncStorage) => {
        return AsyncStorage.default.getItem('flowtask_mobile_expanded_sections');
      })
      .then(saved => {
        if (saved) setSectionsExpanded(JSON.parse(saved));
      })
      .catch(() => {});
  }, []);

  const toggleSection = useCallback((sectionKey) => {
    setSectionsExpanded((prev) => {
      const nextState = { ...prev, [sectionKey]: prev[sectionKey] === false ? true : false };
      import("@react-native-async-storage/async-storage")
        .then((AsyncStorage) => {
          AsyncStorage.default.setItem('flowtask_mobile_expanded_sections', JSON.stringify(nextState));
        })
        .catch(() => {});
      return nextState;
    });
  }, []);

  const loadData = useCallback((options = {}) => {
    const silent = options?.silent === true;
    if (!activeWorkspace?._id) return Promise.resolve();
    setError(null);

    const channelFetchOptions = silent ? { silent: true } : undefined;
    const threadFetchOptions = silent ? { silent: true } : undefined;
    
    const promises = [
      fetchChannels?.(channelFetchOptions).catch((err) => setError(err.message)),
      fetchThreads?.(1, threadFetchOptions).catch(console.error),
      fetchSavedMessages?.().catch(console.error),
      fetchDrafts?.(activeWorkspace?._id).catch(console.error),
      fetchScheduledMessages?.().catch(console.error),
      categoryAPI.getDepartments()
        .then(res => {
          if (res.data && res.data.data) {
            setDepartments(res.data.data);
          }
        })
        .catch(console.error)
    ];

    return Promise.all(promises);
  }, [
    activeWorkspace?._id,
    fetchChannels,
    fetchThreads,
    fetchSavedMessages,
    fetchDrafts,
    fetchScheduledMessages,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData({ silent: true });
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  const handleChannelPress = useCallback((channel) => {
    navigation.navigate("Chat", { channelId: channel._id, channelName: channel.name });
  }, [navigation]);

  const handleDMPress = useCallback((channel) => {
    setActiveChannel(channel._id);
    navigation.navigate("Chat", { channelId: channel._id, channelName: channel.name });
  }, [navigation, setActiveChannel]);

  const { unreadConversations, starredChannels, systemChannels, regularChannels, regularDMs } = useMemo(() => {
    const categorizedChannelIds = new Set();
    
    // Add channels from custom categories
    categories?.forEach(cat => {
      if (cat.type === 'custom' && cat.channelIds) {
        cat.channelIds.forEach(ch => {
          const chId = typeof ch === 'object' ? ch._id || ch : ch;
          categorizedChannelIds.add(String(chId));
        });
      }
    });

    // Add channels from department categories
    const deptCategories = categories?.filter(c => c.type === 'department') || [];
    deptCategories.forEach(dept => {
      channels.forEach(c => {
        const targetDeptId = String(dept.departmentId?.externalId || dept.departmentId?._id || dept.departmentId);
        if (!targetDeptId || targetDeptId === "undefined") return;
        const fEntityId = String(c.flowTaskRef?.entityId?._id || c.flowTaskRef?.entityId);
        const isDepartmentChannel = c.flowTaskRef?.entityType === "department" && fEntityId === targetDeptId;
        const cDeptId = String(c.departmentRef?.departmentId?._id || c.departmentRef?.departmentId);
        const isProjectInDepartment = c.departmentRef?.departmentId && cDeptId === targetDeptId;
        if (isDepartmentChannel || isProjectInDepartment) {
          categorizedChannelIds.add(String(c._id));
        }
      });
    });

    const unread = channels.filter((c) => {
      const cid = c._id?.toString ? c._id.toString() : String(c._id);
      return (unreads[cid] || 0) > 0;
    });
    const starred = channels.filter((c) => {
      const cid = c._id?.toString ? c._id.toString() : String(c._id);
      return starredIds.includes(c._id) && (unreads[cid] || 0) === 0;
    });
    const system = channels.filter((c) => {
      const cid = c._id?.toString ? c._id.toString() : String(c._id);
      return c.type === "system" && !categorizedChannelIds.has(String(c._id)) && (unreads[cid] || 0) === 0 && !starredIds.includes(c._id) && !c.isArchived;
    });
    const regularCh = channels.filter((c) => {
      const cid = c._id?.toString ? c._id.toString() : String(c._id);
      return c.type !== "dm" && c.type !== "system" && !categorizedChannelIds.has(String(c._id)) && (unreads[cid] || 0) === 0 && !starredIds.includes(c._id) && !c.isArchived;
    });
    const regularD = channels.filter((c) => {
      const cid = c._id?.toString ? c._id.toString() : String(c._id);
      return c.type === "dm" && (unreads[cid] || 0) === 0 && !starredIds.includes(c._id) && !c.isArchived;
    });

    regularD.sort((a, b) => {
      const aIsSelf = a.dmRecipientId === user?._id;
      const bIsSelf = b.dmRecipientId === user?._id;
      if (aIsSelf && !bIsSelf) return -1;
      if (!aIsSelf && bIsSelf) return 1;
      const aTime = new Date(a.lastMessageAt || a.lastMessage?.createdAt || 0).getTime();
      const bTime = new Date(b.lastMessageAt || b.lastMessage?.createdAt || 0).getTime();
      return bTime - aTime;
    });

    return { unreadConversations: unread, starredChannels: starred, systemChannels: system, regularChannels: regularCh, regularDMs: regularD };
  }, [channels, unreads, starredIds, user, categories]);

  return {
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
  };
};
