import { useEffect, useRef } from 'react'
import { useChannelStore } from '../../stores/channelStore'
import { useChatStore } from '../../stores/chatStore'
import { joinChannel, leaveChannel } from '../../services/socket'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import ChatHeader from './ChatHeader'

export default function ChatPanel({ channelId, onOpenThread, onToggleSearch }) {
  const channel = useChannelStore((s) => s.channels.find((c) => c._id === channelId))
  const { fetchMessages, messagesByChannel } = useChatStore()
  const prevChannelRef = useRef(null)

  useEffect(() => {
    if (!channelId) return

    // Leave previous channel room, join new
    if (prevChannelRef.current && prevChannelRef.current !== channelId) {
      leaveChannel(prevChannelRef.current)
    }
    joinChannel(channelId)
    prevChannelRef.current = channelId

    // Fetch messages
    fetchMessages(channelId)

    return () => {
      leaveChannel(channelId)
    }
  }, [channelId, fetchMessages])

  const messages = messagesByChannel[channelId] || []

  return (
    <div className="flex-1 flex flex-col min-w-0" style={{ background: 'var(--bg-primary)' }}>
      <ChatHeader channel={channel} onToggleSearch={onToggleSearch} />

      <MessageList
        messages={messages}
        channelId={channelId}
        onOpenThread={onOpenThread}
      />

      <MessageInput channelId={channelId} />
    </div>
  )
}
