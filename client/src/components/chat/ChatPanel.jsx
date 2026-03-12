import { useEffect, useRef } from 'react'
import { useChannelStore } from '../../stores/channelStore'
import { useChatStore } from '../../stores/chatStore'
import { joinChannel, leaveChannel } from '../../services/socket'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import ChatHeader from './ChatHeader'
import TypingIndicator from './TypingIndicator'
import { Wifi, WifiOff, Loader2 } from 'lucide-react'

export default function ChatPanel({ channelId, onOpenThread, onToggleSearch, onTogglePins, onOpenProfile, onOpenFilePreview, onOpenMobileSidebar, onSaveMessage }) {
  const channel = useChannelStore((s) => s.channels.find((c) => c._id === channelId))
  const { fetchMessages, messagesByChannel } = useChatStore()
  const connectionStatus = useChatStore((s) => s.connectionStatus)
  const prevChannelRef = useRef(null)

  useEffect(() => {
    if (!channelId) return

    if (prevChannelRef.current && prevChannelRef.current !== channelId) {
      leaveChannel(prevChannelRef.current)
    }
    joinChannel(channelId)
    prevChannelRef.current = channelId

    fetchMessages(channelId)

    return () => {
      leaveChannel(channelId)
    }
  }, [channelId, fetchMessages])

  const messages = messagesByChannel[channelId] || []
  const isDMChannel = channel?.type === 'dm'

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#f0f2fa]">
      <ChatHeader
        channel={channel}
        onToggleSearch={onToggleSearch}
        onTogglePins={onTogglePins}
        onOpenMobileSidebar={onOpenMobileSidebar}
      />

      {/* Connection Status Banner */}
      {connectionStatus === 'connecting' && (
        <div
          className="flex items-center justify-center gap-2 py-1.5 text-xs font-medium animate-fade-in"
          style={{ background: 'var(--accent-yellow)', color: '#000' }}
        >
          <Loader2 size={12} className="animate-spin" />
          Reconnecting...
        </div>
      )}
      {connectionStatus === 'disconnected' && (
        <div
          className="flex items-center justify-center gap-2 py-1.5 text-xs font-medium animate-fade-in"
          style={{ background: 'var(--accent-red)', color: '#fff' }}
        >
          <WifiOff size={12} />
          Connection lost. Trying to reconnect...
        </div>
      )}

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
    </div>
  )
}
