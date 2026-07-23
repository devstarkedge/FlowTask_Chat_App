import { useState, useMemo, useEffect } from "react";
import { useNavigate, useParams, useLocation, matchPath } from "react-router-dom";
import { useChannelStore } from "../../stores/channelStore";
import { useAuthStore } from "../../stores/authStore";
import { useChatStore } from "../../stores/chatStore";
import { usePresenceStore } from "../../stores/presenceStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useLaterStore } from '../../stores/laterStore';
import { useScheduledStore } from '../../stores/scheduledStore';
import { useFavoritesStore } from '../../stores/favoritesStore';
import {
  Hash,
  Lock,
  MessageCircle,
  Users,
  Bot,
  Volume2,
  X,
  MessageSquareText,
  Bookmark,
  Send,
  Globe,
  Compass,
  Radio,
  AppWindow,
  BookMarked,
  Clock,
  Star,
  MoreVertical,
  Folder,
  FolderPlus,
  Plus,
} from "lucide-react";
import { Avatar } from "../chat/MemberAvatarGroup";
import CreateChannelModal from "../chat/CreateChannelModal";
import CreateCategoryModal from "../chat/CreateCategoryModal";

import EditCategoryModal from "../chat/EditCategoryModal";
import MoveToCategoryModal from "../chat/MoveToCategoryModal";
import UserPickerModal from "../chat/UserPickerModal";
import CategoryHeader from "./CategoryHeader";
import CategoryList from "./CategoryList";
import PreferencesModal from "../chat/PreferencesModal";
import SetStatusModal from "../chat/SetStatusModal";
import WorkspaceSwitcher from "../workspace/WorkspaceSwitcher";
import CreateWorkspaceModal from "../workspace/CreateWorkspaceModal";
import JoinWorkspaceModal from "../workspace/JoinWorkspaceModal";
import WorkspaceSettingsModal from "../workspace/WorkspaceSettingsModal";
import InviteMembersModal from "../workspace/InviteMembersModal";
import { formatDistanceToNowStrict } from "date-fns";
import {
  getChannelPath,
  getDMPath,
  getDirectoriesPath,
} from "../../utils/chatRoutes";
import { useDraftStore, countWorkspaceDrafts } from "../../stores/draftStore";
import { useNotificationStore } from "../../stores/notificationStore";
import { isContentEmpty } from "../../utils/draftUtils";
import SidebarContainer from "./sidebar/SidebarContainer";
import SidebarItem from "./sidebar/SidebarItem";
import SidebarSection from "./sidebar/SidebarSection";
import ChannelListItem from "./sidebar/ChannelListItem";
import api, { categoryAPI } from "../../services/api";
import { useUIStore } from '../../stores/uiStore';
import toast from "react-hot-toast";

const CHANNEL_ICONS = {
  project: Hash,
  department: Users,
  team: Users,
  dm: MessageCircle,
  system: Volume2,
  public: Hash,
  private: Lock,
  self: BookMarked,
};

export default function NavigationSidebar({
  mode = "home",
  onClose,
  onToggleAllThreads,
  onToggleNotifications,
  showAllThreads = false,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { workspaceId } = useParams();
  const {
    channels,
    categories,
    departments,
    activeChannelId,
    setActiveChannel,
    unreads,
    createDM,
  } = useChannelStore();
  const { user, channelSync } = useAuthStore();
  const { switchWorkspace } = useWorkspaceStore();
  const drafts = useDraftStore((s) => s.drafts);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const isEnterpriseOrPro = activeWorkspace?.plan === 'enterprise' || activeWorkspace?.plan === 'pro';
  const onlineUsers = usePresenceStore((s) => s.presence);
  const {
    favorites,
    isLoading: favoritesLoading,
    fetchFavorites,
    removeFavorite,
    isFavorited,
  } = useFavoritesStore();

  const activeWorkspacePanel = useUIStore((s) => s.activeWorkspacePanel);
  // Check if we're on the Later page or have the Later panel open to avoid conflicting highlighting
  const isLaterRoute = !!matchPath('/workspace/:workspaceId/later', location.pathname);
  const isLaterPage = isLaterRoute || activeWorkspacePanel === 'later';

  // Derive whether we're on the Directories page
  const path = location.pathname.replace(`/workspace/${workspaceId}`, "");
  const isDirectoriesPage = path.startsWith("/directories");

  const hasDraft = (channelId) => {
    const key = `${activeWorkspaceId}:${channelId}:root`;
    const draft = drafts[key];
    if (!draft) return false;
    return !isContentEmpty(draft.html, draft.text);
  };

  const [expandedSections, setExpandedSections] = useState({
    starred: true,
    channels: true,
    privateChannels: true,
    dms: true,
    system: true,
  });
  
  const [expandedGroups, setExpandedGroups] = useState(() => {
    try {
      const saved = localStorage.getItem('flowtask_expanded_categories');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const handleToggleCategory = (categoryId) => {
    setExpandedGroups(prev => {
      const isCurrentlyExpanded = prev[categoryId] !== false;
      const nextState = { ...prev, [categoryId]: !isCurrentlyExpanded };
      try {
        localStorage.setItem('flowtask_expanded_categories', JSON.stringify(nextState));
      } catch (e) {}
      return nextState;
    });
  };

  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);

  const [categoryToEdit, setCategoryToEdit] = useState(null);
  const [channelToMove, setChannelToMove] = useState(null);
  const [activeCategoryMenu, setActiveCategoryMenu] = useState(null);

  // We no longer need inline fetch logic for departments in NavigationSidebar as it's handled in CreateDepartmentCategoryModal
  // removing loadDepartments()rkspaceId]);

  // Close category dropdown on outside click
  useEffect(() => {
    if (!activeCategoryMenu) return;
    const handleClick = () => setActiveCategoryMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [activeCategoryMenu]);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showJoinWorkspace, setShowJoinWorkspace] = useState(false);
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);
  const [showInviteMembers, setShowInviteMembers] = useState(false);

  // Fetch favorites when workspace changes
  useEffect(() => {
    if (activeWorkspaceId) {
      fetchFavorites();
    }
  }, [activeWorkspaceId, fetchFavorites]);

  const [selfDmLoading, setSelfDmLoading] = useState(false);

  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'owner' || user?.role === 'manager';

  const toggleSection = (section) => {
    setExpandedSections((s) => ({ ...s, [section]: !s[section] }));
  };

  const categorizedChannelIds = useMemo(() => {
    const ids = new Set();
    
    // Add channels from custom categories
    categories?.forEach(cat => {
      if (cat.type === 'custom' && cat.channelIds) {
        cat.channelIds.forEach(ch => {
          const chId = typeof ch === 'object' ? ch._id || ch : ch;
          ids.add(String(chId));
        });
      }
    });

    // Add channels mapped to department categories
    const deptCategories = categories?.filter(c => c.type === 'department') || [];
    deptCategories.forEach(dept => {
      channels.forEach(c => {
        const targetDeptId = dept.departmentId?.externalId || dept.departmentId?._id || dept.departmentId;
        if (!targetDeptId) return;
        const isDepartmentChannel = c.flowTaskRef?.entityType === "department" && String(c.flowTaskRef?.entityId) === String(targetDeptId);
        const isProjectInDepartment = c.departmentRef?.departmentId && String(c.departmentRef.departmentId) === String(targetDeptId);
        if (isDepartmentChannel || isProjectInDepartment) {
          ids.add(String(c._id));
        }
      });
    });
    return ids;
  }, [categories, channels]);

  const projectChannels = channels.filter(
    (c) => c.type === "project" && c.visibility !== "private" && !c.isArchived && !categorizedChannelIds.has(String(c._id)),
  );
  
  const publicChannels = channels.filter(
    (c) =>
      ((c.type === "public" && c.visibility !== "private") ||
        (c.type !== "public" && c.visibility === "public")) &&
      !c.isArchived &&
      c.type !== "project" &&
      c.type !== "department" &&
      c.type !== "team" &&
      c.type !== "dm" &&
      c.type !== "system" &&
      c.type !== "self" &&
      !categorizedChannelIds.has(String(c._id)),
  );
  
  const privateChannels = channels.filter(
    (c) =>
      ((c.type === "private" && c.visibility !== "public") || c.visibility === "private") &&
      c.type !== "dm" &&
      c.type !== "system" &&
      c.type !== "self" &&
      !c.isArchived &&
      !categorizedChannelIds.has(String(c._id)),
  );

  const selfChannel = useMemo(
    () => channels.find((c) => c.isSelfDM || c.isSelf || c.type === "self"),
    [channels],
  );

  const dmChannels = useMemo(() => {
    const currentChatId = user?._id?.toString?.();
    const currentFlowTaskId = user?.flowTaskUserId?.toString?.();
    const selfIds = new Set([currentChatId, currentFlowTaskId].filter(Boolean));

    const regularDMs = channels.filter((c) => {
      if (c.type !== "dm" || c.isArchived || c.isAI || c.isSelf || c.isSelfDM) {
        return false;
      }
      
      // Hide premature DMs from the recipient until the first message is sent
      const isCreator = c.createdBy && c.createdBy.toString() === currentChatId;
      const hasMessages = !!c.lastMessageAt;
      return hasMessages || isCreator;
    });

    const aiDMs = channels.filter(
      (c) => c.type === "dm" && !c.isArchived && c.isAI
    );

    // Keep only the most recent AI DM if multiple exist
    const validAiDM = aiDMs.sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    })[0];

    const mergedDMs = [...regularDMs];
    if (validAiDM) {
      mergedDMs.push(validAiDM);
    }

    return mergedDMs
      .map((c) => {
        const participants = Array.isArray(c.dmParticipants)
          ? c.dmParticipants.map((p) => p?.toString?.() || String(p))
          : [];

        const recipientId =
          c.dmRecipientId ||
          participants.find((p) => p && !selfIds.has(p)) ||
          null;

        let displayName = c.name;
        if (c.dmParticipantNames && Array.isArray(c.dmParticipantNames)) {
          const otherNames = c.dmParticipantNames.filter(name => {
            const userName = user?.name || '';
            return name !== userName;
          });
          if (otherNames.length > 0) {
            displayName = otherNames.join(', ');
          }
        } else if (c.name && c.name.includes(',')) {
          const names = c.name.split(',').map(n => n.trim());
          const userName = user?.name || '';
          const otherNames = names.filter(name => name !== userName);
          if (otherNames.length > 0) {
            displayName = otherNames.join(', ');
          }
        }

        return { ...c, dmRecipientId: recipientId, name: displayName };
      });
  }, [channels, user]);

  const systemChannels = channels.filter(
    (c) => c.type === "system" && !c.isArchived,
  );
  const deptChannels = channels.filter(
    (c) => (c.type === "department" || c.type === "team") && !c.isArchived,
  );

  const isDMMode = mode === "dms";

  const sortChannels = (list) => {
    return [...list].sort((a, b) => {
      const aUnread = unreads[a._id] || 0;
      const bUnread = unreads[b._id] || 0;
      if (aUnread > 0 && bUnread === 0) return -1;
      if (aUnread === 0 && bUnread > 0) return 1;
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      return (a.name || "").localeCompare(b.name || "");
    });
  };

  // Resolve favorite targets to channel objects for sidebar rendering
  const favoriteChannels = useMemo(() => {
    const favChannelIds = new Set();
    const favDMIds = new Set();

    for (const fav of favorites) {
      if (fav.targetType === 'channel' || fav.targetType === 'private_channel' || fav.targetType === 'project') {
        favChannelIds.add(fav.targetId);
      } else if (fav.targetType === 'dm') {
        favDMIds.add(fav.targetId);
      }
    }

    const resolved = [];
    for (const ch of channels) {
      if (favChannelIds.has(ch._id) || favDMIds.has(ch._id)) {
        resolved.push(ch);
      }
    }
    return resolved;
  }, [favorites, channels]);

  const handleSelectChannel = (channelId) => {
    // Don't proceed if we're on the Later page - user needs to explicitly navigate away
    if (isLaterPage) {
      useUIStore.getState().clearActiveLaterPage();
    }

    const channel = channels.find((c) => c._id === channelId);
    setActiveChannel(channelId);

    useUIStore.getState().clearActiveWorkspacePanel();

    if (workspaceId && channel) {
      const nextPath =
        channel.type === "dm" || channel.type === "self"
          ? getDMPath(workspaceId, channelId)
          : getChannelPath(workspaceId, channelId);
      navigate(nextPath);
    }

    onClose?.();
  };

  const handleChatBot = async () => {
    try {
      const res = await api.post("/channels/ai-dm");
      const channelId = res.data?.data?.channelId;
      if (!channelId) return;
      setActiveChannel(channelId);
      navigate(getDMPath(workspaceId, channelId));
    } catch (err) {
      console.error("ChatBot error:", err);
    }
  };

  const handleSavedMessages = async () => {
    if (selfChannel) {
      handleSelectChannel(selfChannel._id);
      return;
    }

    setSelfDmLoading(true);
    try {
      const channel = await createDM(user?._id);
      if (!channel) return;
      setActiveChannel(channel._id);
      navigate(getDMPath(workspaceId, channel._id));
      onClose?.();
    } catch (err) {
      console.error("Saved Messages error:", err);
    } finally {
      setSelfDmLoading(false);
    }
  };

  // Combined count: drafts + scheduled messages
  const scheduledCount = useScheduledStore((s) => s.getScheduledCount());
  const workspaceDraftCount = useDraftStore((s) => countWorkspaceDrafts(s.drafts, workspaceId));
  const fetchUnreadCount = useNotificationStore((s) => s.fetchUnreadCount);
  const laterTotalCount = workspaceDraftCount + scheduledCount;

  const header = (
    <>
      <div className="w-full flex items-center justify-between">
        <WorkspaceSwitcher
          onOpenCreate={() => setShowCreateWorkspace(true)}
          onOpenJoin={() => setShowJoinWorkspace(true)}
          onOpenSettings={() => setShowWorkspaceSettings(true)}
          onOpenInvite={() => setShowInviteMembers(true)}
        />
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-md cursor-pointer transition-colors mobile-menu-btn"
            style={{
              color: "var(--sidebar-text-dim, var(--text-muted))",
              background: "transparent",
              border: "none",
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        )}
      </div>
    </>
  );

  const handleDeleteCategory = async (categoryId) => {
    if (window.confirm("Are you sure you want to delete this category? The channels will not be deleted.")) {
      try {
        await categoryAPI.delete(categoryId);
        toast.success("Category deleted successfully");
      } catch (err) {
        toast.error("Failed to delete category");
      }
    }
  };

  const handleRemoveChannelFromCategory = async (channelId) => {
    try {
      await api.put(`/channels/${channelId}/category`, { categoryId: null });
      toast.success("Channel removed from category");
    } catch (err) {
      toast.error("Failed to remove channel");
    }
  };

  return (
    <>
      <SidebarContainer header={header} aria-label="Channels sidebar">
        {channelSync?.workspaceId === activeWorkspaceId
          && ['pending', 'running'].includes(channelSync.status) && (
          <div
            className="mx-2 mt-2 rounded-md px-3 py-2 text-xs"
            style={{ color: 'var(--sidebar-text-dim, var(--text-muted))', background: 'var(--bg-active)' }}
            role="status"
          >
            Setting up your project channels…
            {channelSync.totalBoards > 0 && (
              <span> {channelSync.completedBoards + channelSync.failedBoards}/{channelSync.totalBoards}</span>
            )}
          </div>
        )}
        {channelSync?.workspaceId === activeWorkspaceId
          && ['partial', 'failed'].includes(channelSync.status) && (
          <div
            className="mx-2 mt-2 rounded-md px-3 py-2 text-xs"
            style={{ color: 'var(--accent-red)', background: 'rgba(220,38,38,.06)' }}
            role="status"
          >
            Some project channels could not be synchronized. They will be retried during reconciliation.
          </div>
        )}
        {/* ── Quick Nav Items (Home mode only) ── */}
        {!isDMMode && (
          <div className="pt-2 pb-1">
            <NavButton
              icon={MessageSquareText}
              label="Threads"
              active={showAllThreads}
              onClick={() => onToggleAllThreads?.()}
            />
            {/* Drafts & Scheduled — navigates to Later Page only, never opens panel */}
                <NavButton
                  icon={Clock}
                  label="Drafts & Scheduled"
                  badge={laterTotalCount}
                  active={isLaterPage}
                  onClick={() => {
                    // Ensure the Later Panel is never opened — clear it first
                    useUIStore.getState().clearActiveWorkspacePanel();
                    // Set the correct default tab
                    useUIStore.getState().setActiveLaterPage(
                      workspaceDraftCount > 0 ? 'drafts' : 'scheduled'
                    );
                    navigate(`/workspace/${workspaceId}/later`);
                    onClose?.();
                  }}
                />
            <NavButton
              icon={Compass}
              label="Directories"
              active={isDirectoriesPage}
              onClick={() => {
                // Clear active channel so channel highlighting doesn't overlap
                // with the Directories view.
                setActiveChannel(null);
                useUIStore.getState().clearActiveWorkspacePanel();
                navigate(getDirectoriesPath(workspaceId));
                onClose?.();
              }}
            />

            {/* ── Category Header Option ── */}
            {isEnterpriseOrPro && (
              <CategoryHeader 
                onCreateCategory={() => setShowCreateCategory(true)}
              />
            )}
          </div>
        )}

        {/* ── Favorites Section ── */}
        {!isDMMode && favoriteChannels.length > 0 && (
          <SidebarSection
            title="Starred"
            count={favoriteChannels.length}
            expanded={expandedSections.starred}
            onToggle={() => toggleSection("starred")}
          >
            {favoriteChannels.map((channel) => {
              const favId = favorites.find(
                (f) => f.targetId === channel._id
              )?._id;
              return (
                <div
                  key={channel._id}
                  className="flex items-center group"
                  style={{ position: 'relative' }}
                >
                  <div className="flex-1 min-w-0">
                    <ChannelListItem
                      channel={channel}
                      isActive={!isLaterPage && channel._id === activeChannelId}
                      unread={unreads[channel._id] || 0}
                      onClick={() => handleSelectChannel(channel._id)}
                      onlineUsers={onlineUsers}
                      hasDraft={hasDraft(channel._id)}
                    />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (favId) removeFavorite(favId);
                    }}
                    className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{
                      color: 'var(--accent-yellow)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      marginRight: 8,
                    }}
                    title="Remove from favorites"
                  >
                    <Star size={14} fill="currentColor" />
                  </button>
                </div>
              );
            })}
          </SidebarSection>
        )}

        {/* Channel Sections */}
        <div className="pt-1">
          {!isDMMode && systemChannels.length > 0 && (
            <SidebarSection
              title="System"
              count={systemChannels.length}
              expanded={expandedSections.system}
              onToggle={() => toggleSection("system")}
            >
              {sortChannels(systemChannels).map((channel) => (
                <ChannelListItem
                  key={channel._id}
                  channel={channel}
                  isActive={!isLaterPage && channel._id === activeChannelId}
                  unread={unreads[channel._id] || 0}
                  onClick={() => handleSelectChannel(channel._id)}

                  hasDraft={hasDraft(channel._id)}
                />
              ))}
            </SidebarSection>
          )}

          {/* ── User-Specific Categories ── */}
          {!isDMMode && isEnterpriseOrPro && (
            <CategoryList
              categories={categories}
              channels={channels}
              expandedGroups={expandedGroups}
              onToggleCategory={handleToggleCategory}
              isLaterPage={isLaterPage}
              activeChannelId={activeChannelId}
              unreads={unreads}
              handleSelectChannel={handleSelectChannel}
              hasDraft={hasDraft}
              setCategoryToEdit={setCategoryToEdit}
              setChannelToMove={setChannelToMove}
              handleDeleteCategory={handleDeleteCategory}
              activeCategoryMenu={activeCategoryMenu}
              setActiveCategoryMenu={setActiveCategoryMenu}
              sortChannels={sortChannels}
            />
          )}

          {!isDMMode && [...publicChannels, ...projectChannels, ...deptChannels].length > 0 && (
            <SidebarSection
              title="Channels"
              count={
                [...publicChannels, ...projectChannels, ...deptChannels].length
              }
              expanded={expandedSections.channels}
              onToggle={() => toggleSection("channels")}
              showAdd
              onAdd={() => setShowCreateChannel(true)}
              addTitle="Create channel"
            >
              {sortChannels([
                ...publicChannels,
                ...projectChannels,
                ...deptChannels,
              ]).map((channel) => (
                <ChannelListItem
                  key={channel._id}
                  channel={channel}
                  isActive={!isLaterPage && channel._id === activeChannelId}
                  unread={unreads[channel._id] || 0}
                  onClick={() => handleSelectChannel(channel._id)}

                  hasDraft={hasDraft(channel._id)}
                />
              ))}
              {[...publicChannels, ...projectChannels, ...deptChannels]
                .length === 0 && (
                <p
                  className="text-xs px-4 py-2"
                  style={{ color: "var(--sidebar-text-dim, var(--text-muted))" }}
                >
                  No channels yet
                </p>
              )}
            </SidebarSection>
          )}



          {!isDMMode && privateChannels.length > 0 && (
            <SidebarSection
              title="Private Channels"
              count={privateChannels.length}
              expanded={expandedSections.privateChannels}
              onToggle={() => toggleSection("privateChannels")}
            >
              {sortChannels(privateChannels).map((channel) => (
                <ChannelListItem
                  key={channel._id}
                  channel={channel}
                  isActive={!isLaterPage && channel._id === activeChannelId}
                  unread={unreads[channel._id] || 0}
                  onClick={() => handleSelectChannel(channel._id)}
                  hasDraft={hasDraft(channel._id)}
                />
              ))}
            </SidebarSection>
          )}

          {/* ── Direct Messages section ── */}
          <SidebarSection
            title={isDMMode ? "Direct messages" : "Direct Messages"}
            count={dmChannels.length}
            expanded={expandedSections.dms}
            onToggle={() => toggleSection("dms")}
            showAdd
            onAdd={() => setShowUserPicker(true)}
            addTitle="Start direct message"
          >
            {/* ── SAVED MESSAGES (self-DM) — pinned at top ── */}
            <SavedMessagesItem
              user={user}
              channel={selfChannel}
              isActive={!isLaterPage && selfChannel?._id === activeChannelId}
              unread={selfChannel ? unreads[selfChannel._id] || 0 : 0}
              isLoading={selfDmLoading}
              hasDraft={selfChannel ? hasDraft(selfChannel._id) : false}
              onClick={handleSavedMessages}
            />
            {/* ── CHATBOT ── */}
            {/* <SidebarItem
              icon={<Bot size={18} />}
              label="ChatBot"
              onClick={handleChatBot}
            /> */}

            {/* ── Regular DM list ── */}
            {sortChannels(dmChannels).map((channel) => (
              <DMListItem
                key={channel._id}
                channel={channel}
                isActive={!isLaterPage && channel._id === activeChannelId}
                unread={unreads[channel._id] || 0}
                onClick={() => handleSelectChannel(channel._id)}
                hasDraft={hasDraft(channel._id)}
              />
            ))}

            {dmChannels.length === 0 && (
              <p
                className="text-xs px-4 py-2"
                style={{ color: "var(--sidebar-text-dim, var(--text-muted))" }}
              >
                {isDMMode
                  ? "Start a direct message to begin private conversations."
                  : "No conversations yet"}
              </p>
            )}
          </SidebarSection>
        </div>

        {/* ── Apps footer ── */}
        {!isDMMode && (
          <div className="py-3 shrink-0 mt-auto">
            <NavButton icon={AppWindow} label="Apps" onClick={() => {}} />
          </div>
        )}
      </SidebarContainer>

      {/* Modals */}
      {showCreateChannel && (
        <CreateChannelModal onClose={() => setShowCreateChannel(false)} />
      )}
      {showCreateCategory && (
        <CreateCategoryModal
          onClose={() => setShowCreateCategory(false)}
        />
      )}
      {categoryToEdit && (
        <EditCategoryModal
          category={categoryToEdit}
          onClose={() => setCategoryToEdit(null)}
        />
      )}
      {channelToMove && (
        <MoveToCategoryModal
          initialCategory={channelToMove.categoryId}
          onClose={() => setChannelToMove(null)}
        />
      )}
      {showUserPicker && (
        <UserPickerModal
          onClose={() => setShowUserPicker(false)}
          onSelect={(channelId) => {
            setShowUserPicker(false);
            handleSelectChannel(channelId);
          }}
        />
      )}
      {showPreferences && (
        <PreferencesModal onClose={() => setShowPreferences(false)} />
      )}
      {showStatusModal && (
        <SetStatusModal onClose={() => setShowStatusModal(false)} />
      )}
      {showCreateWorkspace && (
        <CreateWorkspaceModal onClose={() => setShowCreateWorkspace(false)} />
      )}
      {showJoinWorkspace && (
        <JoinWorkspaceModal
          onClose={() => setShowJoinWorkspace(false)}
          onJoined={(workspace) => {
            setShowJoinWorkspace(false);
            if (workspace?._id) {
              switchWorkspace(workspace._id);
              navigate(`/chat/${workspace._id}`);
            }
          }}
        />
      )}
      {showWorkspaceSettings && (
        <WorkspaceSettingsModal
          onClose={() => setShowWorkspaceSettings(false)}
        />
      )}
      {showInviteMembers && (
        <InviteMembersModal
          isOpen={showInviteMembers}
          onClose={() => setShowInviteMembers(false)}
          workspaceId={workspaceId}
        />
      )}
    </>
  );
}

/* ─── Nav Button ──────────────────────────────────────────────────────── */

function NavButton({ icon: Icon, label, onClick, badge, active }) {
  return (
    <button
      onClick={onClick}
      className={`sidebar-item ${active ? "active" : ""}`}
    >
      <span className="sidebar-item-icon">
        <Icon size={18} style={{ opacity: 0.8 }} />
      </span>
      <span className="sidebar-item-content">
        <span className="sidebar-item-label" style={{ fontWeight: 500 }}>
          {label}
        </span>
      </span>
      {badge > 0 && <span className="badge badge-red">{badge}</span>}
    </button>
  );
}

/* ─── Saved Messages Item ─────────────────────────────────────────────── */
function SavedMessagesItem({
  user,
  channel,
  isActive,
  unread,
  isLoading,
  hasDraft,
  onClick,
}) {
  const timeAgo = channel?.lastMessageAt
    ? (() => {
        const d = new Date(channel.lastMessageAt);
        return isNaN(d.getTime())
          ? ""
          : formatDistanceToNowStrict(d, { addSuffix: false });
      })()
    : "";

  return (
    <SidebarItem
      icon={
        <div className="relative shrink-0">
          {isLoading ? (
            <div
              className="flex items-center justify-center"
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--bg-active)",
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 15 15"
                fill="none"
                style={{
                  animation: "spin 700ms linear infinite",
                  color: "var(--accent-primary)",
                }}
              >
                <circle
                  cx="7.5"
                  cy="7.5"
                  r="6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="28"
                  strokeDashoffset="10"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          ) : (
            <>
              <Avatar
                member={{
                  name: user?.name || "You",
                  avatar: user?.avatar,
                  onlineStatus: "online",
                }}
                size={28}
                showStatus={false}
              />
              <span
                className="absolute rounded-full"
                style={{
                  width: 10,
                  height: 10,
                  background: "var(--status-online)",
                  border: "2px solid var(--sidebar-bg-inner, var(--bg-sidebar))",
                  bottom: -1,
                  right: -1,
                }}
              />
            </>
          )}
        </div>
      }
      label={
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {user?.name || "You"}
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              padding: "1px 5px",
              borderRadius: 4,
              background: isActive
                ? "rgba(255,255,255,0.22)"
                : "var(--sidebar-icon-hover, var(--bg-active))",
              color: isActive ? "#fff" : "var(--sidebar-text, var(--accent-primary))",
              lineHeight: "14px",
            }}
          >
            you
          </span>
        </span>
      }
      sublabel={
        hasDraft ? (
          <span
            className="flex items-center gap-1"
            style={{
              color: "var(--accent-primary)",
              fontSize: 11,
            }}
          >
            <span style={{ fontSize: 10 }}>✏️</span> Draft
          </span>
        ) : (
          channel?.lastMessagePreview
        )
      }
      meta={
        timeAgo && (
          <span
            className="text-[11px]"
            style={{
              color: isActive ? "rgba(255,255,255,0.7)" : "var(--text-muted)",
            }}
          >
            {timeAgo}
          </span>
        )
      }
      isActive={isActive}
      isBold={unread > 0 || hasDraft}
      badge={unread}
      onClick={onClick}
    />
  );
}

/* ─── DM List Item ─────────────────────────────────────────────────────── */

function DMListItem({
  channel,
  isActive,
  unread,
  onClick,
  hasDraft,
}) {
  const status = usePresenceStore((s) => s.presence[channel.dmRecipientId]) || "offline";
  const isOnline = status === "online";
  const isAway = status === "away";

  const timeAgo = channel.lastMessageAt
    ? (() => {
        const d = new Date(channel.lastMessageAt);
        return isNaN(d.getTime())
          ? ""
          : formatDistanceToNowStrict(d, { addSuffix: false });
      })()
    : "";

  return (
    <SidebarItem
      icon={
        <div className="relative shrink-0">
          <Avatar
            member={{
              name: channel.name,
              avatar: channel.avatar,
              onlineStatus: isOnline ? (isAway ? "away" : "online") : "offline",
            }}
            size={28}
            showStatus={false}
          />
          {isOnline && (
            <span
              className="absolute rounded-full"
              style={{
                width: 10,
                height: 10,
                background: isAway
                  ? "var(--status-away)"
                  : "var(--status-online)",
                border: "2px solid var(--sidebar-bg-inner, var(--bg-sidebar))",
                bottom: -1,
                right: -1,
              }}
            />
          )}
        </div>
      }
      label={channel.name}
      sublabel={
        hasDraft ? (
          <span
            className="flex items-center gap-1"
            style={{ color: "var(--accent-primary)", fontSize: 11 }}
          >
            <span style={{ fontSize: 10 }}>✏️</span> Draft
          </span>
        ) : (
          channel.lastMessagePreview || undefined
        )
      }
      meta={
        timeAgo && (
          <span
            className="text-[11px]"
            style={{
              color: isActive ? "rgba(255,255,255,0.7)" : "var(--text-muted)",
            }}
          >
            {timeAgo}
          </span>
        )
      }
      isActive={isActive}
      isBold={unread > 0 || hasDraft}
      badge={unread}
      onClick={onClick}
    />
  );
}
