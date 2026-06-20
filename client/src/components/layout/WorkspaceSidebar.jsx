import { memo, useState, useCallback, useRef, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Home,
  MessageSquare,
  Bell,
  FolderOpen,
  Bookmark,
  Wrench,
  Plus,
} from "lucide-react";
import { useUIStore } from "../../stores/uiStore";
import { useAuthStore } from "../../stores/authStore";
import { useNotificationStore } from "../../stores/notificationStore";
import { useLaterStore } from "../../stores/laterStore";
import { useChannelStore } from "../../stores/channelStore";
import { usePresenceStore } from "../../stores/presenceStore";
import { Avatar } from "../chat/MemberAvatarGroup";
import CreateMenu from "../ui/CreateMenu";
import UserProfileMenu from "../ui/UserProfileMenu";
import PreferencesModal from "../chat/PreferencesModal";
import SetStatusModal from "../chat/SetStatusModal";
import HoverPreview from "./HoverPreview";
import useHoverPanelController from "./hooks/useHoverPanelController";
import { CHAT_FEATURE_FLAGS } from "../../config/featureFlags";


const NAV_ITEMS = [
  { id: "home", icon: Home, label: "Home", path: "" },
  { id: "dms", icon: MessageSquare, label: "DMs", path: "/dms" },
  { id: "activity", icon: Bell, label: "Activity", path: "/activity" },
  { id: "files", icon: FolderOpen, label: "Files", path: "/files" },
  { id: "later", icon: Bookmark, label: "Later", path: "/later" },
  { id: "tools", icon: Wrench, label: "Tools", path: "/tools" },
];

const WorkspaceSidebar = memo(function WorkspaceSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { workspaceId } = useParams();
  const { user } = useAuthStore();
  const unreadNotifications = useNotificationStore((s) => s.unreadCount);
  const presenceMap = usePresenceStore((s) => s.presence);
  const savedCount = useLaterStore((s) => s.savedMessages.length);
  
  const userStatus = presenceMap[user?._id] || user?.onlineStatus || "online";
  const statusColor = 
    userStatus === "online" ? "var(--status-online)" : 
    userStatus === "away" ? "var(--status-away)" : 
    userStatus === "dnd" ? "var(--status-dnd)" : 
    "var(--status-offline)";

  // Combined count for the Later icon badge
  const laterCount = savedCount;
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showSetStatus, setShowSetStatus] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const createBtnRef = useRef(null);
  const avatarBtnRef = useRef(null);
  const {
    activePanel,
    anchorRect,
    openFromTrigger,
    refreshAnchorRect,
    queueClose,
    cancelClose,
    closeNow,
  } = useHoverPanelController({ openDelay: 140, closeDelay: 220 });

  const basePath = `/workspace/${workspaceId}`;

  const clearActiveWorkspacePanel = useUIStore(
    (s) => s.clearActiveWorkspacePanel,
  );
  const activeWorkspacePanel = useUIStore((s) => s.activeWorkspacePanel);

  const getActiveId = () => {
    // The Workspace sidebar's "Later" icon should only be active when
    // the Later panel itself is open. Do NOT treat the Later page route
    // as activating the Workspace sidebar bookmark icon — navigation to
    // the Later page is handled and highlighted by the NavigationSidebar.
    if (activeWorkspacePanel === "later") return "later";

    const path = location.pathname.replace(basePath, "");
    if (path.startsWith("/dms") || path.startsWith("/dm/")) return "dms";
    if (path.startsWith("/activity")) return "activity";
    if (path.startsWith("/files")) return "files";
    if (path.startsWith("/tools")) return "tools";
    if (path === "" || path === "/" || path.startsWith("/channel/"))
      return "home";
    return "home";
  };

  const activeId = getActiveId();

  const handleNav = useCallback(
    (item) => {
      if (item.id === "later") {
        if (activeWorkspacePanel === "later") {
          clearActiveWorkspacePanel();
        } else {
          useUIStore.getState().setActiveWorkspacePanel("later");
        }
        return;
      }

      // Opening any other section closes any active workspace panel
      clearActiveWorkspacePanel();

      // Clear active channel when navigating away from chat to other sections
      if (["activity", "files", "tools"].includes(item.id)) {
        useChannelStore.getState().setActiveChannel(null);
      }

      navigate(`${basePath}${item.path}`);
    },
    [navigate, basePath, clearActiveWorkspacePanel, activeWorkspacePanel],
  );

  const handleHoverEnter = useCallback(
    (id, e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (!["dms", "activity", "files"].includes(id)) {
        if (!CHAT_FEATURE_FLAGS.slackHoverPanels) closeNow();
        return;
      }

      if (CHAT_FEATURE_FLAGS.slackHoverPanels) {
        cancelClose();
        if (activePanel === id) {
          refreshAnchorRect(rect);
          return;
        }
        openFromTrigger(id, rect);
        return;
      }

      openFromTrigger(id, rect);
    },
    [activePanel, cancelClose, closeNow, openFromTrigger, refreshAnchorRect],
  );

  const handleHoverLeave = useCallback(
    (id) => {
      if (!["dms", "activity", "files"].includes(id)) return;
      if (CHAT_FEATURE_FLAGS.slackHoverPanels) {
        queueClose();
        return;
      }
      closeNow();
    },
    [closeNow, queueClose],
  );

  // Close menus on Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setShowCreateMenu(false);
        setShowUserMenu(false);
        setShowPreferences(false);
        closeNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeNow]);

  useEffect(() => {
    closeNow();
  }, [location.pathname, closeNow]);

  return (
    <>
      <nav className="workspace-sidebar" aria-label="Workspace navigation">
        {/* Logo */}
        <button
          className="flex items-center justify-center transition-all duration-200 hover:scale-105"
          style={{
            width: 42,
            height: 42,
            borderRadius: "14px",
            padding: 0,
          }}
          onClick={() => navigate(basePath)}
          aria-label="Go to home"
        >
          <img
            src="/logo.png"
            alt="Logo"
            onClick={
              () => navigate(basePath)
            }
          />
        </button>

        <div className="workspace-sidebar-divider" />

        {/* Nav Icons */}
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`workspace-sidebar-icon relative ${activeId === item.id ? "active" : ""}`}
            onClick={() => handleNav(item)}
            onMouseEnter={(e) => handleHoverEnter(item.id, e)}
            onMouseLeave={() => handleHoverLeave(item.id)}
            onPointerEnter={(e) => handleHoverEnter(item.id, e)}
            onPointerLeave={() => handleHoverLeave(item.id)}
            aria-label={item.label}
            data-tooltip={item.label}
          >
            <item.icon size={20} />
            {item.id === "activity" && unreadNotifications > 0 && (
              <span
                className="absolute shadow-[0_0_0_2px_var(--bg-workspace-sidebar)] flex items-center justify-center rounded-full text-[10px] font-bold"
                style={{
                  top: "-4px",
                  right: "-4px",
                  minWidth: "16px",
                  height: "16px",
                  padding: "0 4px",
                  background: "var(--accent-red)",
                  color: "white",
                }}
              >
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            )}
            {/* Later icon badge: shows count of items in the Later Panel */}
            {item.id === "later" && laterCount > 0 && (
              <span
                className="absolute shadow-[0_0_0_2px_var(--bg-workspace-sidebar)] flex items-center justify-center rounded-full text-[10px] font-bold"
                style={{
                  top: "-4px",
                  right: "-4px",
                  minWidth: "16px",
                  height: "16px",
                  padding: "0 4px",
                  background: "var(--accent-primary)",
                  color: "white",
                }}
              >
                {laterCount > 99 ? "99+" : laterCount}
              </span>
            )}
          </button>
        ))}

        <div className="flex-1" />

        {/* Create Button */}
        <div className="workspace-sidebar-divider" />

        {/* User Avatar */}
        <button
          ref={avatarBtnRef}
          className="workspace-sidebar-avatar"
          onClick={() => {
            setShowUserMenu((s) => !s);
            setShowCreateMenu(false);
          }}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
          aria-label="Open user menu"
        >
          <Avatar
            member={{
              name: user?.name || "?",
              avatar: user?.avatar,
              onlineStatus: userStatus,
            }}
            size={34}
            showStatus={false}
          />
          <span 
            className="online-dot" 
            style={{ background: statusColor }}
          />
        </button>
      </nav>

      {/* Hover Preview Panels */}
      {activePanel &&
        anchorRect &&
        ["dms", "activity", "files"].includes(activePanel) && (
          <HoverPreview
            section={activePanel}
            anchorRect={anchorRect}
            onClose={closeNow}
            onPanelMouseEnter={cancelClose}
            onPanelMouseLeave={queueClose}
          />
        )}

      {/* Create Menu */}
      {showCreateMenu && (
        <CreateMenu
          anchorRef={createBtnRef}
          onClose={() => setShowCreateMenu(false)}
        />
      )}

      {/* User Profile Menu */}
      {showUserMenu && (
        <UserProfileMenu
          anchorRef={avatarBtnRef}
          onClose={() => setShowUserMenu(false)}
          onOpenPreferences={() => {
            setShowUserMenu(false);
            setShowPreferences(true);
          }}
          onOpenSetStatus={() => {
            setShowUserMenu(false);
            setShowSetStatus(true);
          }}
        />
      )}

      {showPreferences && (
        <PreferencesModal onClose={() => setShowPreferences(false)} />
      )}
      {showSetStatus && (
        <SetStatusModal onClose={() => setShowSetStatus(false)} />
      )}
    </>
  );
});

export default WorkspaceSidebar;
