import {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
  lazy,
  Suspense,
} from "react";
import {
  useLocation,
  matchPath,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useChannelStore } from "../../stores/channelStore";
import { useChatStore } from "../../stores/chatStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useNotificationStore } from "../../stores/notificationStore";
import { emitPresenceUpdate, getSocket } from "../../services/socket";
import usePushSubscription from "../../hooks/usePushSubscription";
import ErrorBoundary from "../ErrorBoundary";
import WorkspaceSidebar from "./WorkspaceSidebar";
import NavigationSidebar from "./NavigationSidebar";
import SetStatusModal from "../chat/SetStatusModal";
import ActivityContextSidebar from "./context/ActivityContextSidebar";
import FilesContextSidebar from "./context/FilesContextSidebar";
import ChatPanel from "../chat/ChatPanel";
import ThreadPanel from "../chat/ThreadPanel";
import ChannelInfoPanel from "../chat/ChannelInfoPanel";
import PreferencesModal from "../chat/PreferencesModal";
import SearchPanel from "../chat/SearchPanel";
import ProfileSidePanel from "../chat/ProfileSidePanel";
import GlobalSearch from "../search/GlobalSearch";
import { useProfileStore } from "../../stores/profileStore";
import { useAuthStore } from "../../stores/authStore";
import FilePreviewModal from "../chat/FilePreviewModal";
import PinnedMessagesPanel from "../chat/PinnedMessagesPanel";
import AllThreadsPanel from "../chat/AllThreadsPanel";
import NotificationPanel from "../notifications/NotificationPanel";
import KeyboardShortcutsModal from "../chat/KeyboardShortcutsModal";
import SavedMessagesPanel from "../chat/SavedMessagesPanel";
import { useKeyboardShortcuts } from "../../utils/keyboardShortcuts";
import { messageAPI, savedMessageAPI } from "../../services/api";
import {
  getActivityPath,
  getFilesPath,
  getChannelPath,
  getDMPath,
} from "../../utils/chatRoutes";
import {
  getNotificationText,
  normalizeNotification,
} from "../../utils/notificationFormat";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bell,
  ChevronRight,
  CircleHelp,
  Download,
  File,
  FileText,
  Info,
  Search,
  MessageSquare,
  Zap,
  FolderOpen,
  Eye,
  ExternalLink,
  Volume2,
  Image as ImageIcon,
  Film,
} from "lucide-react";
import toast from "react-hot-toast";
import DownloadsModalWrapper from "../modals/DownloadsModalWrapper";
import { useDownloadStore } from "../../stores/downloadStore";

/* ─── Injected styles ─────────────────────────────────────────────────────── */
const LAYOUT_STYLES = `
@keyframes cl-fadeUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes cl-fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes cl-scaleIn {
  from { opacity: 0; transform: scale(0.94); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes cl-shimmer {
  0%   { background-position: -400% 0; }
  100% { background-position:  400% 0; }
}
@keyframes cl-spin {
  to { transform: rotate(360deg); }
}
@keyframes cl-pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.6; transform: scale(0.85); }
}
@keyframes cl-float {
  0%, 100% { transform: translateY(0px); }
  50%       { transform: translateY(-6px); }
}

/* ════════════════════════
   GLOBAL TOP BAR
════════════════════════ */
.cl-topbar {
  height: 48px;
  display: grid;
  grid-template-columns: auto minmax(180px, 640px) auto;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  background: var(--surface-primary, var(--bg-primary));
  border-bottom: 1px solid var(--border-color, var(--border-primary));
  flex-shrink: 0;
  position: relative;
  z-index: 100;
}

.cl-topbar__nav {
  display: flex;
  align-items: center;
  gap: 2px;
}
.cl-topbar__nav-btn {
  width: 30px; height: 30px;
  border-radius: 8px; border: none;
  background: transparent;
  color: var(--text-muted);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, transform 160ms cubic-bezier(0.34,1.56,0.64,1);
}
.cl-topbar__nav-btn:hover {
  background: var(--surface-hover, var(--bg-hover));
  color: var(--text-primary);
  transform: scale(1.08);
}
.cl-topbar__nav-btn:active { transform: scale(0.95); }

.cl-topbar__search-wrap {
  flex: 1;
  max-width: 640px;
}

.cl-topbar__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  justify-content: flex-end;
}
.cl-topbar__action-btn {
  position: relative;
  width: 32px; height: 32px;
  border-radius: 8px; border: none;
  background: transparent;
  color: var(--text-secondary);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, transform 160ms cubic-bezier(0.34,1.56,0.64,1);
}
.cl-topbar__action-btn:hover {
  background: var(--surface-hover, var(--bg-hover));
  color: var(--text-primary);
  transform: scale(1.06);
}
.cl-topbar__action-btn:active { transform: scale(0.95); }

.cl-notif-badge {
  position: absolute;
  top: 1px; right: 1px;
  min-width: 16px; height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--danger-color, #e01e5a);
  color: #fff;
  font-size: 9.5px; font-weight: 900;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 0 0 2px var(--surface-primary, var(--bg-primary));
  line-height: 1;
  animation: cl-scaleIn 200ms cubic-bezier(0.34,1.56,0.64,1);
}

/* Bell shake on new notification */
.cl-topbar__action-btn.has-notif svg {
  animation: cl-bellShake 500ms ease;
}
@keyframes cl-bellShake {
  0%,100% { transform: rotate(0); }
  20%      { transform: rotate(-14deg); }
  40%      { transform: rotate(12deg); }
  60%      { transform: rotate(-8deg); }
  80%      { transform: rotate(6deg); }
}

/* ════════════════════════
   LOADING SPINNER
════════════════════════ */
.cl-spinner {
  width: 32px; height: 32px;
  border: 3px solid var(--border-secondary, rgba(255,255,255,0.12));
  border-top-color: var(--accent-color, var(--accent-primary));
  border-radius: 50%;
  animation: cl-spin 700ms linear infinite;
}

/* ════════════════════════
   WELCOME SCREEN
════════════════════════ */
.cl-welcome {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: cl-fadeUp 400ms ease both;
}
.cl-welcome__card {
  max-width: 420px;
  width: 100%;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}
.cl-welcome__orb {
  width: 72px; height: 72px;
  border-radius: 20px;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 22px;
  background: linear-gradient(135deg, var(--accent-color, var(--accent-primary)) 0%, var(--accent-purple, #7c3aed) 100%);
  box-shadow:
    0 12px 32px color-mix(in srgb, var(--accent-color, var(--accent-primary)) 35%, transparent),
    0 4px 12px rgba(0,0,0,0.15);
  animation: cl-float 3s ease-in-out infinite;
}
.cl-welcome__title {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--text-white, var(--text-primary));
  margin: 0 0 10px;
  line-height: 1.2;
}
.cl-welcome__desc {
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-secondary);
  margin: 0 0 28px;
  max-width: 320px;
}
.cl-welcome__pills {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 24px;
}
.cl-welcome__pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--border-secondary, rgba(255,255,255,0.1));
  color: var(--text-secondary);
  background: var(--bg-secondary, rgba(255,255,255,0.04));
  letter-spacing: -0.01em;
}
.cl-welcome__pill-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  animation: cl-pulse-dot 2.2s ease infinite;
}
.cl-welcome__mobile-btn {
  display: none;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 18px;
  border-radius: 10px;
  border: 1px solid var(--border-primary);
  background: var(--bg-secondary, var(--bg-hover));
  color: var(--text-secondary);
  font-size: 13px; font-weight: 600;
  cursor: pointer; font-family: inherit;
  transition: background 140ms ease, transform 160ms ease;
  margin-bottom: 20px;
}
.cl-welcome__mobile-btn:hover { background: var(--bg-hover); transform: translateY(-1px); }
@media (max-width: 768px) { .cl-welcome__mobile-btn { display: flex; } }

/* ════════════════════════
   EMPTY / SELECT PANES
════════════════════════ */
.cl-empty-pane {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  animation: cl-fadeUp 320ms ease both;
}
.cl-empty-pane__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  max-width: 280px;
}
.cl-empty-pane__icon-wrap {
  width: 60px; height: 60px;
  border-radius: 18px;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 4px;
  border: 1px solid var(--border-secondary, rgba(255,255,255,0.08));
  background: var(--bg-secondary, rgba(255,255,255,0.04));
}
.cl-empty-pane__title {
  font-size: 15px; font-weight: 700;
  color: var(--text-white, var(--text-primary));
  letter-spacing: -0.02em;
  margin: 0;
}
.cl-empty-pane__sub {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.55;
  margin: 0;
}
.cl-empty-pane__mobile-btn {
  display: none;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 9px;
  border: 1px solid var(--border-primary);
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-size: 12px; font-weight: 600;
  cursor: pointer; font-family: inherit;
  margin-bottom: 4px;
  transition: background 140ms ease;
}
.cl-empty-pane__mobile-btn:hover { background: var(--bg-secondary); }
@media (max-width: 768px) { .cl-empty-pane__mobile-btn { display: flex; } }

/* ════════════════════════
   PANE BREADCRUMB BAR
════════════════════════ */
.cl-breadcrumb-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
  height: 44px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-primary, var(--border-color));
  background: var(--surface-primary, var(--bg-secondary));
}
.cl-breadcrumb-bar__left {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  min-width: 0;
  flex: 1;
}
.cl-breadcrumb-bar__label {
  color: var(--text-muted);
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}
.cl-breadcrumb-bar__arrow {
  color: var(--text-muted);
  flex-shrink: 0;
}
.cl-breadcrumb-bar__name {
  color: var(--text-white, var(--text-primary));
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ════════════════════════
   FILE ACTION BUTTONS
════════════════════════ */
.cl-file-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.cl-file-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 12px;
  border-radius: 8px; border: none;
  font-size: 12px; font-weight: 600;
  cursor: pointer; font-family: inherit;
  white-space: nowrap;
  transition: background 140ms ease, color 140ms ease, transform 160ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 140ms ease;
}
.cl-file-btn:hover { transform: translateY(-1px); }
.cl-file-btn:active { transform: scale(0.97); }
.cl-file-btn--ghost {
  background: var(--surface-secondary, var(--bg-hover));
  color: var(--text-secondary);
  border: 1px solid var(--border-secondary);
}
.cl-file-btn--ghost:hover { background: var(--surface-hover, var(--bg-hover)); color: var(--text-primary); box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.cl-file-btn--primary {
  background: var(--accent-color, var(--accent-primary));
  color: #fff;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--accent-color, var(--accent-primary)) 35%, transparent);
}
.cl-file-btn--primary:hover {
  background: color-mix(in srgb, var(--accent-color, var(--accent-primary)) 88%, #000);
  box-shadow: 0 4px 14px color-mix(in srgb, var(--accent-color, var(--accent-primary)) 42%, transparent);
}

/* ════════════════════════
   FILE PREVIEW AREA
════════════════════════ */
.cl-file-preview-shell {
  flex: 1;
  overflow: hidden;
  padding: 16px;
  animation: cl-fadeIn 250ms ease;
}
.cl-file-preview-card {
  height: 100%;
  border-radius: 14px;
  border: 1px solid var(--border-secondary, var(--border-primary));
  background: var(--surface-secondary, var(--bg-secondary));
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
}
.cl-file-preview-card__header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-secondary);
  background: var(--surface-primary, var(--bg-primary));
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.cl-file-preview-card__icon {
  width: 32px; height: 32px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.cl-file-preview-card__title {
  font-size: 13px; font-weight: 700;
  color: var(--text-white, var(--text-primary));
  letter-spacing: -0.01em;
}
.cl-file-preview-card__meta {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 1px;
}
.cl-file-preview-card__body {
  flex: 1;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--bg-primary);
}
.cl-file-preview-card__body img {
  max-width: 100%; max-height: 100%;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.16);
  object-fit: contain;
}
.cl-file-preview-card__body video,
.cl-file-preview-card__body audio {
  max-width: 100%;
  border-radius: 10px;
}

.cl-file-no-preview {
  display: flex; flex-direction: column; align-items: center;
  gap: 12px; text-align: center;
}
.cl-file-no-preview__icon {
  width: 64px; height: 64px; border-radius: 18px;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-secondary, var(--bg-hover));
  border: 1px solid var(--border-secondary);
}
.cl-file-no-preview__title {
  font-size: 14px; font-weight: 600;
  color: var(--text-secondary);
  margin: 0;
}
.cl-file-no-preview__sub {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

/* ════════════════════════
   ACTIVITY PANE CONTEXT
════════════════════════ */
.cl-activity-context-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  height: 36px;
  font-size: 12px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-secondary);
  background: color-mix(in srgb, var(--accent-color, var(--accent-primary)) 6%, var(--surface-primary, var(--bg-secondary)));
}
.cl-activity-context-bar__tag {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 700;
  background: color-mix(in srgb, var(--accent-color, var(--accent-primary)) 14%, transparent);
  color: var(--accent-color, var(--accent-primary));
  border: 1px solid color-mix(in srgb, var(--accent-color, var(--accent-primary)) 25%, transparent);
  white-space: nowrap;
  flex-shrink: 0;
}
.cl-activity-context-bar__name {
  color: var(--text-secondary);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

/* ════════════════════════
   RESPONSIVE HELPERS
════════════════════════ */
@media (max-width: 768px) {
  .cl-topbar { grid-template-columns: auto 1fr auto; gap: 8px; padding: 0 10px; }
  .cl-file-actions { gap: 4px; }
  .cl-file-btn span { display: none; }
  .cl-file-btn { padding: 6px 8px; }
}
`;

function useLayoutStylesInjected() {
  const ref = useRef(false);
  useEffect(() => {
    if (ref.current) return;
    ref.current = true;
    if (document.getElementById("cl-layout-styles")) return;
    const el = document.createElement("style");
    el.id = "cl-layout-styles";
    el.textContent = LAYOUT_STYLES;
    document.head.appendChild(el);
  }, []);
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

const PAGE_ROUTES = {
  home: lazy(() => import("../../pages/HomePage")),
  later: lazy(() => import("../../pages/LaterPage")),
  tools: lazy(() => import("../../pages/ToolsPage")),
  directories: lazy(() => import("../directories/DirectoriesPanel")),
};

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 400;
const SIDEBAR_DEFAULT = 268;
const SIDEBAR_COLLAPSED = 60;
const SIDEBAR_STORAGE_KEY = "chat-sidebar-width";

function getSavedSidebarWidth() {
  try {
    const v = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (v) {
      const n = Number(v);
      if (n === SIDEBAR_COLLAPSED || (n >= SIDEBAR_MIN && n <= SIDEBAR_MAX))
        return n;
    }
  } catch {
    /* ignore */
  }
  return SIDEBAR_DEFAULT;
}

function asId(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return (value._id || value.id || null)?.toString?.() || null;
}

function resolveNotificationChannelId(notification) {
  return asId(notification?.channelId);
}

function formatSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes,
    i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/* ─── Main ChatLayout ─────────────────────────────────────────────────────── */

export default function ChatLayout() {
  useLayoutStylesInjected();

  const {
    fetchChannels,
    fetchMembers,
    activeChannelId,
    channels,
    showInfoPanel,
    setActiveChannel,
    unreads,
  } = useChannelStore();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadNotifications = useNotificationStore((s) => s.unreadCount);
  const location = useLocation();
  const navigate = useNavigate();
  const { workspaceId } = useParams();
  const activeThread = useChatStore((s) => s.activeThread);
  const openThreadAction = useChatStore((s) => s.openThread);
  const closeThread = useChatStore((s) => s.closeThread);
  const [showSearch, setShowSearch] = useState(false);
  const [showPins, setShowPins] = useState(false);
  const [showAllThreads, setShowAllThreads] = useState(false);
  const profileUser = useProfileStore((s) => s.profileUser);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewFiles, setPreviewFiles] = useState([]);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [filesForModule, setFilesForModule] = useState([]);
  const [showTopPreferences, setShowTopPreferences] = useState(false);
  const [showTopSetStatus, setShowTopSetStatus] = useState(false);
  const addDownload = useDownloadStore((state) => state.addDownload);
  const user = useAuthStore((s) => s.user);

  const handleDownload = async (file) => {
    const fileName = file.fileName || file.name || "download";
    const downloadUrl = file.url || file.secureUrl;
    try {
      addDownload({
        name: fileName,
        url: downloadUrl,
        size: file.fileSize || file.size,
        type: file.mimeType || file.type,
      });
      const res = await fetch(downloadUrl);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error("Download failed", err);
    }
  };

  const handleOpenSearchResult = useCallback(
    (item) => {
      if (!workspaceId) return;
      switch (item.type) {
        case "user":
          useProfileStore
            .getState()
            .openProfile({
              _id: item.id,
              name: item.name,
              email: item.email,
              avatar: item.avatar,
              role: item.role,
              onlineStatus: item.status,
              customStatus: item.customStatus,
              flowTaskUserId: item.flowTaskUserId,
            });
          break;
        case "message":
          navigate(
            item.channelType === "dm"
              ? getDMPath(workspaceId, item.channelId, item.id)
              : getChannelPath(workspaceId, item.channelId, item.id),
          );
          break;
        case "channel":
          navigate(getChannelPath(workspaceId, item.id));
          break;
        case "dm":
          navigate(getDMPath(workspaceId, item.id));
          break;
        case "file":
          navigate(getFilesPath(workspaceId, item.referenceId));
          break;
        case "link":
          navigate(
            item.channelType === "dm"
              ? getDMPath(workspaceId, item.channelId, item.messageId)
              : getChannelPath(workspaceId, item.channelId, item.messageId),
          );
          break;
        case "page":
          if (item.path === "profile")
            useProfileStore.getState().openProfile(user);
          else if (item.path === "settings") setShowTopPreferences(true);
          else if (item.path === "activity") setShowNotifications(true);
          else if (item.path === "threads") setShowAllThreads(true);
          else if (item.path === "starred") setShowSaved(true);
          else navigate(`/workspace/${workspaceId}/${item.path}`);
          break;
        default:
          break;
      }
    },
    [workspaceId, navigate, user],
  );

  // Resizable Sidebar
  const [sidebarWidth, setSidebarWidth] = useState(getSavedSidebarWidth);
  const isResizingRef = useRef(false);
  const [isResizing, setIsResizing] = useState(false);
  const widthBeforeCollapseRef = useRef(SIDEBAR_DEFAULT);
  const sidebarCollapsed = sidebarWidth === SIDEBAR_COLLAPSED;
  const persistWidth = useCallback((w) => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(w));
    } catch {}
  }, []);

  const handleResizeStart = useCallback(
    (e) => {
      e.preventDefault();
      isResizingRef.current = true;
      setIsResizing(true);
      const startX = e.clientX,
        startW = sidebarCollapsed ? SIDEBAR_MIN : sidebarWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev) => {
        const delta = ev.clientX - startX;
        setSidebarWidth(
          Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW + delta)),
        );
      };
      const onUp = () => {
        isResizingRef.current = false;
        setIsResizing(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        setSidebarWidth((w) => {
          persistWidth(w);
          return w;
        });
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [sidebarWidth, sidebarCollapsed, persistWidth],
  );

  const handleResizeDoubleClick = useCallback(() => {
    if (sidebarCollapsed) {
      const r = widthBeforeCollapseRef.current;
      setSidebarWidth(r);
      persistWidth(r);
    } else {
      widthBeforeCollapseRef.current = sidebarWidth;
      setSidebarWidth(SIDEBAR_COLLAPSED);
      persistWidth(SIDEBAR_COLLAPSED);
    }
  }, [sidebarCollapsed, sidebarWidth, persistWidth]);

  const globalSearchRef = useRef(null);

  const shortcutHandlers = useMemo(
    () => ({
      toggleSearch: () => {
        globalSearchRef.current?.focus();
        setShowPins(false);
        setShowAllThreads(false);
        setShowNotifications(false);
      },
      toggleThreads: () => {
        setShowAllThreads((s) => !s);
        setShowSearch(false);
        setShowPins(false);
        setShowNotifications(false);
        closeThread();
        useProfileStore.getState().closeProfile();
      },
      showShortcuts: () => setShowShortcuts((s) => !s),
      escape: () => {
        if (showShortcuts) setShowShortcuts(false);
        else if (showSearch) setShowSearch(false);
        else if (showPins) setShowPins(false);
        else if (showSaved) setShowSaved(false);
        else if (showNotifications) setShowNotifications(false);
        else if (showAllThreads) setShowAllThreads(false);
        else if (profileUser) useProfileStore.getState().closeProfile();
      },
    }),
    [
      showShortcuts,
      showSearch,
      showPins,
      showSaved,
      showAllThreads,
      showNotifications,
      profileUser,
      closeThread,
    ],
  );
  useKeyboardShortcuts(shortcutHandlers);

  const idleTimerRef = useRef(null);
  const isIdleRef = useRef(false);
  const resetIdleTimer = useCallback(() => {
    if (isIdleRef.current) {
      isIdleRef.current = false;
      emitPresenceUpdate("online");
    }
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(
      () => {
        isIdleRef.current = true;
        emitPresenceUpdate("away");
      },
      5 * 60 * 1000,
    );
  }, []);
  useEffect(() => {
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) =>
      window.addEventListener(e, resetIdleTimer, { passive: true }),
    );
    resetIdleTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdleTimer));
      clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  usePushSubscription({ enabled: !!user });

  useEffect(() => {
    const handleFocus = () => {
      const cId = useChannelStore.getState().activeChannelId;
      if (cId) getSocket()?.emit("window:focus", { channelId: cId });
    };
    const handleBlur = () => {
      getSocket()?.emit("window:blur", {});
    };
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    if (document.hasFocus()) handleFocus();
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  useEffect(() => {
    if (activeWorkspaceId) fetchChannels(activeWorkspaceId);
  }, [fetchChannels, activeWorkspaceId]);

  const channelMessageRoute = matchPath(
    "/workspace/:workspaceId/channel/:channelId/message/:messageId",
    location.pathname,
  );
  const channelRoute = matchPath(
    "/workspace/:workspaceId/channel/:channelId",
    location.pathname,
  );
  const dmsMessageRoute = matchPath(
    "/workspace/:workspaceId/dms/:dmId/message/:messageId",
    location.pathname,
  );
  const dmsRoute = matchPath(
    "/workspace/:workspaceId/dms/:dmId",
    location.pathname,
  );
  const dmsHomeRoute = matchPath(
    "/workspace/:workspaceId/dms",
    location.pathname,
  );
  const legacyDmMessageRoute = matchPath(
    "/workspace/:workspaceId/dm/:dmId/message/:messageId",
    location.pathname,
  );
  const legacyDmRoute = matchPath(
    "/workspace/:workspaceId/dm/:dmId",
    location.pathname,
  );
  const activityWithSelectionRoute = matchPath(
    "/workspace/:workspaceId/activity/:notificationId",
    location.pathname,
  );
  const activityRoute = matchPath(
    "/workspace/:workspaceId/activity",
    location.pathname,
  );
  const filesWithSelectionRoute = matchPath(
    "/workspace/:workspaceId/files/:fileRefId",
    location.pathname,
  );
  const filesRoute = matchPath(
    "/workspace/:workspaceId/files",
    location.pathname,
  );

  const routeConversationId =
    channelMessageRoute?.params?.channelId ||
    channelRoute?.params?.channelId ||
    dmsMessageRoute?.params?.dmId ||
    dmsRoute?.params?.dmId ||
    null;
  const routeMessageId =
    channelMessageRoute?.params?.messageId ||
    dmsMessageRoute?.params?.messageId ||
    null;
  const activityNotificationId =
    activityWithSelectionRoute?.params?.notificationId || null;
  const filesSelectedFileId =
    filesWithSelectionRoute?.params?.fileRefId || null;
  const isActivityRoute = !!(activityRoute || activityWithSelectionRoute);
  const isFilesRoute = !!(filesRoute || filesWithSelectionRoute);
  const isDMRoute = !!(dmsHomeRoute || dmsRoute || dmsMessageRoute);

  const selectedNotification = useMemo(
    () => notifications.find((n) => n._id === activityNotificationId) || null,
    [notifications, activityNotificationId],
  );
  const selectedFile = useMemo(
    () =>
      filesForModule.find((f) => f.referenceId === filesSelectedFileId) || null,
    [filesForModule, filesSelectedFileId],
  );

  useEffect(() => {
    if (!workspaceId) return;
    if (legacyDmMessageRoute?.params?.dmId) {
      navigate(
        getDMPath(
          workspaceId,
          legacyDmMessageRoute.params.dmId,
          legacyDmMessageRoute.params.messageId,
        ),
        { replace: true },
      );
      return;
    }
    if (legacyDmRoute?.params?.dmId) {
      navigate(getDMPath(workspaceId, legacyDmRoute.params.dmId), {
        replace: true,
      });
    }
  }, [workspaceId, legacyDmMessageRoute, legacyDmRoute, navigate]);

  useEffect(() => {
    if (!routeConversationId) return;

    const currentActiveChannelId = useChannelStore.getState().activeChannelId;
    if (routeConversationId === currentActiveChannelId) {
      fetchMembers(routeConversationId);
      return;
    }

    setActiveChannel(routeConversationId);
  }, [routeConversationId, workspaceId, fetchMembers, setActiveChannel]);
  useEffect(() => {
    if (activeChannelId && document.hasFocus())
      getSocket()?.emit("window:focus", { channelId: activeChannelId });
  }, [activeChannelId]);

  const lastRouteMessageRef = useRef(null);
  useEffect(() => {
    if (!routeMessageId || lastRouteMessageRef.current === routeMessageId)
      return;
    lastRouteMessageRef.current = routeMessageId;
    useChatStore.getState().setHighlightMessageId(routeMessageId);
    const t = setTimeout(
      () => useChatStore.getState().setHighlightMessageId(null),
      3500,
    );
    return () => clearTimeout(t);
  }, [routeMessageId]);

  useEffect(() => {
    if (!workspaceId || !routeMessageId) return;
    let cancelled = false;
    const syncDeepLinkMessage = async () => {
      try {
        const preferredChannelId = routeConversationId;
        if (preferredChannelId) {
          try {
            const aroundRes = await messageAPI.around(
              preferredChannelId,
              routeMessageId,
              { limit: 24 },
            );
            const aroundItems = aroundRes?.data?.data?.items || [];
            const highlighted =
              aroundRes?.data?.data?.highlightedMessageId || routeMessageId;
            if (!cancelled && aroundItems.length > 0) {
              useChatStore
                .getState()
                .upsertChannelMessages(preferredChannelId, aroundItems);
              useChatStore.getState().setHighlightMessageId(highlighted);
              if (preferredChannelId !== activeChannelId)
                setActiveChannel(preferredChannelId);
              return;
            }
          } catch {}
        }
        const { data } = await messageAPI.get(routeMessageId);
        const message = data?.data?.message || data?.data || null;
        if (!message || cancelled) return;
        const messageChannelId = asId(message.channelId);
        if (!messageChannelId) return;
        const routeChannelId = routeConversationId;
        if (routeChannelId && routeChannelId !== messageChannelId) {
          const isDM =
            message.channelId?.type === "dm" ||
            channels.find((c) => c._id === messageChannelId)?.type === "dm";
          navigate(
            isDM
              ? getDMPath(workspaceId, messageChannelId, routeMessageId)
              : getChannelPath(workspaceId, messageChannelId, routeMessageId),
            { replace: true },
          );
          return;
        }
        useChatStore
          .getState()
          .addMessage({ ...message, channelId: messageChannelId });
        if (messageChannelId !== activeChannelId)
          setActiveChannel(messageChannelId);
      } catch {}
    };
    syncDeepLinkMessage();
    return () => {
      cancelled = true;
    };
  }, [
    workspaceId,
    routeMessageId,
    routeConversationId,
    channels,
    navigate,
    activeChannelId,
    setActiveChannel,
  ]);

  useEffect(() => {
    if (!workspaceId || !dmsHomeRoute) return;
    const dmChannels = channels.filter((c) => c.type === "dm" && !c.isArchived);
    if (!dmChannels.length) return;
    const nextDM = [...dmChannels].sort((a, b) => {
      const aU = unreads[a._id] || 0,
        bU = unreads[b._id] || 0;
      if (aU > 0 && bU === 0) return -1;
      if (aU === 0 && bU > 0) return 1;
      return (
        (b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0) -
        (a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0)
      );
    })[0];
    if (nextDM?._id)
      navigate(getDMPath(workspaceId, nextDM._id), { replace: true });
  }, [workspaceId, dmsHomeRoute, channels, navigate, unreads]);

  useEffect(() => {
    setShowMobileSidebar(false);
  }, [activeChannelId]);

  const openThread = (thread) => {
    const channelId =
      typeof thread.channelId === "object"
        ? thread.channelId._id
        : thread.channelId;
    if (channelId && channelId !== activeChannelId)
      useChannelStore.getState().setActiveChannel(channelId);
    const rootMessageId =
      typeof thread.rootMessageId === "object"
        ? thread.rootMessageId._id
        : thread.rootMessageId;
    if (rootMessageId) {
      useChatStore.getState().setHighlightMessageId(rootMessageId);
      setTimeout(
        () => useChatStore.getState().setHighlightMessageId(null),
        3000,
      );
    }
    openThreadAction(thread);
    useProfileStore.getState().closeProfile();
    setShowAllThreads(false);
  };

  const openProfile = (u) => {
    useProfileStore.getState().openProfile(u);
    closeThread();
    useChannelStore.getState().setShowInfoPanel(false);
  };
  const openFilePreview = (file, allFiles = []) => {
    setPreviewFile(file);
    setPreviewFiles(allFiles.length > 0 ? allFiles : [file]);
  };
  const handleSaveMessage = useCallback(async (messageId) => {
    try {
      const { data } = await savedMessageAPI.toggle(messageId);
      toast.success(data.data?.saved ? "Message saved" : "Message unsaved", {
        duration: 1500,
      });
    } catch {
      toast.error("Failed to save message");
    }
  }, []);

  const handleSelectActivityNotification = useCallback(
    (notification) => {
      const data = normalizeNotification(notification);
      if (!workspaceId || !data?._id) return;
      const channelId = resolveNotificationChannelId(data);
      if (channelId) {
        setActiveChannel(channelId);
        const messageId = asId(data.messageId || data.sourceId);
        const channelType =
          data.conversationType ||
          data.channelId?.type ||
          channels.find((c) => c._id === channelId)?.type;
        navigate(
          channelType === "dm"
            ? getDMPath(workspaceId, channelId, messageId)
            : getChannelPath(workspaceId, channelId, messageId),
        );
      } else {
        navigate(getActivityPath(workspaceId, data._id));
      }
      if (data.sourceType === "message" && (data.messageId || data.sourceId)) {
        const messageId = asId(data.messageId || data.sourceId);
        if (messageId) {
          useChatStore.getState().setHighlightMessageId(messageId);
          setTimeout(
            () => useChatStore.getState().setHighlightMessageId(null),
            3500,
          );
        }
      }
    },
    [workspaceId, navigate, setActiveChannel, channels],
  );

  const handleAutoSelectActivityNotification = useCallback(
    (notification) => {
      if (!workspaceId || !notification?._id || activityNotificationId) return;
      navigate(getActivityPath(workspaceId, notification._id), {
        replace: true,
      });
    },
    [workspaceId, activityNotificationId, navigate],
  );

  const handleSelectFileForModule = useCallback(
    (file) => {
      if (!workspaceId || !file?.referenceId) return;
      navigate(getFilesPath(workspaceId, file.referenceId));
    },
    [workspaceId, navigate],
  );

  const handleOpenFileInChat = useCallback(() => {
    if (!workspaceId || !selectedFile) return;
    const channelId = asId(selectedFile.channelId);
    if (!channelId) return;
    const messageId = asId(selectedFile.messageId);
    const channelType =
      selectedFile.channel?.type ||
      channels.find((c) => c._id === channelId)?.type;
    setActiveChannel(channelId);
    navigate(
      channelType === "dm"
        ? getDMPath(workspaceId, channelId, messageId)
        : getChannelPath(workspaceId, channelId, messageId),
    );
  }, [workspaceId, selectedFile, channels, setActiveChannel, navigate]);

  const activeChannel = channels.find((c) => c._id === activeChannelId) || null;

  return (
    <div className="h-full flex" style={{ background: "var(--bg-primary)" }}>
      <div className="hide-on-mobile">
        <ErrorBoundary name="WorkspaceSidebar" compact>
          <WorkspaceSidebar />
        </ErrorBoundary>
      </div>

      <div
        className="hide-on-mobile relative"
        style={{
          width: sidebarWidth,
          minWidth: sidebarWidth,
          transition: isResizing
            ? "none"
            : "width 200ms ease, min-width 200ms ease",
        }}
      >
        <ErrorBoundary name="ContextSidebar" compact>
          {isActivityRoute ? (
            <ActivityContextSidebar
              selectedNotificationId={activityNotificationId}
              onSelectNotification={handleSelectActivityNotification}
              onAutoSelect={handleAutoSelectActivityNotification}
            />
          ) : isFilesRoute ? (
            <FilesContextSidebar
              selectedFileId={filesSelectedFileId}
              onSelectFile={handleSelectFileForModule}
              onFilesChanged={setFilesForModule}
            />
          ) : (
            <NavigationSidebar
              mode={isDMRoute ? "dms" : "home"}
              onToggleAllThreads={() => {
                setShowAllThreads((s) => !s);
                setShowSearch(false);
                setShowPins(false);
                setShowNotifications(false);
                setShowSaved(false);
                useProfileStore.getState().closeProfile();
                closeThread();
              }}
              onToggleNotifications={() => {
                setShowNotifications((s) => !s);
                setShowAllThreads(false);
                setShowSearch(false);
                setShowPins(false);
                setShowSaved(false);
                useProfileStore.getState().closeProfile();
                closeThread();
              }}
              onToggleSaved={() => {
                setShowSaved((s) => !s);
                setShowAllThreads(false);
                setShowSearch(false);
                setShowPins(false);
                setShowNotifications(false);
                useProfileStore.getState().closeProfile();
                closeThread();
              }}
            />
          )}
        </ErrorBoundary>
        <div
          className="sidebar-resize-handle"
          onMouseDown={handleResizeStart}
          onDoubleClick={handleResizeDoubleClick}
          title="Drag to resize, double-click to collapse"
        />
      </div>

      {showMobileSidebar && (
        <>
          <div
            className="sidebar-overlay active"
            onClick={() => setShowMobileSidebar(false)}
          />
          <div className="sidebar-mobile">
            <ErrorBoundary name="ContextSidebar" compact>
              {isActivityRoute ? (
                <ActivityContextSidebar
                  selectedNotificationId={activityNotificationId}
                  onSelectNotification={(n) => {
                    handleSelectActivityNotification(n);
                    setShowMobileSidebar(false);
                  }}
                  onAutoSelect={handleAutoSelectActivityNotification}
                />
              ) : isFilesRoute ? (
                <FilesContextSidebar
                  selectedFileId={filesSelectedFileId}
                  onSelectFile={(f) => {
                    handleSelectFileForModule(f);
                    setShowMobileSidebar(false);
                  }}
                  onFilesChanged={setFilesForModule}
                />
              ) : (
                <NavigationSidebar
                  mode={isDMRoute ? "dms" : "home"}
                  onClose={() => setShowMobileSidebar(false)}
                  onToggleNotifications={() => {
                    setShowNotifications((s) => !s);
                    setShowMobileSidebar(false);
                    setShowAllThreads(false);
                    setShowSearch(false);
                    setShowPins(false);
                    useProfileStore.getState().closeProfile();
                    closeThread();
                  }}
                />
              )}
            </ErrorBoundary>
          </div>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <GlobalTopBar
          user={user}
          workspaceId={workspaceId}
          searchRef={globalSearchRef}
          unreadCount={unreadNotifications}
          onBack={() => navigate(-1)}
          onForward={() => navigate(1)}
          onOpenSearchResult={handleOpenSearchResult}
          onNotifications={() => {
            setShowNotifications((s) => !s);
            setShowPins(false);
          }}
          onHelp={() => setShowShortcuts(true)}
        />

        <div className="flex-1 flex min-w-0">
          <ErrorBoundary name="Content">
            {(() => {
              if (isActivityRoute)
                return (
                  <ActivityMainPane
                    selectedNotification={selectedNotification}
                    selectedChannelId={resolveNotificationChannelId(
                      selectedNotification,
                    )}
                    onOpenMobileSidebar={() => setShowMobileSidebar(true)}
                  />
                );
              if (isFilesRoute)
                return (
                  <FilesMainPane
                    selectedFile={selectedFile}
                    files={filesForModule}
                    onPreview={(f) => {
                      setPreviewFile(f);
                      setPreviewFiles(filesForModule);
                    }}
                    onDownload={handleDownload}
                    onOpenInChat={handleOpenFileInChat}
                    onOpenMobileSidebar={() => setShowMobileSidebar(true)}
                  />
                );
              const matchedEntry = Object.entries(PAGE_ROUTES).find(([key]) =>
                matchPath(`/workspace/:workspaceId/${key}`, location.pathname),
              );
              const PageComponent = matchedEntry?.[1] ?? null;
              if (PageComponent)
                return (
                  <Suspense
                    fallback={
                      <div
                        className="flex-1 flex items-center justify-center"
                        style={{ background: "var(--bg-primary)" }}
                      >
                        <div className="cl-spinner" />
                      </div>
                    }
                  >
                    <PageComponent />
                  </Suspense>
                );
              return activeChannelId ? (
                <ChatPanel
                  channelId={activeChannelId}
                  onOpenThread={openThread}
                  onToggleSearch={() => {
                    setShowSearch((s) => !s);
                    setShowPins(false);
                  }}
                  onTogglePins={() => {
                    setShowPins((s) => !s);
                    setShowSearch(false);
                  }}
                  onOpenProfile={openProfile}
                  onOpenFilePreview={openFilePreview}
                  onOpenMobileSidebar={() => setShowMobileSidebar(true)}
                  onSaveMessage={handleSaveMessage}
                />
              ) : (
                <WelcomeScreen
                  onOpenMobileSidebar={() => setShowMobileSidebar(true)}
                />
              );
            })()}
          </ErrorBoundary>
        </div>
      </div>

      {activeThread && (
        <ErrorBoundary name="Thread Panel">
          <ThreadPanel thread={activeThread} onClose={closeThread} />
        </ErrorBoundary>
      )}
      {showInfoPanel &&
        activeChannel &&
        !activeThread &&
        !showSearch &&
        !showPins &&
        !profileUser && (
          <ErrorBoundary name="Channel Info" compact>
            <ChannelInfoPanel
              channel={activeChannel}
              onOpenProfile={openProfile}
            />
          </ErrorBoundary>
        )}
      {showPins && activeChannelId && !activeThread && (
        <ErrorBoundary name="Pinned Messages" compact>
          <PinnedMessagesPanel
            channelId={activeChannelId}
            onClose={() => setShowPins(false)}
          />
        </ErrorBoundary>
      )}
      {showAllThreads && !activeThread && (
        <ErrorBoundary name="All Threads" compact>
          <AllThreadsPanel
            onClose={() => setShowAllThreads(false)}
            onOpenThread={openThread}
          />
        </ErrorBoundary>
      )}
      {profileUser && (
        <ErrorBoundary name="Profile" compact>
          <ProfileSidePanel
            user={profileUser}
            onClose={() => useProfileStore.getState().closeProfile()}
          />
        </ErrorBoundary>
      )}
      {showNotifications && (
        <ErrorBoundary name="Notifications" compact>
          <NotificationPanel
            onClose={() => setShowNotifications(false)}
            onSelectNotification={handleSelectActivityNotification}
          />
        </ErrorBoundary>
      )}
      {showSaved && (
        <ErrorBoundary name="Saved Messages" compact>
          <SavedMessagesPanel
            onClose={() => setShowSaved(false)}
            onJumpToMessage={(msg) => {
              if (msg.channelId !== activeChannelId)
                useChannelStore.getState().setActiveChannel(msg.channelId);
              setShowSaved(false);
            }}
          />
        </ErrorBoundary>
      )}
      {showSearch && (
        <ErrorBoundary name="Search" compact>
          <SearchPanel
            channelId={activeChannelId}
            onClose={() => setShowSearch(false)}
            onJumpToMessage={(msg) => {
              if (msg.channelId !== activeChannelId)
                useChannelStore.getState().setActiveChannel(msg.channelId);
              setShowSearch(false);
            }}
          />
        </ErrorBoundary>
      )}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          files={previewFiles}
          onClose={() => {
            setPreviewFile(null);
            setPreviewFiles([]);
          }}
        />
      )}
      {showShortcuts && (
        <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}
      {showTopPreferences && (
        <PreferencesModal onClose={() => setShowTopPreferences(false)} />
      )}
      {showTopSetStatus && (
        <SetStatusModal onClose={() => setShowTopSetStatus(false)} />
      )}
      <DownloadsModalWrapper channelId={activeChannelId} />
    </div>
  );
}

/* ─── GlobalTopBar ────────────────────────────────────────────────────────── */

function GlobalTopBar({
  user,
  workspaceId,
  searchRef,
  unreadCount,
  onBack,
  onForward,
  onOpenSearchResult,
  onNotifications,
  onHelp,
}) {
  const prevCountRef = useRef(unreadCount);
  const [bellShake, setBellShake] = useState(false);
  useEffect(() => {
    if (unreadCount > prevCountRef.current) {
      setBellShake(true);
      setTimeout(() => setBellShake(false), 600);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  return (
    <header className="cl-topbar">
      <div className="cl-topbar__nav">
        <button
          className="cl-topbar__nav-btn"
          onClick={onBack}
          aria-label="Go back"
          title="Go back"
        >
          <ArrowLeft size={15} />
        </button>
        <button
          className="cl-topbar__nav-btn"
          onClick={onForward}
          aria-label="Go forward"
          title="Go forward"
        >
          <ArrowRight size={15} />
        </button>
      </div>

      <div className="cl-topbar__search-wrap">
        <GlobalSearch
          ref={searchRef}
          user={user}
          workspaceId={workspaceId}
          onOpenResult={onOpenSearchResult}
        />
      </div>

      <div className="cl-topbar__actions">
        <button
          className={`cl-topbar__action-btn${bellShake ? " has-notif" : ""}`}
          onClick={onNotifications}
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span className="cl-notif-badge">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
        <button
          className="cl-topbar__action-btn"
          onClick={onHelp}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts"
        >
          <CircleHelp size={16} />
        </button>
      </div>
    </header>
  );
}

/* ─── WelcomeScreen ───────────────────────────────────────────────────────── */

function WelcomeScreen({ onOpenMobileSidebar }) {
  return (
    <div className="cl-welcome" style={{ background: "var(--bg-primary)" }}>
      <div className="cl-welcome__card">
        <button
          className="cl-welcome__mobile-btn"
          onClick={onOpenMobileSidebar}
        >
          Open sidebar
        </button>

        <div className="cl-welcome__orb">
          <MessageSquare size={30} color="white" strokeWidth={1.5} />
        </div>

        <h2 className="cl-welcome__title">Welcome to FlowTask Chat</h2>
        <p className="cl-welcome__desc">
          Select a channel or DM from the sidebar to start collaborating with
          your team.
        </p>

        <div className="cl-welcome__pills">
          <span className="cl-welcome__pill">
            <span
              className="cl-welcome__pill-dot"
              style={{
                background: "var(--status-online, #22c55e)",
                animationDelay: "0ms",
              }}
            />
            Real-time messaging
          </span>
          <span className="cl-welcome__pill">
            <span
              className="cl-welcome__pill-dot"
              style={{
                background: "var(--accent-color, var(--accent-primary))",
                animationDelay: "300ms",
              }}
            />
            Project channels
          </span>
          <span className="cl-welcome__pill">
            <span
              className="cl-welcome__pill-dot"
              style={{ background: "#a78bfa", animationDelay: "600ms" }}
            />
            File sharing
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── ActivityMainPane ────────────────────────────────────────────────────── */

function ActivityMainPane({
  selectedNotification,
  selectedChannelId,
  onOpenMobileSidebar,
}) {
  return (
    <section
      className="flex-1 min-w-0 flex flex-col"
      style={{ background: "var(--bg-primary)" }}
    >
      {!selectedNotification && (
        <div className="cl-empty-pane">
          <div className="cl-empty-pane__inner">
            <button
              className="cl-empty-pane__mobile-btn"
              onClick={onOpenMobileSidebar}
            >
              Open activity list
            </button>
            <div
              className="cl-empty-pane__icon-wrap"
              style={{
                background:
                  "color-mix(in srgb, var(--accent-color, var(--accent-primary)) 10%, var(--bg-secondary))",
                borderColor:
                  "color-mix(in srgb, var(--accent-color, var(--accent-primary)) 20%, transparent)",
              }}
            >
              <Activity
                size={26}
                style={{
                  color: "var(--accent-color, var(--accent-primary))",
                  opacity: 0.8,
                }}
              />
            </div>
            <p className="cl-empty-pane__title">Select an activity</p>
            <p className="cl-empty-pane__sub">
              Choose a notification from the list to open its related
              conversation.
            </p>
          </div>
        </div>
      )}

      {selectedNotification && !selectedChannelId && (
        <div className="cl-empty-pane">
          <div className="cl-empty-pane__inner">
            <div className="cl-empty-pane__icon-wrap">
              <Info
                size={26}
                style={{ color: "var(--text-muted)", opacity: 0.6 }}
              />
            </div>
            <p className="cl-empty-pane__title">No chat target</p>
            <p className="cl-empty-pane__sub">
              This activity doesn't link to a specific channel or DM.
            </p>
          </div>
        </div>
      )}

      {selectedNotification && selectedChannelId && (
        <>
          <div className="cl-activity-context-bar">
            <span className="cl-activity-context-bar__tag">
              <Zap size={10} />
              Activity
            </span>
            <ChevronRight
              size={12}
              style={{ color: "var(--text-muted)", flexShrink: 0 }}
            />
            <span className="cl-activity-context-bar__name">
              {getNotificationText(selectedNotification)}
            </span>
          </div>
          <ChatPanel channelId={selectedChannelId} />
        </>
      )}
    </section>
  );
}

/* ─── FilesMainPane ───────────────────────────────────────────────────────── */

function FilesMainPane({
  selectedFile,
  files,
  onPreview,
  onDownload,
  onOpenInChat,
  onOpenMobileSidebar,
}) {
  const isImage = selectedFile?.mimeType?.startsWith("image/");
  const isVideo = selectedFile?.mimeType?.startsWith("video/");
  const isAudio = selectedFile?.mimeType?.startsWith("audio/");
  const fileName =
    selectedFile?.fileName || selectedFile?.originalName || "Untitled file";

  const fileIconColor = isImage
    ? "#3b82f6"
    : isVideo
      ? "#8b5cf6"
      : isAudio
        ? "#10b981"
        : "var(--text-muted)";
  const FileTypeIcon = isImage
    ? ImageIcon
    : isVideo
      ? Film
      : isAudio
        ? Volume2
        : File;

  return (
    <section
      className="flex-1 min-w-0 flex flex-col"
      style={{ background: "var(--bg-primary)" }}
    >
      {!selectedFile ? (
        <div className="cl-empty-pane">
          <div className="cl-empty-pane__inner">
            <button
              className="cl-empty-pane__mobile-btn"
              onClick={onOpenMobileSidebar}
            >
              Open file list
            </button>
            <div
              className="cl-empty-pane__icon-wrap"
              style={{
                background:
                  "color-mix(in srgb, #3b82f6 10%, var(--bg-secondary))",
                borderColor: "color-mix(in srgb, #3b82f6 20%, transparent)",
              }}
            >
              <FolderOpen
                size={26}
                style={{ color: "#3b82f6", opacity: 0.8 }}
              />
            </div>
            <p className="cl-empty-pane__title">Select a file</p>
            <p className="cl-empty-pane__sub">
              Choose a file from the list to preview it or jump to its
              conversation.
            </p>
          </div>
        </div>
      ) : (
        <div className="h-full flex flex-col">
          {/* Breadcrumb + actions */}
          <div className="cl-breadcrumb-bar">
            <div className="cl-breadcrumb-bar__left">
              <span className="cl-breadcrumb-bar__label">Files</span>
              <ChevronRight size={13} className="cl-breadcrumb-bar__arrow" />
              <span className="cl-breadcrumb-bar__name">{fileName}</span>
            </div>
            <div className="cl-file-actions">
              <button
                className="cl-file-btn cl-file-btn--ghost"
                onClick={() => onPreview?.(selectedFile)}
                title="Preview"
              >
                <Eye size={13} />
                <span>Preview</span>
              </button>
              <button
                className="cl-file-btn cl-file-btn--ghost"
                onClick={() => onDownload(selectedFile)}
                title="Download"
              >
                <Download size={13} />
                <span>Download</span>
              </button>
              <button
                className="cl-file-btn cl-file-btn--primary"
                onClick={onOpenInChat}
                title="Open in chat"
              >
                <ExternalLink size={13} />
                <span>Open in chat</span>
              </button>
            </div>
          </div>

          {/* Preview card */}
          <div className="cl-file-preview-shell">
            <div className="cl-file-preview-card">
              {/* Card header */}
              <div className="cl-file-preview-card__header">
                <div
                  className="cl-file-preview-card__icon"
                  style={{
                    background: `color-mix(in srgb, ${fileIconColor} 14%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${fileIconColor} 22%, transparent)`,
                  }}
                >
                  <FileTypeIcon size={15} style={{ color: fileIconColor }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cl-file-preview-card__title">{fileName}</div>
                  <div className="cl-file-preview-card__meta">
                    {selectedFile.mimeType || "Unknown type"} ·{" "}
                    {formatSize(selectedFile.fileSize)}
                  </div>
                </div>
              </div>

              {/* Media body */}
              <div className="cl-file-preview-card__body">
                {isImage && selectedFile.url && (
                  <img src={selectedFile.url} alt={fileName} />
                )}
                {isVideo && selectedFile.url && (
                  <video
                    src={selectedFile.url}
                    controls
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      borderRadius: 10,
                    }}
                  />
                )}
                {isAudio && selectedFile.url && (
                  <div
                    style={{
                      width: "100%",
                      textAlign: "center",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 18,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background:
                          "color-mix(in srgb, #10b981 12%, transparent)",
                        border:
                          "1px solid color-mix(in srgb, #10b981 22%, transparent)",
                      }}
                    >
                      <Volume2 size={28} style={{ color: "#10b981" }} />
                    </div>
                    <p
                      style={{
                        color: "var(--text-secondary)",
                        fontSize: 13,
                        fontWeight: 600,
                        margin: 0,
                      }}
                    >
                      {fileName}
                    </p>
                    <audio
                      src={selectedFile.url}
                      controls
                      style={{ width: "100%", maxWidth: 400 }}
                    />
                  </div>
                )}
                {!isImage && !isVideo && !isAudio && (
                  <div className="cl-file-no-preview">
                    <div className="cl-file-no-preview__icon">
                      <File
                        size={28}
                        style={{ color: "var(--text-muted)", opacity: 0.6 }}
                      />
                    </div>
                    <p className="cl-file-no-preview__title">
                      Preview not available
                    </p>
                    <p className="cl-file-no-preview__sub">
                      This file type can't be previewed here.
                      <br />
                      Download it to open locally.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
