import { useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useChannelStore } from "../../stores/channelStore";
import { useAuthStore } from "../../stores/authStore";
import { useChatStore } from "../../stores/chatStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
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
  BookMarked, // icon for Saved Messages
} from "lucide-react";
import { Avatar } from "../chat/MemberAvatarGroup";
import CreateChannelModal from "../chat/CreateChannelModal";
import UserPickerModal from "../chat/UserPickerModal";
import PreferencesModal from "../chat/PreferencesModal";
import SetStatusModal from "../chat/SetStatusModal";
import WorkspaceSwitcher from "../workspace/WorkspaceSwitcher";
import CreateWorkspaceModal from "../workspace/CreateWorkspaceModal";
import JoinWorkspaceModal from "../workspace/JoinWorkspaceModal";
import WorkspaceSettingsModal from "../workspace/WorkspaceSettingsModal";
import { formatDistanceToNowStrict } from "date-fns";
import {
  getChannelPath,
  getDMPath,
  getDirectoriesPath,
} from "../../utils/chatRoutes";
import { useDraftStore } from "../../stores/draftStore";
import { isContentEmpty } from "../../utils/draftUtils";
import SidebarContainer from "./sidebar/SidebarContainer";
import SidebarItem from "./sidebar/SidebarItem";
import SidebarSection from "./sidebar/SidebarSection";
import api from "../../services/api";

const CHANNEL_ICONS = {
  project: Hash,
  department: Users,
  team: Users,
  dm: MessageCircle,
  system: Volume2,
  public: Hash,
  private: Lock,
  self: BookMarked, // icon for self-DM
};

export default function NavigationSidebar({
  mode = "home",
  onClose,
  onToggleAllThreads,
  onToggleNotifications,
  onToggleSaved,
}) {
  const navigate = useNavigate();
  const { workspaceId } = useParams();
  const { channels, activeChannelId, setActiveChannel, unreads, createDM } =
    useChannelStore();
  const { user } = useAuthStore();
  const { onlineUsers } = useChatStore();
  const { switchWorkspace } = useWorkspaceStore();
  const drafts = useDraftStore((s) => s.drafts);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const hasDraft = (channelId) => {
    const key = `${activeWorkspaceId}:${channelId}:root`;
    const draft = drafts[key];
    if (!draft) return false;
    return !isContentEmpty(draft.html, draft.text);
  };

  const [expandedSections, setExpandedSections] = useState({
    channels: true,
    privateChannels: true,
    dms: true,
    system: true,
  });

  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showJoinWorkspace, setShowJoinWorkspace] = useState(false);
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);

  // ── Self-DM loading state ────────────────────────────────────────────────
  const [selfDmLoading, setSelfDmLoading] = useState(false);

  const toggleSection = (section) => {
    setExpandedSections((s) => ({ ...s, [section]: !s[section] }));
  };

  const projectChannels = channels.filter(
    (c) => c.type === "project" && c.visibility !== "private" && !c.isArchived,
  );
  const publicChannels = channels.filter(
    (c) => c.type === "public" && !c.isArchived,
  );
  const privateChannels = channels.filter(
    (c) =>
      (c.type === "private" ||
        (c.visibility === "private" &&
          c.type !== "dm" &&
          c.type !== "system" &&
          c.type !== "self")) &&
      !c.isArchived,
  );

  // ── Self-DM channel (decorated by backend as `isSelfDM`) ────────────────
  const selfChannel = useMemo(
    () => channels.find((c) => c.isSelfDM || c.isSelf || c.type === "self"),
    [channels],
  );

  const dmChannels = useMemo(() => {
    const currentChatId = user?._id?.toString?.();
    const currentFlowTaskId = user?.flowTaskUserId?.toString?.();
    const selfIds = new Set([currentChatId, currentFlowTaskId].filter(Boolean));

    return channels
      .filter(
        (c) => c.type === "dm" && !c.isArchived && !c.isAI && !c.isSelf && !c.isSelfDM, // exclude self-DM from regular DM list
      )
      .map((c) => {
        const participants = Array.isArray(c.dmParticipants)
          ? c.dmParticipants.map((p) => p?.toString?.() || String(p))
          : [];

        const recipientId =
          c.dmRecipientId ||
          participants.find((p) => p && !selfIds.has(p)) ||
          null;

        return { ...c, dmRecipientId: recipientId };
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

  const handleSelectChannel = (channelId) => {
    const channel = channels.find((c) => c._id === channelId);
    setActiveChannel(channelId);

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

  // ── Open or create the self-DM ──────────────────────────────────────────
  const handleSavedMessages = async () => {
    // If we already have it in the channel list, just navigate there
    if (selfChannel) {
      handleSelectChannel(selfChannel._id);
      return;
    }

    // Use existing client-side createDM flow (reuses /channels/dm)
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

  const header = (
    <>
      <div
        className="w-full flex items-center justify-between"
        style={{ minHeight: 32 }}
      >
        <WorkspaceSwitcher
          onOpenCreate={() => setShowCreateWorkspace(true)}
          onOpenJoin={() => setShowJoinWorkspace(true)}
          onOpenSettings={() => setShowWorkspaceSettings(true)}
        />
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-md cursor-pointer transition-colors mobile-menu-btn"
            style={{
              color: "var(--text-muted)",
              background: "transparent",
              border: "none",
            }}
          >
            <X size={18} />
          </button>
        )}
      </div>
    </>
  );

  return (
    <>
      <SidebarContainer header={header} aria-label="Channels sidebar">
        {/* Quick Nav Items (Home mode only) */}
        {!isDMMode && (
          <div className="px-3 pt-3 pb-2">
            <div>
              <NavButton
                icon={MessageSquareText}
                label="Threads"
                onClick={() => onToggleAllThreads?.()}
              />
              <NavButton
                icon={Send}
                label="Drafts & Sent"
                onClick={() => navigate(`/workspace/${workspaceId}/later`)}
              />
              <NavButton
                icon={Compass}
                label="Directories"
                onClick={() => navigate(getDirectoriesPath(workspaceId))}
              />
            </div>

            {/* Starred & External */}
            <div className="mt-3 flex flex-col gap-2">
              <div
                className="rounded-md"
                style={{ background: "var(--bg-active)", padding: "2px" }}
              >
                <NavButton
                  icon={Bookmark}
                  label="Saved"
                  onClick={() => onToggleSaved?.()}
                />
              </div>

              <div
                className="rounded-md"
                style={{ background: "var(--bg-active)", padding: "2px" }}
              >
                <NavButton
                  icon={Globe}
                  label="External Connections"
                  onClick={() => {}}
                />
              </div>
            </div>
          </div>
        )}

        {/* Channel Sections */}
        <div className="pt-3">
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
                  isActive={channel._id === activeChannelId}
                  unread={unreads[channel._id] || 0}
                  onClick={() => handleSelectChannel(channel._id)}
                  onlineUsers={onlineUsers}
                  hasDraft={hasDraft(channel._id)}
                />
              ))}
            </SidebarSection>
          )}

          {!isDMMode && (
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
                  isActive={channel._id === activeChannelId}
                  unread={unreads[channel._id] || 0}
                  onClick={() => handleSelectChannel(channel._id)}
                  onlineUsers={onlineUsers}
                  hasDraft={hasDraft(channel._id)}
                />
              ))}
              {[...publicChannels, ...projectChannels, ...deptChannels]
                .length === 0 && (
                <p
                  className="text-xs px-3 py-2"
                  style={{ color: "var(--text-muted)" }}
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
                  isActive={channel._id === activeChannelId}
                  unread={unreads[channel._id] || 0}
                  onClick={() => handleSelectChannel(channel._id)}
                  onlineUsers={onlineUsers}
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
              isActive={selfChannel?._id === activeChannelId}
              unread={selfChannel ? unreads[selfChannel._id] || 0 : 0}
              isLoading={selfDmLoading}
              hasDraft={selfChannel ? hasDraft(selfChannel._id) : false}
              onClick={handleSavedMessages}
            />
            {/* ── CHATBOT ── */}
            <SidebarItem
              icon={<Bot size={18} />}
              label="ChatBot"
              onClick={handleChatBot}
            />

            {/* ── Regular DM list ── */}
            {sortChannels(dmChannels).map((channel) => (
              <DMListItem
                key={channel._id}
                channel={channel}
                isActive={channel._id === activeChannelId}
                unread={unreads[channel._id] || 0}
                onClick={() => handleSelectChannel(channel._id)}
                onlineUsers={onlineUsers}
                hasDraft={hasDraft(channel._id)}
              />
            ))}

            {dmChannels.length === 0 && (
              <p
                className="text-xs px-3 py-2"
                style={{ color: "var(--text-muted)" }}
              >
                {isDMMode
                  ? "Start a direct message to begin private conversations."
                  : "No conversations yet"}
              </p>
            )}
          </SidebarSection>
        </div>

        {/* Apps footer */}
        {!isDMMode && (
          <div className="px-4 py-3 shrink-0 mt-auto">
            <NavButton icon={AppWindow} label="Apps" onClick={() => {}} />
          </div>
        )}
      </SidebarContainer>

      {/* Modals */}
      {showCreateChannel && (
        <CreateChannelModal onClose={() => setShowCreateChannel(false)} />
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
    </>
  );
}

/* ─── Nav Button ──────────────────────────────────────────────────────── */

function NavButton({ icon: Icon, label, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className="sidebar-item"
      style={{ padding: "8px 12px" }}
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
                  border: "2px solid var(--bg-sidebar)",
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
                : "var(--bg-active)",
              color: isActive ? "#fff" : "var(--accent-primary)",
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
              color: isActive
                ? "rgba(255,255,255,0.7)"
                : "var(--text-muted)",
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

/* ─── Channel List Item ────────────────────────────────────────────────── */

function ChannelListItem({
  channel,
  isActive,
  unread,
  onClick,
  onlineUsers,
  hasDraft,
}) {
  let Icon = CHANNEL_ICONS[channel.type] || Hash;
  if (channel.visibility === "private") Icon = Lock;
  else if (channel.visibility === "public") Icon = Hash;

  return (
    <SidebarItem
      icon={<Icon size={18} style={{ opacity: isActive ? 1 : 0.6 }} />}
      label={channel.name}
      sublabel={
        hasDraft ? (
          <span
            className="flex items-center gap-1"
            style={{ color: "var(--accent-primary)", fontSize: 11 }}
          >
            <span style={{ fontSize: 10 }}>✏️</span> Draft
          </span>
        ) : undefined
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
  onlineUsers,
  hasDraft,
}) {
  const isOnline = onlineUsers?.has?.(channel.dmRecipientId);
  const isAway =
    isOnline && onlineUsers?.get?.(channel.dmRecipientId) === "away";

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
                border: "2px solid var(--bg-sidebar)",
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
