import { useEffect, useRef } from 'react'
import { useChatStore } from '../../stores/chatStore'
import MessageItem from './MessageItem'
import TypingIndicator from './TypingIndicator'

export default function MessageList({ messages, channelId, onOpenThread }) {
  const bottomRef = useRef(null)
  const containerRef = useRef(null)
  const { hasMore, fetchMessages, isLoadingMessages } = useChatStore()
  const prevMessagesLenRef = useRef(0)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > prevMessagesLenRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevMessagesLenRef.current = messages.length
  }, [messages.length])

  // Initial scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView()
  }, [channelId])

  // Date separator logic
  const getDateLabel = (dateStr) => {
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) return 'Today'
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  }

  let lastDate = null

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-2">
      {isLoadingMessages && messages.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }} />
        </div>
      )}

      {messages.length === 0 && !isLoadingMessages && (
        <div className="flex items-center justify-center py-12"
          style={{ color: 'var(--text-muted)' }}>
          <p className="text-sm">No messages yet. Start the conversation!</p>
        </div>
      )}

      {messages.map((message, idx) => {
        const msgDate = getDateLabel(message.createdAt)
        const showDate = msgDate !== lastDate
        lastDate = msgDate

        // Group consecutive messages from the same author within 5 minutes
        const prevMsg = messages[idx - 1]
        const isGrouped = prevMsg
          && prevMsg.authorId?._id === message.authorId?._id
          && !showDate
          && (new Date(message.createdAt) - new Date(prevMsg.createdAt)) < 300000

        return (
          <div key={message._id}>
            {showDate && (
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px" style={{ background: 'var(--border-primary)' }} />
                <span className="text-xs font-medium px-3 py-1 rounded-full"
                  style={{ color: 'var(--text-muted)', background: 'var(--bg-secondary)' }}>
                  {msgDate}
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--border-primary)' }} />
              </div>
            )}
            <MessageItem
              message={message}
              isGrouped={isGrouped}
              onOpenThread={onOpenThread}
            />
          </div>
        )
      })}

      <TypingIndicator channelId={channelId} />
      <div ref={bottomRef} />
    </div>
  )
}
