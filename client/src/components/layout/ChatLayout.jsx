import { useEffect, useState } from 'react'
import { useChannelStore } from '../../stores/channelStore'
import { useChatStore } from '../../stores/chatStore'
import Sidebar from './Sidebar'
import ChatPanel from '../chat/ChatPanel'
import ThreadPanel from '../chat/ThreadPanel'
import ChannelInfoPanel from '../chat/ChannelInfoPanel'
import SearchPanel from '../chat/SearchPanel'

export default function ChatLayout() {
  const { fetchChannels, activeChannelId, channels, showInfoPanel } = useChannelStore()
  const [showThread, setShowThread] = useState(false)
  const [activeThread, setActiveThread] = useState(null)
  const [showSearch, setShowSearch] = useState(false)

  useEffect(() => {
    fetchChannels()
  }, [fetchChannels])

  const openThread = (thread) => {
    setActiveThread(thread)
    setShowThread(true)
  }

  const closeThread = () => {
    setShowThread(false)
    setActiveThread(null)
  }

  const activeChannel = channels.find((c) => c._id === activeChannelId) || null

  return (
    <div className="h-full flex" style={{ background: 'var(--bg-primary)' }}>
      {/* Sidebar */}
      <Sidebar />

      {/* Main Chat Area */}
      <div className="flex-1 flex min-w-0">
        {activeChannelId ? (
          <ChatPanel
            channelId={activeChannelId}
            onOpenThread={openThread}
            onToggleSearch={() => setShowSearch((s) => !s)}
          />
        ) : (
          <WelcomeScreen />
        )}
      </div>

      {/* Thread Panel */}
      {showThread && activeThread && (
        <ThreadPanel thread={activeThread} onClose={closeThread} />
      )}

      {/* Channel Info Panel */}
      {showInfoPanel && activeChannel && !showThread && !showSearch && (
        <ChannelInfoPanel channel={activeChannel} />
      )}

      {/* Search Panel */}
      {showSearch && (
        <SearchPanel
          channelId={activeChannelId}
          onClose={() => setShowSearch(false)}
          onJumpToMessage={(msg) => {
            // If message is in a different channel, switch to it
            if (msg.channelId !== activeChannelId) {
              useChannelStore.getState().setActiveChannel(msg.channelId)
            }
            setShowSearch(false)
          }}
        />
      )}
    </div>
  )
}

function WelcomeScreen() {
  return (
    <div
      className="flex-1 flex items-center justify-center"
      style={{ color: 'var(--text-muted)' }}
    >
      <div className="text-center max-w-md">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: 'var(--bg-hover)' }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <p
          className="text-lg font-semibold mb-2"
          style={{ color: 'var(--text-white)' }}
        >
          Welcome to FlowTask Chat
        </p>
        <p className="text-sm">
          Select a channel from the sidebar to start a conversation, or create a
          new one to collaborate with your team.
        </p>
      </div>
    </div>
  )
}
