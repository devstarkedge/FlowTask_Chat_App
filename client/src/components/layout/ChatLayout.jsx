import { useEffect, useState } from 'react'
import { useChannelStore } from '../../stores/channelStore'
import Sidebar from './Sidebar'
import ChatPanel from '../chat/ChatPanel'
import ThreadPanel from '../chat/ThreadPanel'
import ChannelInfoPanel from '../chat/ChannelInfoPanel'
import SearchPanel from '../chat/SearchPanel'
import ProfileSidePanel from '../chat/ProfileSidePanel'
import FilePreviewModal from '../chat/FilePreviewModal'

export default function ChatLayout() {
  const { fetchChannels, activeChannelId, channels, showInfoPanel } = useChannelStore()
  const [showThread, setShowThread] = useState(false)
  const [activeThread, setActiveThread] = useState(null)
  const [showSearch, setShowSearch] = useState(false)
  const [profileUser, setProfileUser] = useState(null)
  const [previewFile, setPreviewFile] = useState(null)
  const [previewFiles, setPreviewFiles] = useState([])
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)

  useEffect(() => {
    fetchChannels()
  }, [fetchChannels])

  // Close mobile sidebar when channel is selected
  useEffect(() => {
    setShowMobileSidebar(false)
  }, [activeChannelId])

  const openThread = (thread) => {
    setActiveThread(thread)
    setShowThread(true)
    setProfileUser(null)
  }

  const closeThread = () => {
    setShowThread(false)
    setActiveThread(null)
  }

  const openProfile = (user) => {
    setProfileUser(user)
    setShowThread(false)
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
        <Sidebar />
      </div>

      {/* Mobile Sidebar Overlay */}
      {showMobileSidebar && (
        <>
          <div
            className="sidebar-overlay active"
            onClick={() => setShowMobileSidebar(false)}
          />
          <div className="sidebar-mobile">
            <Sidebar onClose={() => setShowMobileSidebar(false)} />
          </div>
        </>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex min-w-0">
        {activeChannelId ? (
          <ChatPanel
            channelId={activeChannelId}
            onOpenThread={openThread}
            onToggleSearch={() => setShowSearch((s) => !s)}
            onOpenProfile={openProfile}
            onOpenFilePreview={openFilePreview}
            onOpenMobileSidebar={() => setShowMobileSidebar(true)}
          />
        ) : (
          <WelcomeScreen onOpenMobileSidebar={() => setShowMobileSidebar(true)} />
        )}
      </div>

      {/* Thread Panel */}
      {showThread && activeThread && (
        <ThreadPanel thread={activeThread} onClose={closeThread} />
      )}

      {/* Channel Info Panel */}
      {showInfoPanel && activeChannel && !showThread && !showSearch && !profileUser && (
        <ChannelInfoPanel channel={activeChannel} onOpenProfile={openProfile} />
      )}

      {/* Profile Side Panel */}
      {profileUser && (
        <ProfileSidePanel user={profileUser} onClose={() => setProfileUser(null)} />
      )}

      {/* Search Panel */}
      {showSearch && (
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
      )}

      {/* File Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          files={previewFiles}
          onClose={() => { setPreviewFile(null); setPreviewFiles([]) }}
        />
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
