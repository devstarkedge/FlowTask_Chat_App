import { useEffect, useMemo, useRef, useState } from 'react'
import { useChannelStore } from '../../stores/channelStore'
import { useChatStore } from '../../stores/chatStore'
import { joinChannel, leaveChannel } from '../../services/socket'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import ChatHeader from './ChatHeader'
import TypingIndicator from './TypingIndicator'
import FilesTab from './FilesTab'
import { WifiOff, Loader2 } from 'lucide-react'
import { CHAT_FEATURE_FLAGS } from '../../config/featureFlags'

const EMPTY_LIST = []

export default function ChatPanel({
  channelId,
  workspaceId,
  onOpenThread,
  onToggleSearch,
  onTogglePins,
  onOpenProfile,
  onOpenFilePreview,
  onOpenMobileSidebar,
  onSaveMessage,
}) {
  const channel = useChannelStore((s) => s.channels.find((c) => c._id === channelId))
  const fetchMessages = useChatStore((s) => s.fetchMessages)
  const legacyMessages = useChatStore((s) => s.messagesByChannel[channelId] || EMPTY_LIST)
  const channelMessageIds = useChatStore((s) => s.channelMessageIds[channelId] || EMPTY_LIST)
  const messagesById = useChatStore((s) => s.messagesById)
  const connectionStatus = useChatStore((s) => s.connectionStatus)
  const prevChannelRef = useRef(null)
  const [activeTab, setActiveTab] = useState('messages')

  const messages = useMemo(() => {
    if (!CHAT_FEATURE_FLAGS.normalizedMessageStore) return legacyMessages
    if (!channelMessageIds.length) return EMPTY_LIST
    return channelMessageIds
      .map((id) => messagesById[id])
      .filter(Boolean)
  }, [legacyMessages, channelMessageIds, messagesById])

  useEffect(() => {
    if (!channelId) return

    if (prevChannelRef.current && prevChannelRef.current !== channelId) {
      leaveChannel(prevChannelRef.current)
    }
    joinChannel(channelId)
    prevChannelRef.current = channelId

    fetchMessages(channelId)
    setActiveTab('messages')

    return () => {
      leaveChannel(channelId)
    }
  }, [channelId, fetchMessages])

  const isDMChannel = channel?.type === 'dm'

  return (
    <div className="flex-1 flex flex-col min-w-0 chat-panel-shell relative">
      <ChatHeader
        channel={channel}
        onToggleSearch={onToggleSearch}
        onTogglePins={onTogglePins}
        onOpenMobileSidebar={onOpenMobileSidebar}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Connection Status Banner */}
      {connectionStatus === 'connecting' && (
        <div
          className="flex items-center justify-center gap-2 py-1.5 text-xs font-medium animate-fade-in"
          style={{ background: 'var(--warning-color)', color: 'var(--text-inverse)' }}
        >
          <Loader2 size={12} className="animate-spin" />
          Reconnecting...
        </div>
      )}
      {connectionStatus === 'disconnected' && (
        <div
          className="flex items-center justify-center gap-2 py-1.5 text-xs font-medium animate-fade-in"
          style={{ background: 'var(--danger-color)', color: '#ffffff' }}
        >
          <WifiOff size={12} />
          Connection lost. Trying to reconnect...
        </div>
      )}

      {activeTab === 'files' ? (
        <FilesTab channelId={channelId} onOpenFilePreview={onOpenFilePreview} />
      ) : (
        <>
          <MessageList
            messages={messages}
            channelId={channelId}
            onOpenThread={onOpenThread}
            onOpenProfile={onOpenProfile}
            onOpenFilePreview={onOpenFilePreview}
            isDMChannel={isDMChannel}
            onSaveMessage={onSaveMessage}
          />

          <TypingIndicator channelId={channelId} />

          <MessageInput channelId={channelId} />
        </>
      )}
    </div>
  )
}
