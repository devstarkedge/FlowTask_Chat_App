/* eslint-disable react/prop-types */
import { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useChannelStore } from '../../stores/channelStore'
import { useAuthStore } from '../../stores/authStore'
import MessageItem from './MessageItem'
import AutoActivityMessage from './AutoActivityMessage'
import { MessageCircle, ChevronDown } from 'lucide-react'
import { Virtuoso } from 'react-virtuoso'

export default function MessageList({ messages, channelId, onOpenThread, onOpenProfile, onOpenFilePreview, isDMChannel, onSaveMessage }) {
  const { isLoadingMessages, hasMore, fetchMessages, highlightMessageId } = useChatStore()
  const lastReadByChannel = useChannelStore((s) => s.lastReadByChannel)
  const currentUserId = useAuthStore((s) => s.user?._id)
  const lastReadMessageId = lastReadByChannel[channelId]

  const virtuosoRef = useRef(null)
  const lastScrolledHighlightId = useRef(null)

  // Tracks whether the user is at (or very near) the bottom of the list.
  // Written by Virtuoso's atBottomStateChange — never causes a re-render itself.
  const isAtBottomRef = useRef(true)

  // Show/hide the "scroll to bottom" floating button
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  // Snapshot of the previous render so we can detect *new* messages arriving
  // without reacting to unrelated state changes (edits, reactions, etc.)
  const prevRef = useRef({ count: 0, lastId: null, channelId: null })

  // ─── Load older messages when user scrolls to top ────────────────────
  const loadMore = useCallback(() => {
    if (!hasMore[channelId] || isLoadingMessages || messages.length === 0) return
    const oldest = messages[0]
    if (oldest) fetchMessages(channelId, { cursor: oldest._id, limit: 80 })
  }, [channelId, hasMore, isLoadingMessages, messages, fetchMessages])

  // ─── Hard-jump to bottom whenever the active channel changes ─────────
  useEffect(() => {
    // Reset tracking state for the new channel
    isAtBottomRef.current = true
    setShowScrollBtn(false)
    prevRef.current = { count: 0, lastId: null, channelId }

    if (messages.length > 0) {
      // Small delay lets Virtuoso finish its first paint before we scroll
      setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'auto' })
      }, 50)
    }
    // Intentionally only re-run when channelId changes — not when messages changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId])

  // ─── Smart auto-scroll on new messages ───────────────────────────────
  // Detects when a genuinely *new* message is appended (not an edit, reaction
  // update, or status change) and decides whether to scroll.
  useEffect(() => {
    const prev = prevRef.current
    const lastMsg = messages[messages.length - 1]

    // First render for this channel — record baseline, don't scroll
    // (the channelId effect above already handled the initial jump)
    if (prev.channelId !== channelId || messages.length === 0) {
      prevRef.current = { count: messages.length, lastId: lastMsg?._id ?? null, channelId }
      return
    }

    const hasNewMessage =
      messages.length > prev.count &&
      lastMsg?._id !== prev.lastId

    if (hasNewMessage) {
      // Safely resolve authorId — server populates it as an object, so we
      // must extract ._id before comparing with the plain-string currentUserId
      const authorId = lastMsg?.authorId?._id ?? lastMsg?.authorId
      const isOwnMessage =
        authorId != null &&
        currentUserId != null &&
        String(authorId) === String(currentUserId)

      // Scroll when:
      //   • the user is already near the bottom (normal reading flow), OR
      //   • the message belongs to the current user (they just sent it —
      //     always reveal the message they typed regardless of scroll position)
      if (isAtBottomRef.current || isOwnMessage) {
        setTimeout(() => {
          virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth' })
        }, 30)
      }
    }

    prevRef.current = { count: messages.length, lastId: lastMsg?._id ?? null, channelId }
  }, [messages, channelId, currentUserId])

  // ─── Flatten messages: date separators + unread marker ───────────────
  const isActivityMessage = (msg) =>
    msg.contentType === 'activity' || msg.contentType === 'system' || msg.contentType === 'bot' || !!msg.activityMeta

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

      let separatorJustInserted = false

      if (label !== currentDate) {
        currentDate = label
        flattened.push({ isDateSeparator: true, date: label, _id: `date-${label}` })
        separatorJustInserted = true
      }

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

      const prevMsg = i > 0 && !separatorJustInserted ? messages[i - 1] : null

      const nextMsgRaw = i < messages.length - 1 ? messages[i + 1] : null
      const nextWillHaveSeparator =
        nextMsgRaw &&
        (formatDateLabel(new Date(nextMsgRaw.createdAt)) !== label ||
          (!insertedUnreadMarker && lastReadMessageId && msg._id === lastReadMessageId))
      const nextMsg = nextWillHaveSeparator ? null : nextMsgRaw

      const prevAuthorId = prevMsg?.authorId?._id || prevMsg?.authorId
      const currentAuthorId = msg.authorId?._id || msg.authorId
      const nextAuthorId = nextMsg?.authorId?._id || nextMsg?.authorId

      const sameAsPrev = !!(
        prevMsg &&
        prevAuthorId &&
        currentAuthorId &&
        prevAuthorId.toString() === currentAuthorId.toString() &&
        !isActivityMessage(msg) &&
        !isActivityMessage(prevMsg) &&
        new Date(msg.createdAt) - new Date(prevMsg.createdAt) < 300000
      )

      const sameAsNext = !!(
        nextMsg &&
        nextAuthorId &&
        currentAuthorId &&
        nextAuthorId.toString() === currentAuthorId.toString() &&
        !isActivityMessage(msg) &&
        !isActivityMessage(nextMsg) &&
        new Date(nextMsg.createdAt) - new Date(msg.createdAt) < 300000
      )

      flattened.push({ ...msg, isCompact: sameAsPrev, isLastInGroup: !sameAsNext })
    }

    return flattened
  }, [messages, lastReadMessageId])

  // ─── Scroll to a highlighted / linked message ─────────────────────────
  useEffect(() => {
    if (
      highlightMessageId &&
      highlightMessageId !== lastScrolledHighlightId.current &&
      virtuosoRef.current &&
      flattenedItems.length > 0
    ) {
      const idx = flattenedItems.findIndex((item) => item._id === highlightMessageId)
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

  // ─── Loading / empty states ───────────────────────────────────────────
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

  // ─── Main render ──────────────────────────────────────────────────────
  return (
    <div
      className="flex-1 overflow-hidden relative"
      role="log"
      aria-label="Message list"
      aria-live="polite"
      // FIX: minHeight:0 is critical in a flex-column layout.
      // Without it a flex child can grow beyond the parent and extend behind
      // the message input box that sits below it in the same column.
      style={{ minHeight: 0 }}
    >
      <Virtuoso
        ref={virtuosoRef}
        data={flattenedItems}
        computeItemKey={(index, item) => item._id || index}
        className="w-full h-full"
        firstItemIndex={1000000 - flattenedItems.length}
        initialTopMostItemIndex={flattenedItems.length - 1}
        startReached={loadMore}
        alignToBottom={true}
        increaseViewportBy={{ top: 400, bottom: 200 }}

        // ── followOutput ────────────────────────────────────────────────
        // Called by Virtuoso whenever items are appended.
        // • Return 'smooth' → Virtuoso scrolls for us (receiver path).
        // • Return false    → we don't interrupt user who is reading history.
        // Our separate useEffect handles the sender's own messages and the
        // edge-case where isAtBottom is briefly stale right after a send.
        followOutput={(isAtBottom) => {
          isAtBottomRef.current = isAtBottom
          setShowScrollBtn(!isAtBottom)
          return isAtBottom ? 'smooth' : false
        }}

        // ── atBottomStateChange ─────────────────────────────────────────
        // Keeps isAtBottomRef and the FAB in sync as the user scrolls
        // manually — not just when new items are appended.
        atBottomStateChange={(atBottom) => {
          isAtBottomRef.current = atBottom
          setShowScrollBtn(!atBottom)
        }}

        components={{
          Header: () =>
            isLoadingMessages && messages.length > 0 ? (
              <div style={{ padding: '8px 20px', textAlign: 'center' }}>
                <div
                  className="skeleton"
                  style={{ width: 120, height: 20, margin: '0 auto', borderRadius: 10 }}
                />
              </div>
            ) : null,
          Footer: () => <div style={{ height: 16 }} />,
        }}

        itemContent={(index, item) => {
          if (item.isDateSeparator) {
            return (
              <div
                className="animate-fade-in"
                style={{ display: 'flex', alignItems: 'center', padding: '12px 20px 4px', gap: 12 }}
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
                <AutoActivityMessage message={item} />
              </div>
            )
          }

          if (item.isUnreadSeparator) {
            return (
              <div
                className="animate-fade-in"
                style={{ display: 'flex', alignItems: 'center', padding: '8px 20px 4px', gap: 12 }}
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

      {/* ── Scroll-to-bottom FAB ─────────────────────────────────────── */}
      {showScrollBtn && (
        <button
          aria-label="Scroll to latest message"
          title="Jump to latest"
          onClick={() =>
            virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth' })
          }
          style={{
            position: 'absolute',
            bottom: 16,
            right: 20,
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: 'var(--bg-elevated, var(--bg-secondary))',
            border: '1px solid var(--border-primary)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            zIndex: 10,
          }}
        >
          <ChevronDown size={18} />
        </button>
      )}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

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

// ─── Empty state ──────────────────────────────────────────────────────────────

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
        <p style={{ fontSize: 13 }}>Start the conversation by sending a message below.</p>
      </div>
    </div>
  )
}

// ─── Date label helper ────────────────────────────────────────────────────────

function formatDateLabel(date) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diff = today - messageDay
  const dayMs = 86400000

  if (diff === 0) return 'Today'
  if (diff === dayMs) return 'Yesterday'
  if (diff < dayMs * 7) return date.toLocaleDateString(undefined, { weekday: 'long' })
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}