import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useChannelStore } from '../../stores/channelStore'
import { useChatStore } from '../../stores/chatStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { emitPresenceUpdate } from '../../services/socket'
import ErrorBoundary from '../ErrorBoundary'
import Sidebar from './Sidebar'
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
import { useKeyboardShortcuts } from '../../utils/keyboardShortcuts'

export default function ChatLayout() {
  const { fetchChannels, activeChannelId, channels, showInfoPanel } = useChannelStore()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
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

  // Keyboard shortcuts
  const shortcutHandlers = useMemo(() => ({
    toggleSearch: () => { setShowSearch((s) => !s); setShowPins(false); setShowAllThreads(false); setShowNotifications(false) },
    toggleThreads: () => { setShowAllThreads((s) => !s); setShowSearch(false); setShowPins(false); setShowNotifications(false); closeThread(); setProfileUser(null) },
    showShortcuts: () => setShowShortcuts((s) => !s),
    escape: () => {
      if (showShortcuts) setShowShortcuts(false)
      else if (showSearch) setShowSearch(false)
      else if (showPins) setShowPins(false)
      else if (showNotifications) setShowNotifications(false)
      else if (showAllThreads) setShowAllThreads(false)
      else if (profileUser) setProfileUser(null)
    },
  }), [showShortcuts, showSearch, showPins, showAllThreads, showNotifications, profileUser, closeThread])
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
    fetchChannels()
  }, [fetchChannels, activeWorkspaceId])

  // Close mobile sidebar when channel is selected
  useEffect(() => {
    setShowMobileSidebar(false)
  }, [activeChannelId])

  const openThread = (thread) => {
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

  const activeChannel = channels.find((c) => c._id === activeChannelId) || null

  return (
    <div className="h-full flex" style={{ background: 'var(--bg-primary)' }}>
      {/* Desktop Sidebar */}
      <div className="hide-on-mobile">
        <ErrorBoundary name="Sidebar" compact>
          <Sidebar
            onToggleAllThreads={() => {
              setShowAllThreads((s) => !s)
              setShowSearch(false)
              setShowPins(false)
              setShowNotifications(false)
              setProfileUser(null)
              closeThread()
            }}
            onToggleNotifications={() => {
              setShowNotifications((s) => !s)
              setShowAllThreads(false)
              setShowSearch(false)
              setShowPins(false)
              setProfileUser(null)
              closeThread()
            }}
          />
        </ErrorBoundary>
      </div>

      {/* Mobile Sidebar Overlay */}
      {showMobileSidebar && (
        <>
          <div
            className="sidebar-overlay active"
            onClick={() => setShowMobileSidebar(false)}
          />
          <div className="sidebar-mobile">
            <ErrorBoundary name="Sidebar" compact>
              <Sidebar
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

      {/* Main Chat Area */}
      <div className="flex-1 flex min-w-0">
        <ErrorBoundary name="Chat">
          {activeChannelId ? (
            <ChatPanel
              channelId={activeChannelId}
              onOpenThread={openThread}
              onToggleSearch={() => { setShowSearch((s) => !s); setShowPins(false) }}
              onTogglePins={() => { setShowPins((s) => !s); setShowSearch(false) }}
              onOpenProfile={openProfile}
              onOpenFilePreview={openFilePreview}
              onOpenMobileSidebar={() => setShowMobileSidebar(true)}
            />
          ) : (
            <WelcomeScreen onOpenMobileSidebar={() => setShowMobileSidebar(true)} />
          )}
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
