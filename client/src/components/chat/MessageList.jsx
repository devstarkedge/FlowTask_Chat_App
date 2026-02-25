import { useEffect, useRef, useCallback } from 'react'
import { useChatStore } from '../../stores/chatStore'
import MessageItem from './MessageItem'
import ActivityMessage from './ActivityMessage'
import { MessageCircle } from 'lucide-react'

export default function MessageList({ messages, channelId, onOpenThread, onOpenProfile, onOpenFilePreview }) {
  const { isLoadingMessages, hasMore, fetchMessages } = useChatStore()
  const bottomRef = useRef(null)
  const listRef = useRef(null)
  const prevLengthRef = useRef(0)

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevLengthRef.current = messages.length
  }, [messages.length])

  // Scroll to bottom on channel change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' })
    prevLengthRef.current = 0
  }, [channelId])

  // Load more on scroll to top
  const handleScroll = useCallback(() => {
    if (!listRef.current || !hasMore[channelId]) return
    if (listRef.current.scrollTop < 100 && !isLoadingMessages) {
      const oldest = messages[0]
      if (oldest) {
        fetchMessages(channelId, { cursor: oldest._id, limit: 50 })
      }
    }
  }, [channelId, hasMore, isLoadingMessages, messages, fetchMessages])

  // Check if message is activity/system type
  const isActivityMessage = (msg) => {
    return msg.contentType === 'activity' || msg.contentType === 'system' || msg.contentType === 'bot'
  }

  // Group messages by date
  const groupedMessages = groupByDate(messages)

  return (
    <div
      ref={listRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto"
      style={{ padding: '8px 0' }}
    >
      {/* Skeleton Loader */}
      {isLoadingMessages && messages.length === 0 && (
        <div style={{ padding: '16px 20px' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <MessageSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Load more indicator */}
      {isLoadingMessages && messages.length > 0 && (
        <div style={{ padding: '8px 20px', textAlign: 'center' }}>
          <div
            className="skeleton"
            style={{ width: 120, height: 20, margin: '0 auto', borderRadius: 10 }}
          />
        </div>
      )}

      {/* Empty State */}
      {!isLoadingMessages && messages.length === 0 && (
        <EmptyState />
      )}

      {/* Messages grouped by date */}
      {groupedMessages.map(({ date, items }) => (
        <div key={date}>
          {/* Date Separator */}
          <div
            className="animate-fade-in"
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 20px 4px',
              gap: 12,
            }}
          >
            <div style={{ flex: 1, height: 1, background: 'var(--border-secondary)' }} />
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-muted)',
                padding: '2px 10px',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--border-secondary)',
                whiteSpace: 'nowrap',
              }}
            >
              {date}
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-secondary)' }} />
          </div>

          {items.map((msg, idx) => {
            // Determine if this message should show author info
            const prevMsg = idx > 0 ? items[idx - 1] : null
            const isCompact = prevMsg
              && prevMsg.authorId === msg.authorId
              && !isActivityMessage(msg)
              && !isActivityMessage(prevMsg)
              && (new Date(msg.createdAt) - new Date(prevMsg.createdAt)) < 300000 // 5 min

            if (isActivityMessage(msg)) {
              return (
                <div key={msg._id} style={{ padding: '2px 20px' }}>
                  <ActivityMessage message={msg} />
                </div>
              )
            }

            return (
              <MessageItem
                key={msg._id}
                message={msg}
                compact={isCompact}
                onOpenThread={onOpenThread}
                onOpenProfile={onOpenProfile}
                onOpenFilePreview={onOpenFilePreview}
              />
            )
          })}
        </div>
      ))}

      <div ref={bottomRef} />
    </div>
  )
}

function MessageSkeleton() {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '6px 0' }} className="animate-fade-in">
      <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 'var(--radius-lg)', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <div className="skeleton" style={{ width: 100, height: 14 }} />
          <div className="skeleton" style={{ width: 48, height: 14 }} />
        </div>
        <div className="skeleton" style={{ width: '70%', height: 14, marginBottom: 4 }} />
        <div className="skeleton" style={{ width: '45%', height: 14 }} />
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div
      className="flex items-center justify-center h-full animate-fade-in"
      style={{ color: 'var(--text-muted)' }}
    >
      <div className="text-center">
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 'var(--radius-xl)',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
          }}
        >
          <MessageCircle size={24} style={{ color: 'var(--text-muted)' }} />
        </div>
        <p style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
          No messages yet
        </p>
        <p style={{ fontSize: 13 }}>
          Start the conversation by sending a message below.
        </p>
      </div>
    </div>
  )
}

function groupByDate(messages) {
  const groups = []
  let currentDate = null
  let currentGroup = null

  for (const msg of messages) {
    const d = new Date(msg.createdAt)
    const label = formatDateLabel(d)

    if (label !== currentDate) {
      currentDate = label
      currentGroup = { date: label, items: [] }
      groups.push(currentGroup)
    }
    currentGroup.items.push(msg)
  }

  return groups
}

function formatDateLabel(date) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diff = today - messageDay
  const dayMs = 86400000

  if (diff === 0) return 'Today'
  if (diff === dayMs) return 'Yesterday'
  if (diff < dayMs * 7) {
    return date.toLocaleDateString(undefined, { weekday: 'long' })
  }
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}
