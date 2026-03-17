import { useEffect, useRef, useMemo, useCallback } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useChannelStore } from '../../stores/channelStore'
import MessageItem from './MessageItem'
import ActivityMessage from './ActivityMessage'
import { MessageCircle } from 'lucide-react'
import { Virtuoso } from 'react-virtuoso'

export default function MessageList({ messages, channelId, onOpenThread, onOpenProfile, onOpenFilePreview, isDMChannel, onSaveMessage }) {
  const { isLoadingMessages, hasMore, fetchMessages, highlightMessageId } = useChatStore()
  const lastReadByChannel = useChannelStore((s) => s.lastReadByChannel)
  const lastReadMessageId = lastReadByChannel[channelId]
  const virtuosoRef = useRef(null)
  const lastScrolledHighlightId = useRef(null)

  // Load more on scroll to top — with debounce protection
  const loadMore = useCallback(() => {
    if (!hasMore[channelId] || isLoadingMessages || messages.length === 0) return
    const oldest = messages[0]
    if (oldest) {
      fetchMessages(channelId, { cursor: oldest._id, limit: 80 })
    }
  }, [channelId, hasMore, isLoadingMessages, messages, fetchMessages])

  // Scroll to bottom when channel changes
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'auto' })
      }, 50)
    }
  }, [channelId])



  // Check if message is activity/system type
  const isActivityMessage = (msg) => {
    return msg.contentType === 'activity' || msg.contentType === 'system' || msg.contentType === 'bot'
  }

  // Flatten messages with date separators and unread marker for virtualization
  const flattenedItems = useMemo(() => {
    const flattened = []
    let currentDate = null
    let insertedUnreadMarker = false

    const lastReadIndex = lastReadMessageId
      ? messages.findIndex((m) => m._id === lastReadMessageId)
      : -1

    if (lastReadMessageId && messages.length > 0 && lastReadIndex === -1) {
      flattened.push({ isUnreadSeparator: true, _id: 'unread-separator' })
      insertedUnreadMarker = true
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const d = new Date(msg.createdAt)
      const label = formatDateLabel(d)

      // Track if any separator is inserted just before this message so we can
      // break the visual group (prevent isCompact being true across a separator)
      let separatorJustInserted = false

      if (label !== currentDate) {
        currentDate = label
        flattened.push({ isDateSeparator: true, date: label, _id: `date-${label}` })
        separatorJustInserted = true
      }

      // Insert unread separator after the last-read message
      // Only insert if there are messages after the last read one
      if (
        !insertedUnreadMarker &&
        lastReadMessageId &&
        i > 0 &&
        messages[i - 1]._id === lastReadMessageId &&
        msg._id !== lastReadMessageId
      ) {
        flattened.push({ isUnreadSeparator: true, _id: 'unread-separator' })
        insertedUnreadMarker = true
        separatorJustInserted = true
      }

      // Add compact + group-position properties dynamically.
      // Null out prevMsg if a separator was inserted right before this message
      // so the first message after a separator always starts a new visual group.
      const prevMsg = (i > 0 && !separatorJustInserted) ? messages[i - 1] : null

      // Null out nextMsg if a separator will be inserted before the next message
      // (date change or unread marker) to correctly mark `isLastInGroup`.
      const nextMsgRaw = i < messages.length - 1 ? messages[i + 1] : null
      const nextWillHaveSeparator = nextMsgRaw && (
        formatDateLabel(new Date(nextMsgRaw.createdAt)) !== label ||
        (!insertedUnreadMarker && lastReadMessageId && msg._id === lastReadMessageId)
      )
      const nextMsg = nextWillHaveSeparator ? null : nextMsgRaw

      const prevAuthorId = prevMsg?.authorId?._id || prevMsg?.authorId
      const currentAuthorId = msg.authorId?._id || msg.authorId
      const nextAuthorId = nextMsg?.authorId?._id || nextMsg?.authorId

      const sameAsPrev = !!(prevMsg
        && prevAuthorId
        && currentAuthorId
        && prevAuthorId.toString() === currentAuthorId.toString()
        && !isActivityMessage(msg)
        && !isActivityMessage(prevMsg)
        && (new Date(msg.createdAt) - new Date(prevMsg.createdAt)) < 300000)

      const sameAsNext = !!(nextMsg
        && nextAuthorId
        && currentAuthorId
        && nextAuthorId.toString() === currentAuthorId.toString()
        && !isActivityMessage(msg)
        && !isActivityMessage(nextMsg)
        && (new Date(nextMsg.createdAt) - new Date(msg.createdAt)) < 300000)

      const isCompact = sameAsPrev
      const isLastInGroup = !sameAsNext

      flattened.push({ ...msg, isCompact, isLastInGroup })
    }
    return flattened
  }, [messages, lastReadMessageId])

  // Scroll to highlighted message
  useEffect(() => {
    if (highlightMessageId && highlightMessageId !== lastScrolledHighlightId.current && virtuosoRef.current && flattenedItems.length > 0) {
      const idx = flattenedItems.findIndex(item => item._id === highlightMessageId)
      if (idx !== -1) {
        lastScrolledHighlightId.current = highlightMessageId
        setTimeout(() => {
          virtuosoRef.current.scrollToIndex({ index: idx, align: 'center', behavior: 'smooth' })
        }, 100)
      }
    } else if (!highlightMessageId) {
      lastScrolledHighlightId.current = null
    }
  }, [highlightMessageId, flattenedItems])

  // Track initial load vs pagination load (show skeleton on initial load only)
  const isInitialLoad = isLoadingMessages && messages.length === 0

  if (isInitialLoad) {
    return (
      <div className="flex-1 overflow-hidden" style={{ padding: '16px 20px' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <MessageSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (!isLoadingMessages && messages.length === 0) {
    return (
      <div className="flex-1 overflow-hidden">
        <EmptyState />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-hidden relative" role="log" aria-label="Message list" aria-live="polite">
      <Virtuoso
        ref={virtuosoRef}
        data={flattenedItems}
        computeItemKey={(index, item) => item._id || index}
        className="w-full h-full"
        firstItemIndex={1000000 - flattenedItems.length}
        initialTopMostItemIndex={flattenedItems.length - 1}
        startReached={loadMore}
        followOutput={(isAtBottom) => (isAtBottom ? 'smooth' : false)}
        alignToBottom={true}
        increaseViewportBy={{ top: 400, bottom: 200 }}
        components={{
          Header: () => (
            isLoadingMessages && messages.length > 0 ? (
              <div style={{ padding: '8px 20px', textAlign: 'center' }}>
                <div
                  className="skeleton"
                  style={{ width: 120, height: 20, margin: '0 auto', borderRadius: 10 }}
                />
              </div>
            ) : null
          ),
          Footer: () => <div style={{ height: 16 }} />
        }}
        itemContent={(index, item) => {
          if (item.isDateSeparator) {
            return (
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
                  {item.date}
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border-secondary)' }} />
              </div>
            )
          }

          if (isActivityMessage(item)) {
            return (
              <div style={{ padding: '2px 20px' }}>
                <ActivityMessage message={item} />
              </div>
            )
          }

          if (item.isUnreadSeparator) {
            return (
              <div
                className="animate-fade-in"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 20px 4px',
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, height: 1, background: 'var(--status-error)' }} />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--status-error)',
                    whiteSpace: 'nowrap',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  New
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--status-error)' }} />
              </div>
            )
          }

          return (
            <MessageItem
              message={item}
              compact={item.isCompact}
              isLastInGroup={item.isLastInGroup}
              onOpenThread={onOpenThread}
              onOpenProfile={onOpenProfile}
              onOpenFilePreview={onOpenFilePreview}
              isDMChannel={isDMChannel}
              onSaveMessage={onSaveMessage}
            />
          )
        }}
      />
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
