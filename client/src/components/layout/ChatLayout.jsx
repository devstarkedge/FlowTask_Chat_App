import { useEffect, useState, useMemo, useRef, useCallback, lazy, Suspense } from 'react'
import { useLocation, matchPath } from 'react-router-dom'
import { useChannelStore } from '../../stores/channelStore'
import { useChatStore } from '../../stores/chatStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { emitPresenceUpdate } from '../../services/socket'
import ErrorBoundary from '../ErrorBoundary'
import WorkspaceSidebar from './WorkspaceSidebar'
import NavigationSidebar from './NavigationSidebar'
import ChatPanel from '../chat/ChatPanel'
import ThreadPanel from '../chat/ThreadPanel'
import ChannelInfoPanel from '../chat/ChannelInfoPanel'
import SearchPanel from '../chat/SearchPanel'
import ProfileSidePanel from '../chat/ProfileSidePanel'
import FilePreviewModal from '../chat/FilePreviewModal'
import PinnedMessagesPanel from '../chat/PinnedMessagesPanel'
import AllThreadsPanel from '../chat/AllThreadsPanel'
import NotificationPanel from '../notifications/NotificationPanel'
import KeyboardShortcutsModal from '../chat/KeyboardShortcutsModal'
import SavedMessagesPanel from '../chat/SavedMessagesPanel'
import { useKeyboardShortcuts } from '../../utils/keyboardShortcuts'
import { savedMessageAPI } from '../../services/api'
import toast from 'react-hot-toast'

const HomePage = lazy(() => import('../../pages/HomePage'))
const ActivityPage = lazy(() => import('../../pages/ActivityPage'))
const FilesPage = lazy(() => import('../../pages/FilesPage'))
const LaterPage = lazy(() => import('../../pages/LaterPage'))
const ToolsPage = lazy(() => import('../../pages/ToolsPage'))

const PAGE_ROUTES = { home: HomePage, activity: ActivityPage, files: FilesPage, later: LaterPage, tools: ToolsPage }

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

export default function ChatLayout() {
  const { fetchChannels, activeChannelId, channels, showInfoPanel } = useChannelStore()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const location = useLocation()
  const activeThread = useChatStore(s => s.activeThread)
  const openThreadAction = useChatStore(s => s.openThread)
  const closeThread = useChatStore(s => s.closeThread)
  const [showSearch, setShowSearch] = useState(false)
  const [showPins, setShowPins] = useState(false)
  const [showAllThreads, setShowAllThreads] = useState(false)
  const [profileUser, setProfileUser] = useState(null)
  const [previewFile, setPreviewFile] = useState(null)
  const [previewFiles, setPreviewFiles] = useState([])
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showSaved, setShowSaved] = useState(false)

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

  // Keyboard shortcuts
  const shortcutHandlers = useMemo(() => ({
    toggleSearch: () => { setShowSearch((s) => !s); setShowPins(false); setShowAllThreads(false); setShowNotifications(false) },
    toggleThreads: () => { setShowAllThreads((s) => !s); setShowSearch(false); setShowPins(false); setShowNotifications(false); closeThread(); setProfileUser(null) },
    showShortcuts: () => setShowShortcuts((s) => !s),
    escape: () => {
      if (showShortcuts) setShowShortcuts(false)
      else if (showSearch) setShowSearch(false)
      else if (showPins) setShowPins(false)
      else if (showSaved) setShowSaved(false)
      else if (showNotifications) setShowNotifications(false)
      else if (showAllThreads) setShowAllThreads(false)
      else if (profileUser) setProfileUser(null)
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

  useEffect(() => {
    if (activeWorkspaceId) {
      fetchChannels(activeWorkspaceId)
    }
  }, [fetchChannels, activeWorkspaceId])

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
    setProfileUser(null)
    setShowAllThreads(false)
  }

  const openProfile = (user) => {
    setProfileUser(user)
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

  const activeChannel = channels.find((c) => c._id === activeChannelId) || null

  return (
    <div className="h-full flex" style={{ background: 'var(--bg-primary)' }}>
      {/* Workspace Sidebar (70px fixed) */}
      <div className="hide-on-mobile">
        <ErrorBoundary name="WorkspaceSidebar" compact>
          <WorkspaceSidebar />
        </ErrorBoundary>
      </div>

      {/* Navigation Sidebar (resizable) */}
      <div className="hide-on-mobile relative" style={{ width: sidebarWidth, minWidth: sidebarWidth, transition: isResizing ? 'none' : 'width 200ms ease, min-width 200ms ease' }}>
        <ErrorBoundary name="NavigationSidebar" compact>
          <NavigationSidebar
            onToggleAllThreads={() => {
              setShowAllThreads((s) => !s)
              setShowSearch(false)
              setShowPins(false)
              setShowNotifications(false)
              setShowSaved(false)
              setProfileUser(null)
              closeThread()
            }}
            onToggleNotifications={() => {
              setShowNotifications((s) => !s)
              setShowAllThreads(false)
              setShowSearch(false)
              setShowPins(false)
              setShowSaved(false)
              setProfileUser(null)
              closeThread()
            }}
            onToggleSaved={() => {
              setShowSaved((s) => !s)
              setShowAllThreads(false)
              setShowSearch(false)
              setShowPins(false)
              setShowNotifications(false)
              setProfileUser(null)
              closeThread()
            }}
          />
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
            <ErrorBoundary name="NavigationSidebar" compact>
              <NavigationSidebar
                onClose={() => setShowMobileSidebar(false)}
                onToggleNotifications={() => {
                  setShowNotifications((s) => !s)
                  setShowMobileSidebar(false)
                  setShowAllThreads(false)
                  setShowSearch(false)
                  setShowPins(false)
                  setProfileUser(null)
                  closeThread()
                }}
              />
            </ErrorBoundary>
          </div>
        </>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex min-w-0">
        <ErrorBoundary name="Content">
          {(() => {
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
          <ProfileSidePanel user={profileUser} onClose={() => setProfileUser(null)} />
        </ErrorBoundary>
      )}

      {/* Notification Panel */}
      {showNotifications && (
        <ErrorBoundary name="Notifications" compact>
          <NotificationPanel onClose={() => setShowNotifications(false)} />
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
    </div>
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
