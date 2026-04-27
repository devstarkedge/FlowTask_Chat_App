import { useEffect, useState, useMemo, useRef, useCallback, lazy, Suspense } from 'react'
import { useLocation, matchPath, useNavigate, useParams } from 'react-router-dom'
import { useChannelStore } from '../../stores/channelStore'
import { useChatStore } from '../../stores/chatStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { emitPresenceUpdate, getSocket } from '../../services/socket'
import usePushSubscription from '../../hooks/usePushSubscription'
import ErrorBoundary from '../ErrorBoundary'
import WorkspaceSidebar from './WorkspaceSidebar'
import NavigationSidebar from './NavigationSidebar'
import SetStatusModal from '../chat/SetStatusModal'
import ActivityContextSidebar from './context/ActivityContextSidebar'
import FilesContextSidebar from './context/FilesContextSidebar'
import ChatPanel from '../chat/ChatPanel'
import ThreadPanel from '../chat/ThreadPanel'
import ChannelInfoPanel from '../chat/ChannelInfoPanel'
import PreferencesModal from '../chat/PreferencesModal'
import SearchPanel from '../chat/SearchPanel'
import ProfileSidePanel from '../chat/ProfileSidePanel'
import GlobalSearch from '../search/GlobalSearch'
// Avatar/profile removed from topbar per UI request
import { useProfileStore } from '../../stores/profileStore'
import { useAuthStore } from '../../stores/authStore'
import FilePreviewModal from '../chat/FilePreviewModal'
import PinnedMessagesPanel from '../chat/PinnedMessagesPanel'
import AllThreadsPanel from '../chat/AllThreadsPanel'
import NotificationPanel from '../notifications/NotificationPanel'
import KeyboardShortcutsModal from '../chat/KeyboardShortcutsModal'
import SavedMessagesPanel from '../chat/SavedMessagesPanel'
import { useKeyboardShortcuts } from '../../utils/keyboardShortcuts'
import { messageAPI, savedMessageAPI } from '../../services/api'
import {
  getActivityPath,
  getFilesPath,
  getChannelPath,
  getDMPath,
} from '../../utils/chatRoutes'
import { getNotificationText, normalizeNotification } from '../../utils/notificationFormat'
import { Activity, ArrowLeft, ArrowRight, Bell, ChevronRight, CircleHelp, Download, File, FileText, Info, Search } from 'lucide-react'
import toast from 'react-hot-toast'

const HomePage = lazy(() => import('../../pages/HomePage'))
const LaterPage = lazy(() => import('../../pages/LaterPage'))
const ToolsPage = lazy(() => import('../../pages/ToolsPage'))
const DirectoriesPanel = lazy(() => import('../directories/DirectoriesPanel'))

const PAGE_ROUTES = { home: HomePage, later: LaterPage, tools: ToolsPage, directories: DirectoriesPanel }

const SIDEBAR_MIN = 200
const SIDEBAR_MAX = 400
const SIDEBAR_DEFAULT = 268
const SIDEBAR_COLLAPSED = 60
const SIDEBAR_STORAGE_KEY = 'chat-sidebar-width'

function getSavedSidebarWidth() {
  try {
    const v = localStorage.getItem(SIDEBAR_STORAGE_KEY)
    if (v) {
      const n = Number(v)
      if (n === SIDEBAR_COLLAPSED || (n >= SIDEBAR_MIN && n <= SIDEBAR_MAX)) return n
    }
  } catch { /* ignore */ }
  return SIDEBAR_DEFAULT
}

function asId(value) {
  if (!value) return null
  if (typeof value === 'string') return value
  return (value._id || value.id || null)?.toString?.() || null
}

function resolveNotificationChannelId(notification) {
  return asId(notification?.channelId)
}

function formatSize(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

async function downloadFile(url, name) {
  if (!url) return

  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) {
      // If fetch failed, fallback to opening the URL in a new tab
      window.open(url, '_blank')
      return
    }

    const blob = await res.blob()
    const blobUrl = window.URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = blobUrl
    a.setAttribute('download', name || 'download')
    a.rel = 'noopener noreferrer'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    // Release memory
    window.URL.revokeObjectURL(blobUrl)
  } catch (err) {
    console.error('Download failed:', err)
    // Best-effort fallback: open in new tab
    try { window.open(url, '_blank') } catch (e) { /* ignore */ }
  }
}

export default function ChatLayout() {
  const { fetchChannels, activeChannelId, channels, showInfoPanel, setActiveChannel, unreads } = useChannelStore()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const notifications = useNotificationStore((s) => s.notifications)
  const unreadNotifications = useNotificationStore((s) => s.unreadCount)
  const location = useLocation()
  const navigate = useNavigate()
  const { workspaceId } = useParams()
  const activeThread = useChatStore(s => s.activeThread)
  const openThreadAction = useChatStore(s => s.openThread)
  const closeThread = useChatStore(s => s.closeThread)
  const [showSearch, setShowSearch] = useState(false)
  const [showPins, setShowPins] = useState(false)
  const [showAllThreads, setShowAllThreads] = useState(false)
  const profileUser = useProfileStore((s) => s.profileUser)
  const [previewFile, setPreviewFile] = useState(null)
  const [previewFiles, setPreviewFiles] = useState([])
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [filesForModule, setFilesForModule] = useState([])
  const [showTopPreferences, setShowTopPreferences] = useState(false)
  const [showTopSetStatus, setShowTopSetStatus] = useState(false)
  // top user menu and avatar removed
  const user = useAuthStore((s) => s.user)

  const handleOpenSearchResult = useCallback((item) => {
    if (!workspaceId) return

    switch (item.type) {
      case 'user':
        useProfileStore.getState().openProfile({ _id: item.id })
        break
      case 'message':
        if (item.channelType === 'dm') {
          navigate(getDMPath(workspaceId, item.channelId, item.id))
        } else {
          navigate(getChannelPath(workspaceId, item.channelId, item.id))
        }
        break
      case 'channel':
        if (item.type === 'dm') {
          navigate(getDMPath(workspaceId, item.id))
        } else {
          navigate(getChannelPath(workspaceId, item.id))
        }
        break
      case 'file':
        navigate(getFilesPath(workspaceId, item.referenceId))
        break
      case 'link':
        if (item.channelType === 'dm') {
          navigate(getDMPath(workspaceId, item.channelId, item.messageId))
        } else {
          navigate(getChannelPath(workspaceId, item.channelId, item.messageId))
        }
        break
      case 'page':
        if (item.path === 'profile') useProfileStore.getState().openProfile(user)
        else if (item.path === 'settings') setShowTopPreferences(true)
        else if (item.path === 'activity') setShowNotifications(true)
        else if (item.path === 'threads') setShowAllThreads(true)
        else if (item.path === 'starred') setShowSaved(true)
        else navigate(`/workspace/${workspaceId}/${item.path}`)
        break
      default:
        break
    }
  }, [workspaceId, navigate, user])

  // ─── Resizable Sidebar ───────────────────────────────────────────
  const [sidebarWidth, setSidebarWidth] = useState(getSavedSidebarWidth)
  const isResizingRef = useRef(false)
  const [isResizing, setIsResizing] = useState(false)
  const widthBeforeCollapseRef = useRef(SIDEBAR_DEFAULT)
  const sidebarCollapsed = sidebarWidth === SIDEBAR_COLLAPSED

  const persistWidth = useCallback((w) => {
    try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(w)) } catch { /* ignore */ }
  }, [])

  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    isResizingRef.current = true
    setIsResizing(true)
    const startX = e.clientX
    const startW = sidebarCollapsed ? SIDEBAR_MIN : sidebarWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev) => {
      const delta = ev.clientX - startX
      const newW = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW + delta))
      setSidebarWidth(newW)
    }
    const onUp = () => {
      isResizingRef.current = false
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      setSidebarWidth((w) => { persistWidth(w); return w })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [sidebarWidth, sidebarCollapsed, persistWidth])

  const handleResizeDoubleClick = useCallback(() => {
    if (sidebarCollapsed) {
      const restored = widthBeforeCollapseRef.current
      setSidebarWidth(restored)
      persistWidth(restored)
    } else {
      widthBeforeCollapseRef.current = sidebarWidth
      setSidebarWidth(SIDEBAR_COLLAPSED)
      persistWidth(SIDEBAR_COLLAPSED)
    }
  }, [sidebarCollapsed, sidebarWidth, persistWidth])

  const globalSearchRef = useRef(null)

  // Keyboard shortcuts
  const shortcutHandlers = useMemo(() => ({
    toggleSearch: () => {
      globalSearchRef.current?.focus()
      setShowPins(false)
      setShowAllThreads(false)
      setShowNotifications(false)
    },
    toggleThreads: () => { setShowAllThreads((s) => !s); setShowSearch(false); setShowPins(false); setShowNotifications(false); closeThread(); useProfileStore.getState().closeProfile() },
    showShortcuts: () => setShowShortcuts((s) => !s),
    escape: () => {
      if (showShortcuts) setShowShortcuts(false)
      else if (showSearch) setShowSearch(false)
      else if (showPins) setShowPins(false)
      else if (showSaved) setShowSaved(false)
      else if (showNotifications) setShowNotifications(false)
      else if (showAllThreads) setShowAllThreads(false)
      else if (profileUser) useProfileStore.getState().closeProfile()
    },
  }), [showShortcuts, showSearch, showPins, showSaved, showAllThreads, showNotifications, profileUser, closeThread])
  useKeyboardShortcuts(shortcutHandlers)

  // ─── Idle Presence Detection (5 min timeout) ─────────────────────
  const idleTimerRef = useRef(null)
  const isIdleRef = useRef(false)

  const resetIdleTimer = useCallback(() => {
    if (isIdleRef.current) {
      isIdleRef.current = false
      emitPresenceUpdate('online')
    }
    clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => {
      isIdleRef.current = true
      emitPresenceUpdate('away')
    }, 5 * 60 * 1000)
  }, [])

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    events.forEach((e) => window.addEventListener(e, resetIdleTimer, { passive: true }))
    resetIdleTimer()
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdleTimer))
      clearTimeout(idleTimerRef.current)
    }
  }, [resetIdleTimer])

  // ─── Push Notification Subscription ─────────────────────────────────
  usePushSubscription({ enabled: !!user })

  // ─── Window Focus/Blur → notify backend which channel is visible ────
  useEffect(() => {
    const handleFocus = () => {
      const channelId = useChannelStore.getState().activeChannelId
      if (channelId) {
        getSocket()?.emit('window:focus', { channelId })
      }
    }
    const handleBlur = () => {
      getSocket()?.emit('window:blur', {})
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)
    // Emit initial focus state
    if (document.hasFocus()) handleFocus()

    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  useEffect(() => {
    if (activeWorkspaceId) {
      fetchChannels(activeWorkspaceId)
    }
  }, [fetchChannels, activeWorkspaceId])

  const channelMessageRoute = matchPath('/workspace/:workspaceId/channel/:channelId/message/:messageId', location.pathname)
  const channelRoute = matchPath('/workspace/:workspaceId/channel/:channelId', location.pathname)
  const dmsMessageRoute = matchPath('/workspace/:workspaceId/dms/:dmId/message/:messageId', location.pathname)
  const dmsRoute = matchPath('/workspace/:workspaceId/dms/:dmId', location.pathname)
  const dmsHomeRoute = matchPath('/workspace/:workspaceId/dms', location.pathname)
  const legacyDmMessageRoute = matchPath('/workspace/:workspaceId/dm/:dmId/message/:messageId', location.pathname)
  const legacyDmRoute = matchPath('/workspace/:workspaceId/dm/:dmId', location.pathname)

  const activityWithSelectionRoute = matchPath('/workspace/:workspaceId/activity/:notificationId', location.pathname)
  const activityRoute = matchPath('/workspace/:workspaceId/activity', location.pathname)
  const filesWithSelectionRoute = matchPath('/workspace/:workspaceId/files/:fileRefId', location.pathname)
  const filesRoute = matchPath('/workspace/:workspaceId/files', location.pathname)

  const routeConversationId =
    channelMessageRoute?.params?.channelId ||
    channelRoute?.params?.channelId ||
    dmsMessageRoute?.params?.dmId ||
    dmsRoute?.params?.dmId ||
    null
  const routeMessageId = channelMessageRoute?.params?.messageId || dmsMessageRoute?.params?.messageId || null

  const activityNotificationId = activityWithSelectionRoute?.params?.notificationId || null
  const filesSelectedFileId = filesWithSelectionRoute?.params?.fileRefId || null
  const isActivityRoute = !!(activityRoute || activityWithSelectionRoute)
  const isFilesRoute = !!(filesRoute || filesWithSelectionRoute)
  const isDMRoute = !!(dmsHomeRoute || dmsRoute || dmsMessageRoute)

  const selectedNotification = useMemo(
    () => notifications.find((n) => n._id === activityNotificationId) || null,
    [notifications, activityNotificationId],
  )
  const selectedFile = useMemo(
    () => filesForModule.find((f) => f.referenceId === filesSelectedFileId) || null,
    [filesForModule, filesSelectedFileId],
  )

  // Canonical route migration for legacy DM paths.
  useEffect(() => {
    if (!workspaceId) return

    if (legacyDmMessageRoute?.params?.dmId) {
      navigate(
        getDMPath(
          workspaceId,
          legacyDmMessageRoute.params.dmId,
          legacyDmMessageRoute.params.messageId,
        ),
        { replace: true },
      )
      return
    }

    if (legacyDmRoute?.params?.dmId) {
      navigate(getDMPath(workspaceId, legacyDmRoute.params.dmId), { replace: true })
    }
  }, [workspaceId, legacyDmMessageRoute, legacyDmRoute, navigate])

  // Keep active conversation in sync with canonical route.
  useEffect(() => {
    if (!routeConversationId) return
    if (routeConversationId === activeChannelId) return
    setActiveChannel(routeConversationId)
  }, [routeConversationId, activeChannelId, setActiveChannel])

  // Notify backend of active channel change for push suppression
  useEffect(() => {
    if (activeChannelId && document.hasFocus()) {
      getSocket()?.emit('window:focus', { channelId: activeChannelId })
    }
  }, [activeChannelId])

  // Highlight target messages when URL includes message context.
  const lastRouteMessageRef = useRef(null)
  useEffect(() => {
    if (!routeMessageId) return
    if (lastRouteMessageRef.current === routeMessageId) return

    lastRouteMessageRef.current = routeMessageId
    useChatStore.getState().setHighlightMessageId(routeMessageId)
    const timer = setTimeout(() => {
      useChatStore.getState().setHighlightMessageId(null)
    }, 3500)

    return () => clearTimeout(timer)
  }, [routeMessageId])

  // Deep-link hardening: if a message URL opens on cold load, fetch that message,
  // ensure the right conversation is active, and inject into cache for reliable highlight.
  useEffect(() => {
    if (!workspaceId || !routeMessageId) return

    let cancelled = false

    const syncDeepLinkMessage = async () => {
      try {
        const preferredChannelId = routeConversationId

        if (preferredChannelId) {
          try {
            const aroundRes = await messageAPI.around(preferredChannelId, routeMessageId, { limit: 24 })
            const aroundItems = aroundRes?.data?.data?.items || []
            const highlighted = aroundRes?.data?.data?.highlightedMessageId || routeMessageId

            if (!cancelled && aroundItems.length > 0) {
              useChatStore.getState().upsertChannelMessages(preferredChannelId, aroundItems)
              useChatStore.getState().setHighlightMessageId(highlighted)

              if (preferredChannelId !== activeChannelId) {
                setActiveChannel(preferredChannelId)
              }
              return
            }
          } catch {
            // Fallback below to single-message resolution.
          }
        }

        const { data } = await messageAPI.get(routeMessageId)
        const message = data?.data?.message || data?.data || null
        if (!message || cancelled) return

        const messageChannelId = asId(message.channelId)
        if (!messageChannelId) return

        const routeChannelId = routeConversationId
        if (routeChannelId && routeChannelId !== messageChannelId) {
          const isDM = message.channelId?.type === 'dm' || channels.find((c) => c._id === messageChannelId)?.type === 'dm'
          const correctedPath = isDM
            ? getDMPath(workspaceId, messageChannelId, routeMessageId)
            : getChannelPath(workspaceId, messageChannelId, routeMessageId)
          navigate(correctedPath, { replace: true })
          return
        }

        useChatStore.getState().addMessage({
          ...message,
          channelId: messageChannelId,
        })

        if (messageChannelId !== activeChannelId) {
          setActiveChannel(messageChannelId)
        }
      } catch {
        // Keep graceful behavior: route-based highlight still applies if message is already loaded.
      }
    }

    syncDeepLinkMessage()

    return () => {
      cancelled = true
    }
  }, [workspaceId, routeMessageId, routeConversationId, channels, navigate, activeChannelId, setActiveChannel])

  // Slack-like DM module behavior: /dms auto-opens the most relevant DM.
  useEffect(() => {
    if (!workspaceId || !dmsHomeRoute) return

    const dmChannels = channels.filter((c) => c.type === 'dm' && !c.isArchived)
    if (dmChannels.length === 0) return

    const nextDM = [...dmChannels].sort((a, b) => {
      const aUnread = unreads[a._id] || 0
      const bUnread = unreads[b._id] || 0
      if (aUnread > 0 && bUnread === 0) return -1
      if (aUnread === 0 && bUnread > 0) return 1

      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
      return bTime - aTime
    })[0]

    if (!nextDM?._id) return
    navigate(getDMPath(workspaceId, nextDM._id), { replace: true })
  }, [workspaceId, dmsHomeRoute, channels, navigate, unreads])

  // Close mobile sidebar when channel is selected
  useEffect(() => {
    setShowMobileSidebar(false)
  }, [activeChannelId])

  const openThread = (thread) => {
    const channelId = typeof thread.channelId === 'object' ? thread.channelId._id : thread.channelId;
    if (channelId && channelId !== activeChannelId) {
      useChannelStore.getState().setActiveChannel(channelId);
    }
    const rootMessageId = typeof thread.rootMessageId === 'object' ? thread.rootMessageId._id : thread.rootMessageId;
    if (rootMessageId) {
      useChatStore.getState().setHighlightMessageId(rootMessageId);
      setTimeout(() => {
        useChatStore.getState().setHighlightMessageId(null);
      }, 3000);
    }
    openThreadAction(thread)
    useProfileStore.getState().closeProfile()
    setShowAllThreads(false)
  }

  const openProfile = (user) => {
    useProfileStore.getState().openProfile(user)
    closeThread()
    useChannelStore.getState().setShowInfoPanel(false)
  }

  const openFilePreview = (file, allFiles = []) => {
    setPreviewFile(file)
    setPreviewFiles(allFiles.length > 0 ? allFiles : [file])
  }

  const handleSaveMessage = useCallback(async (messageId) => {
    try {
      const { data } = await savedMessageAPI.toggle(messageId)
      toast.success(data.data?.saved ? 'Message saved' : 'Message unsaved', { duration: 1500 })
    } catch {
      toast.error('Failed to save message')
    }
  }, [])

  const handleSelectActivityNotification = useCallback((notification) => {
    const data = normalizeNotification(notification)
    if (!workspaceId || !data?._id) return

    const channelId = resolveNotificationChannelId(data)
    if (channelId) {
      setActiveChannel(channelId)

      const messageId = asId(data.messageId || data.sourceId)
      const channelType = data.conversationType
        || data.channelId?.type
        || channels.find((c) => c._id === channelId)?.type

      const nextPath = channelType === 'dm'
        ? getDMPath(workspaceId, channelId, messageId)
        : getChannelPath(workspaceId, channelId, messageId)
      navigate(nextPath)
    } else {
      navigate(getActivityPath(workspaceId, data._id))
    }

    if (data.sourceType === 'message' && (data.messageId || data.sourceId)) {
      const messageId = asId(data.messageId || data.sourceId)
      if (messageId) {
        useChatStore.getState().setHighlightMessageId(messageId)
        setTimeout(() => useChatStore.getState().setHighlightMessageId(null), 3500)
      }
    }
  }, [workspaceId, navigate, setActiveChannel, channels])

  const handleAutoSelectActivityNotification = useCallback((notification) => {
    if (!workspaceId || !notification?._id || activityNotificationId) return
    navigate(getActivityPath(workspaceId, notification._id), { replace: true })
  }, [workspaceId, activityNotificationId, navigate])

  const handleSelectFileForModule = useCallback((file) => {
    if (!workspaceId || !file?.referenceId) return
    navigate(getFilesPath(workspaceId, file.referenceId))
  }, [workspaceId, navigate])

  const handleOpenFileInChat = useCallback(() => {
    if (!workspaceId || !selectedFile) return

    const channelId = asId(selectedFile.channelId)
    if (!channelId) return

    const messageId = asId(selectedFile.messageId)
    const channelType = selectedFile.channel?.type || channels.find((c) => c._id === channelId)?.type

    const nextPath = channelType === 'dm'
      ? getDMPath(workspaceId, channelId, messageId)
      : getChannelPath(workspaceId, channelId, messageId)

    setActiveChannel(channelId)
    navigate(nextPath)
  }, [workspaceId, selectedFile, channels, setActiveChannel, navigate])

  const activeChannel = channels.find((c) => c._id === activeChannelId) || null

  return (
    <div className="h-full flex" style={{ background: 'var(--bg-primary)' }}>
      {/* Workspace Sidebar (70px fixed) */}
      <div className="hide-on-mobile">
        <ErrorBoundary name="WorkspaceSidebar" compact>
          <WorkspaceSidebar />
        </ErrorBoundary>
      </div>

      {/* Context Sidebar (resizable, shell-owned) */}
      <div className="hide-on-mobile relative" style={{ width: sidebarWidth, minWidth: sidebarWidth, transition: isResizing ? 'none' : 'width 200ms ease, min-width 200ms ease' }}>
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
              mode={isDMRoute ? 'dms' : 'home'}
              onToggleAllThreads={() => {
                setShowAllThreads((s) => !s)
                setShowSearch(false)
                setShowPins(false)
                setShowNotifications(false)
                setShowSaved(false)
                useProfileStore.getState().closeProfile()
                closeThread()
              }}
              onToggleNotifications={() => {
                setShowNotifications((s) => !s)
                setShowAllThreads(false)
                setShowSearch(false)
                setShowPins(false)
                setShowSaved(false)
                useProfileStore.getState().closeProfile()
                closeThread()
              }}
              onToggleSaved={() => {
                setShowSaved((s) => !s)
                setShowAllThreads(false)
                setShowSearch(false)
                setShowPins(false)
                setShowNotifications(false)
                useProfileStore.getState().closeProfile()
                closeThread()
              }}
            />
          )}
        </ErrorBoundary>
        {/* Resize Handle */}
        <div
          className="sidebar-resize-handle"
          onMouseDown={handleResizeStart}
          onDoubleClick={handleResizeDoubleClick}
          title="Drag to resize, double-click to collapse"
        />
      </div>

      {/* Mobile Sidebar Overlay */}
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
                  onSelectNotification={(notification) => {
                    handleSelectActivityNotification(notification)
                    setShowMobileSidebar(false)
                  }}
                  onAutoSelect={handleAutoSelectActivityNotification}
                />
              ) : isFilesRoute ? (
                <FilesContextSidebar
                  selectedFileId={filesSelectedFileId}
                  onSelectFile={(file) => {
                    handleSelectFileForModule(file)
                    setShowMobileSidebar(false)
                  }}
                  onFilesChanged={setFilesForModule}
                />
              ) : (
                <NavigationSidebar
                  mode={isDMRoute ? 'dms' : 'home'}
                  onClose={() => setShowMobileSidebar(false)}
                  onToggleNotifications={() => {
                    setShowNotifications((s) => !s)
                    setShowMobileSidebar(false)
                    setShowAllThreads(false)
                    setShowSearch(false)
                    setShowPins(false)
                    useProfileStore.getState().closeProfile()
                    closeThread()
                  }}
                />
              )}
            </ErrorBoundary>
          </div>
        </>
      )}

      {/* Main Content Area */}
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
            setShowNotifications((s) => !s)
            setShowPins(false)
          }}
          onHelp={() => setShowShortcuts(true)}
        />

        <div className="flex-1 flex min-w-0">
        <ErrorBoundary name="Content">
          {(() => {
            if (isActivityRoute) {
              return (
                <ActivityMainPane
                  selectedNotification={selectedNotification}
                  selectedChannelId={resolveNotificationChannelId(selectedNotification)}
                  onOpenMobileSidebar={() => setShowMobileSidebar(true)}
                />
              )
            }

            if (isFilesRoute) {
              return (
                <FilesMainPane
                  selectedFile={selectedFile}
                  files={filesForModule}
                  onPreview={(file) => {
                    setPreviewFile(file)
                    setPreviewFiles(filesForModule)
                  }}
                  onDownload={(file) => downloadFile(file?.url, file?.fileName)}
                  onOpenInChat={handleOpenFileInChat}
                  onOpenMobileSidebar={() => setShowMobileSidebar(true)}
                />
              )
            }

            // Detect page routes using matchPath to avoid fragile string splitting
            // (handles trailing slashes and prevents channel names from colliding)
            const matchedEntry = Object.entries(PAGE_ROUTES).find(([key]) =>
              matchPath(`/workspace/:workspaceId/${key}`, location.pathname)
            )
            const PageComponent = matchedEntry?.[1] ?? null
            if (PageComponent) {
              return (
                <Suspense fallback={<div className="flex-1 flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }} /></div>}>
                  <PageComponent />
                </Suspense>
              )
            }
            return activeChannelId ? (
              <ChatPanel
                channelId={activeChannelId}
                onOpenThread={openThread}
                onToggleSearch={() => { setShowSearch((s) => !s); setShowPins(false) }}
                onTogglePins={() => { setShowPins((s) => !s); setShowSearch(false) }}
                onOpenProfile={openProfile}
                onOpenFilePreview={openFilePreview}
                onOpenMobileSidebar={() => setShowMobileSidebar(true)}
                onSaveMessage={handleSaveMessage}
              />
            ) : (
              <WelcomeScreen onOpenMobileSidebar={() => setShowMobileSidebar(true)} />
            )
          })()}
        </ErrorBoundary>
        </div>
      </div>

      {/* Thread Panel */}
      {activeThread && (
        <ErrorBoundary name="Thread Panel">
          <ThreadPanel thread={activeThread} onClose={closeThread} />
        </ErrorBoundary>
      )}

      {/* Channel Info Panel */}
      {showInfoPanel && activeChannel && !activeThread && !showSearch && !showPins && !profileUser && (
        <ErrorBoundary name="Channel Info" compact>
          <ChannelInfoPanel channel={activeChannel} onOpenProfile={openProfile} />
        </ErrorBoundary>
      )}

      {/* Pinned Messages Panel */}
      {showPins && activeChannelId && !activeThread && (
        <ErrorBoundary name="Pinned Messages" compact>
          <PinnedMessagesPanel channelId={activeChannelId} onClose={() => setShowPins(false)} />
        </ErrorBoundary>
      )}

      {/* All Threads Panel */}
      {showAllThreads && !activeThread && (
        <ErrorBoundary name="All Threads" compact>
          <AllThreadsPanel
            onClose={() => setShowAllThreads(false)}
            onOpenThread={openThread}
          />
        </ErrorBoundary>
      )}

      {/* Profile Side Panel */}
      {profileUser && (
        <ErrorBoundary name="Profile" compact>
          <ProfileSidePanel user={profileUser} onClose={() => useProfileStore.getState().closeProfile()} />
        </ErrorBoundary>
      )}

      {/* Notification Panel */}
      {showNotifications && (
        <ErrorBoundary name="Notifications" compact>
          <NotificationPanel
            onClose={() => setShowNotifications(false)}
            onSelectNotification={handleSelectActivityNotification}
          />
        </ErrorBoundary>
      )}

      {/* Saved Messages Panel */}
      {showSaved && (
        <ErrorBoundary name="Saved Messages" compact>
          <SavedMessagesPanel
            onClose={() => setShowSaved(false)}
            onJumpToMessage={(msg) => {
              if (msg.channelId !== activeChannelId) {
                useChannelStore.getState().setActiveChannel(msg.channelId)
              }
              setShowSaved(false)
            }}
          />
        </ErrorBoundary>
      )}

      {/* Search Panel */}
      {showSearch && (
        <ErrorBoundary name="Search" compact>
          <SearchPanel
            channelId={activeChannelId}
            onClose={() => setShowSearch(false)}
            onJumpToMessage={(msg) => {
              if (msg.channelId !== activeChannelId) {
                useChannelStore.getState().setActiveChannel(msg.channelId)
              }
              setShowSearch(false)
            }}
          />
        </ErrorBoundary>
      )}

      {/* File Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          files={previewFiles}
          onClose={() => { setPreviewFile(null); setPreviewFiles([]) }}
        />
      )}

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}

      {/* Top user profile menu removed */}

      {showTopPreferences && (
        <PreferencesModal onClose={() => setShowTopPreferences(false)} />
      )}
      {showTopSetStatus && (
        <SetStatusModal onClose={() => setShowTopSetStatus(false)} />
      )}
    </div>
  )
}

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
  return (
    <header className="app-topbar">
      <div className="app-topbar__history">
        <button className="app-topbar__icon" onClick={onBack} aria-label="Go back">
          <ArrowLeft size={16} />
        </button>
        <button className="app-topbar__icon" onClick={onForward} aria-label="Go forward">
          <ArrowRight size={16} />
        </button>
      </div>

      <div className="flex-1 max-w-[600px] px-4">
        <GlobalSearch
          ref={searchRef}
          user={user}
          workspaceId={workspaceId}
          onOpenResult={onOpenSearchResult}
        />
      </div>

      <div className="app-topbar__actions">
        <button className="app-topbar__icon app-topbar__bell" onClick={onNotifications} aria-label="Notifications">
          <Bell size={17} />
          {unreadCount > 0 && <span>{unreadCount > 99 ? '99+' : unreadCount}</span>}
        </button>
        <button className="app-topbar__icon" onClick={onHelp} aria-label="Keyboard shortcuts">
          <CircleHelp size={17} />
        </button>
        {/* profile avatar removed from topbar */}
      </div>
    </header>
  )
}

function WelcomeScreen({ onOpenMobileSidebar }) {
  return (
    <div
      className="flex-1 flex items-center justify-center animate-fade-in"
      style={{ color: 'var(--text-muted)' }}
    >
      <div className="text-center max-w-sm px-6">
        {/* Mobile Menu Btn */}
        <button
          onClick={onOpenMobileSidebar}
          className="mobile-menu-btn mx-auto mb-4 p-2 rounded-lg"
          style={{
            color: 'var(--text-secondary)',
            background: 'var(--bg-hover)',
            border: '1px solid var(--border-secondary)',
          }}
        >
          Open sidebar
        </button>

        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-purple))',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h2
          className="text-xl font-bold mb-2"
          style={{ color: 'var(--text-white)' }}
        >
          Welcome to FlowTask Chat
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Select a channel from the sidebar to start a conversation, or create a new one to collaborate with your team.
        </p>
        <div
          className="mt-5 flex items-center justify-center gap-5"
          style={{ fontSize: 12, color: 'var(--text-muted)' }}
        >
          <div className="flex items-center gap-1.5">
            <span style={{ color: 'var(--status-online)', fontSize: 10 }}>●</span>
            Real-time messaging
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ color: 'var(--accent-primary)', fontSize: 10 }}>●</span>
            Project channels
          </div>
        </div>
      </div>
    </div>
  )
}

function ActivityMainPane({ selectedNotification, selectedChannelId, onOpenMobileSidebar }) {
  return (
    <section className="flex-1 min-w-0 flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {!selectedNotification && (
        <div className="flex-1 flex items-center justify-center px-6 text-center">
          <div>
            <button
              onClick={onOpenMobileSidebar}
              className="mobile-menu-btn mx-auto mb-4 p-2 rounded-lg"
              style={{
                color: 'var(--text-secondary)',
                background: 'var(--bg-hover)',
                border: '1px solid var(--border-secondary)',
              }}
            >
              Open activity list
            </button>
            <Activity size={38} className="mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
            <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-white)' }}>
              Select an activity
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Choose a notification to open its related conversation.
            </p>
          </div>
        </div>
      )}

      {selectedNotification && !selectedChannelId && (
        <div className="flex-1 flex items-center justify-center px-6 text-center">
          <div>
            <Info size={36} className="mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
            <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-white)' }}>
              No chat target for this activity
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              This event does not map to a specific channel or DM.
            </p>
          </div>
        </div>
      )}

      {selectedNotification && selectedChannelId && (
        <>
          <div
            className="px-4 py-2 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-secondary)' }}
          >
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span>Opened from Activity</span>
              <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-white)' }}>{getNotificationText(selectedNotification)}</span>
            </div>
          </div>
          <ChatPanel channelId={selectedChannelId} />
        </>
      )}
    </section>
  )
}

function FilesMainPane({ selectedFile, files, onPreview, onDownload, onOpenInChat, onOpenMobileSidebar }) {
  const isImage = selectedFile?.mimeType?.startsWith('image/')
  const isVideo = selectedFile?.mimeType?.startsWith('video/')
  const isAudio = selectedFile?.mimeType?.startsWith('audio/')

  const fileName = selectedFile?.fileName || selectedFile?.originalName || 'Untitled file'

  return (
    <section className="flex-1 min-w-0 flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {!selectedFile && (
        <div className="flex-1 flex items-center justify-center px-6 text-center">
          <div>
            <button
              onClick={onOpenMobileSidebar}
              className="mobile-menu-btn mx-auto mb-4 p-2 rounded-lg"
              style={{
                color: 'var(--text-secondary)',
                background: 'var(--bg-hover)',
                border: '1px solid var(--border-secondary)',
              }}
            >
              Open file list
            </button>
            <FileText size={38} className="mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
            <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-white)' }}>
              Select a file
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Open a file to jump to its original conversation.
            </p>
          </div>
        </div>
      )}

      {selectedFile && (
        <div className="h-full flex flex-col">
          <div
            className="px-4 py-2 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-secondary)' }}
          >
            <div className="flex items-center gap-2 text-sm min-w-0" style={{ color: 'var(--text-secondary)' }}>
              <span className="shrink-0">Files</span>
              <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
              <span className="truncate" style={{ color: 'var(--text-white)' }}>{fileName}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPreview?.(selectedFile)}
                className="px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer"
                style={{ border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
              >
                Preview
              </button>
              <button
                onClick={() => onDownload?.(selectedFile)}
                className="px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                style={{ border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
              >
                <Download size={13} /> Download
              </button>
              <button
                onClick={onOpenInChat}
                className="px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer"
                style={{ border: 'none', background: 'var(--accent-primary)', color: '#ffffff' }}
              >
                Open in chat
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden p-4">
            <div className="h-full rounded-xl border overflow-hidden flex flex-col" style={{ borderColor: 'var(--border-secondary)', background: 'var(--bg-secondary)' }}>
              <div className="px-4 py-3 border-b border-current" style={{ color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-white)' }}>Preview</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{selectedFile.mimeType || 'Unknown type'}, {formatSize(selectedFile.fileSize)}</div>
              </div>
              <div className="flex-1 overflow-auto p-4 flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
                {isImage && selectedFile.url && (
                  <img
                    src={selectedFile.url}
                    alt={fileName}
                    style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }}
                  />
                )}
                {isVideo && selectedFile.url && (
                  <video src={selectedFile.url} controls style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
                )}
                {isAudio && selectedFile.url && (
                  <div style={{ width: '100%', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>{fileName}</p>
                    <audio src={selectedFile.url} controls style={{ width: '100%' }} />
                  </div>
                )}
                {!isImage && !isVideo && !isAudio && (
                  <div className="flex flex-col items-center justify-center" style={{ color: 'var(--text-muted)', gap: '10px' }}>
                    <File size={40} style={{ color: 'var(--text-muted)' }} />
                    <p className="text-sm">Preview not available for this file type.</p>
                    <p className="text-xs">Use Download to open locally.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
