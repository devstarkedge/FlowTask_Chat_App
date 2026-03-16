import { useState, useMemo } from "react";
import { useChannelStore } from "../../stores/channelStore";
import { useAuthStore } from "../../stores/authStore";
import { useChatStore } from "../../stores/chatStore";
import {
  Hash,
  Lock,
  MessageCircle,
  Users,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  Volume2,
  X,
  MessageSquareText,
  Bookmark,
  Send,
  Globe,
  Compass,
  Radio,
  AppWindow,
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

const CHANNEL_ICONS = {
  project: Hash,
  department: Users,
  team: Users,
  dm: MessageCircle,
  system: Volume2,
  public: Hash,
  private: Lock,
};

export default function NavigationSidebar({
  onClose,
  onToggleAllThreads,
  onToggleNotifications,
  onToggleSaved,
}) {
  const { channels, activeChannelId, setActiveChannel, unreads } =
    useChannelStore();
  const { user } = useAuthStore();
  const { onlineUsers } = useChatStore();
  const [expandedSections, setExpandedSections] = useState({
    channels: true,
    privateChannels: true,
    dms: true,
    system: true,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showJoinWorkspace, setShowJoinWorkspace] = useState(false);
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);

  const toggleSection = (section) => {
    setExpandedSections((s) => ({ ...s, [section]: !s[section] }));
  };

  const projectChannels = channels.filter(
    (c) => c.type === "project" && !c.isArchived,
  );
  const publicChannels = channels.filter(
    (c) => c.type === "public" && !c.isArchived,
  );
  const privateChannels = channels.filter(
    (c) => c.type === "private" && !c.isArchived,
  );
  const dmChannels = useMemo(() => {
    const currentChatId = user?._id?.toString?.();
    const currentFlowTaskId = user?.flowTaskUserId?.toString?.();
    const selfIds = new Set([currentChatId, currentFlowTaskId].filter(Boolean));

    return channels
      .filter((c) => c.type === "dm" && !c.isArchived)
      .map((c) => {
        const participants = Array.isArray(c.dmParticipants)
          ? c.dmParticipants.map((p) => p?.toString?.() || String(p))
          : [];
        const recipientId =
          c.dmRecipientId || participants.find((p) => p && !selfIds.has(p)) || null;
        return { ...c, dmRecipientId: recipientId };
      });
  }, [channels, user]);
  const systemChannels = channels.filter(
    (c) => c.type === "system" && !c.isArchived,
  );
  const deptChannels = channels.filter(
    (c) => (c.type === "department" || c.type === "team") && !c.isArchived,
  );

  const filteredChannels = (list) => {
    if (!searchQuery) return list;
    return list.filter((c) =>
      c.name?.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  };

  const sortChannels = (list, isDMSort = false) => {
    return [...list].sort((a, b) => {
      const aUnread = unreads[a._id] || 0;
      const bUnread = unreads[b._id] || 0;
      if (aUnread > 0 && bUnread === 0) return -1;
      if (aUnread === 0 && bUnread > 0) return 1;
      if (isDMSort) {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        if (aTime !== bTime) return bTime - aTime;
      }
      return (a.name || "").localeCompare(b.name || "");
    });
  };

  const handleSelectChannel = (channelId) => {
    setActiveChannel(channelId);
    onClose?.();
  };

  return (
    <nav
      className="flex flex-col h-full select-none overflow-hidden"
      aria-label="Channels sidebar"
      style={{
        width: "100%",
        minWidth: "100%",
        background: "#F7F8FC",
        borderRight: "1px solid var(--border-secondary)",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Workspace Header */}
      <div
        className="px-5 flex items-center justify-between shrink-0"
        style={{
          height: "var(--header-height, 64px)",
          borderBottom: "1px solid var(--border-secondary)",
        }}
      >
        <WorkspaceSwitcher
          onOpenCreate={() => setShowCreateWorkspace(true)}
          onOpenJoin={() => setShowJoinWorkspace(true)}
          onOpenSettings={() => setShowWorkspaceSettings(true)}
        />
        <div className="flex items-center gap-1">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-md cursor-pointer transition-colors mobile-menu-btn"
              style={{
                color: "#8A92A6",
                background: "transparent",
                border: "none",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#EEF1FF")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-5 pt-5 pb-3">
        {showSearch ? (
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg"
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border-primary)",
            }}
          >
            <Search size={18} style={{ color: "#8A92A6", flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none text-[16px]"
              style={{ color: "#1F2A44" }}
              autoFocus
            />
            <button
              onClick={() => {
                setShowSearch(false);
                setSearchQuery("");
              }}
              className="p-1 rounded cursor-pointer"
              style={{
                color: "#8A92A6",
                background: "transparent",
                border: "none",
              }}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowSearch(true)}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-[16px] cursor-pointer transition-all"
            style={{
              color: "#8A92A6",
              background: "var(--bg-hover)",
              border: "1px solid var(--border-secondary)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.borderColor = "var(--border-primary)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.borderColor = "var(--border-secondary)")
            }
          >
            <Search size={18} />
            <span>Search...</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pt-4 pb-4">
        {/* Quick Nav Items (Attached to sidebar with lines) */}
     <div className="px-5 mb-10">
  <div
    className="flex flex-col mr-3.5"
    style={{
      borderTop: "2px solid #E2E8F0",
      borderBottom: "2px solid #E2E8F0",
    }}
  >
    <div style={{ borderBottom: "2px solid #E2E8F0", padding: "8px 20px" }}>
      <NavButton
        icon={MessageSquareText}
        label="Threads"
        onClick={() => onToggleAllThreads?.()}
      />
    </div>

    <div style={{ borderBottom: "2px solid #E2E8F0", padding: "8px 20px" }}>
      <NavButton icon={Radio} label="Huddles" onClick={() => {}} />
    </div>

    <div style={{ borderBottom: "2px solid #E2E8F0", padding: "8px 20px" }}>
      <NavButton icon={Send} label="Drafts & Sent" onClick={() => {}} />
    </div>

    <div style={{ padding: "8px 20px" }}>
      <NavButton
        icon={Compass}
        label="Directories"
        onClick={() => {}}
      />
    </div>
  </div>
</div>

<br />        
        {/* Starred Card (Distinct and Separated) */}
        <div className="flex flex-col gap-2">
        <div
          className="p-5 rounded mb-16 "
          style={{
            background: "#e9ecfe",
            border: "2px solid #E2E8F0",
            margin: "0 16px",
            padding: "4px",
          }}
        >
          <div className="flex flex-col ">
            <NavButton
              icon={Bookmark}
              label="Starred"
              onClick={() => onToggleSaved?.()}
            />
          </div>
        </div>

        {/* External Connections - Starred Style */}
        <div
          className="p-5 rounded mb-16"
          style={{
            background: "#e9ecfe",
            border: "2px solid #E2E8F0",
            margin: "0 16px",
            padding: "4px",
          }}
        >
          <div className="flex flex-col">
            <NavButton
              icon={Globe}
              label="External Connections"
              onClick={() => {}}
            />
          </div>
        </div>
        </div>
<br />
        {/* Channel List Container with spacing */}
        <div className="px-1 pt-6">
          {systemChannels.length > 0 && (
            <ChannelSection
              title="System"
              channels={sortChannels(filteredChannels(systemChannels))}
              expanded={expandedSections.system}
              onToggle={() => toggleSection("system")}
              activeId={activeChannelId}
              unreads={unreads}
              onSelect={handleSelectChannel}
              onlineUsers={onlineUsers}
            />
          )}

          <ChannelSection
            title="Channels"
            channels={sortChannels(
              filteredChannels([
                ...publicChannels,
                ...projectChannels,
                ...deptChannels,
              ]),
            )}
            expanded={expandedSections.channels}
            onToggle={() => toggleSection("channels")}
            activeId={activeChannelId}
            unreads={unreads}
            onSelect={handleSelectChannel}
            showAdd
            onAdd={() => setShowCreateChannel(true)}
            onlineUsers={onlineUsers}
          />

          {privateChannels.length > 0 && (
            <ChannelSection
              title="Private Channels"
              channels={sortChannels(filteredChannels(privateChannels))}
              expanded={expandedSections.privateChannels}
              onToggle={() => toggleSection("privateChannels")}
              activeId={activeChannelId}
              unreads={unreads}
              onSelect={handleSelectChannel}
              onlineUsers={onlineUsers}
            />
          )}

          <ChannelSection
            title="Direct Messages"
            channels={sortChannels(filteredChannels(dmChannels), true)}
            expanded={expandedSections.dms}
            onToggle={() => toggleSection("dms")}
            activeId={activeChannelId}
            unreads={unreads}
            onSelect={handleSelectChannel}
            showAdd
            onAdd={() => setShowUserPicker(true)}
            isDM
            onlineUsers={onlineUsers}
          />
        </div>
      </div>

      <div
        className="px-5 py-4 shrink-0 flex items-center justify-between"
        style={{ borderTop: "2px solid var(--border-secondary)" }}
      >
        <NavButton icon={AppWindow} label="Apps" onClick={() => {}} />
      </div>

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
        <JoinWorkspaceModal onClose={() => setShowJoinWorkspace(false)} />
      )}
      {showWorkspaceSettings && (
        <WorkspaceSettingsModal
          onClose={() => setShowWorkspaceSettings(false)}
        />
      )}
    </nav>
  );
}

/* ─── Nav Button ──────────────────────────────────────────────────────── */

function NavButton({ icon: Icon, label, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3.5 w-full px-4 py-2.5 rounded text-[16px] font-medium cursor-pointer transition-colors mb-1"
      style={{
        color: "#070534",
        background: "transparent",
        border: "none",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#EEF1FF")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Icon size={20} style={{ opacity: 0.8 }} />
      <span className="flex-1 text-left truncate">{label}</span>
      {badge > 0 && <span className="badge badge-red">{badge}</span>}
    </button>
  );
}

/* ─── Channel Section ───────────────────────────────────────────────────── */

function ChannelSection({
  title,
  channels,
  expanded,
  onToggle,
  activeId,
  unreads,
  onSelect,
  showAdd,
  onAdd,
  isDM,
  onlineUsers,
}) {
  return (
    <div
      className="mb-8 p-2 rounded "
      style={{
        background: "#e9ecfe",
        border: "1px solid #E2E8F0",
        margin: "0 12px 24px",
      }}
    >
      <div className="flex items-center justify-between px-3 py-2 h-8 ">
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-[16px] p-10 font-bold uppercase tracking-normal cursor-pointer"
          style={{
            color: "#070534",
            background: "transparent",
            border: "2px",
          }}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span>{title}</span>
          {channels.length > 0 && (
            <span className="ml-1.5 font-normal opacity-50">
              {channels.length}
            </span>
          )}
        </button>
        {showAdd && (
          <button
            onClick={onAdd}
            className="p-1 rounded cursor-pointer transition-colors"
            style={{
              color: "#8A92A6",
              background: "transparent",
              border: "none",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#1F2A44")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#8A92A6")}
            title={isDM ? "Start direct message" : "Create channel"}
          >
            <Plus size={20} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="flex flex-col gap-2 pl-4 pr-1">
          {channels.map((channel) => (
            <ChannelItem
              key={channel._id}
              channel={channel}
              isActive={channel._id === activeId}
              unread={unreads[channel._id] || 0}
              onClick={() => onSelect(channel._id)}
              isDM={isDM}
              onlineUsers={onlineUsers}
            />
          ))}
          {channels.length === 0 && (
            <p
              className="text-md px-4 py-2 opacity-60"
              style={{ color: "#8A92A6" }}
            >
              No {isDM ? "conversations" : "channels"} yet
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Channel Item ──────────────────────────────────────────────────────── */

function ChannelItem({
  channel,
  isActive,
  unread,
  onClick,
  isDM,
  onlineUsers,
}) {
  const Icon = CHANNEL_ICONS[channel.type] || Hash;
  const isOnline = isDM && onlineUsers?.has?.(channel.dmRecipientId);
  const isAway =
    isOnline && onlineUsers?.get?.(channel.dmRecipientId) === "away";

  const activeBg = "linear-gradient(90deg, #93A4FC, #C7D2FE)";

  return (
    <button
      onClick={onClick}
      className="flex items-center h-10 gap-2 px-3 py-2 p-10 w-full text-left rounded cursor-pointer transition-all"
      style={{
        background: isActive ? activeBg : "transparent",
        color: "#1F2A44",
        fontWeight: unread > 0 ? 600 : 400,
        border: "none",
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = "#EEF1FF";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = "transparent";
      }}
    >
      {isDM ? (
        <div className="relative shrink-0">
          <Avatar
            member={{
              name: channel.name,
              avatar: channel.avatar,
              onlineStatus: isOnline ? (isAway ? "away" : "online") : "offline",
            }}
            size={42}
            showStatus={false}
          />
          {isOnline && (
            <span
              className="absolute rounded-full"
              style={{
                width: 12,
                height: 12,
                background: isAway ? "#f59e0b" : "var(--status-online)",
                border: `3px solid #F7F8FC`,
                bottom: 0,
                right: 0,
              }}
            />
          )}
        </div>
      ) : (
        <Icon
          size={20}
          style={{ opacity: isActive ? 1 : 0.6, flexShrink: 0 }}
        />
      )}

      <div className="flex-1 min-w-0">
        <span
          className="truncate text-[16px] font-medium block"
          style={{ color: "#070534" }}
        >
          {channel.name}
        </span>
        {isDM && channel.lastMessagePreview && (
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className="truncate text-[15px] flex-1"
              style={{ color: "#8A92A6", fontWeight: 400, lineHeight: "22px" }}
            >
              {channel.lastMessagePreview}
            </span>
            {channel.lastMessageAt && (
              <span
                className="text-[13px] shrink-0"
                style={{ color: "#8A92A6", fontWeight: 400 }}
              >
                {(() => {
                  const d = new Date(channel.lastMessageAt);
                  return isNaN(d.getTime())
                    ? ""
                    : formatDistanceToNowStrict(d, { addSuffix: false });
                })()}
              </span>
            )}
          </div>
        )}
      </div>

      {unread > 0 && (
        <span
          className="badge badge-red"
          style={{ fontSize: 12, minWidth: 22, height: 22, borderRadius: 11 }}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
