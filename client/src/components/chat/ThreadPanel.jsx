import { useEffect, useRef, useCallback } from 'react'
import { useChatStore } from '../../stores/chatStore'
import MessageItem from './MessageItem'
import MessageInput from './MessageInput'
import { X, MessageSquare } from 'lucide-react'

export default function ThreadPanel({ thread, onClose }) {
  const {
    threadRepliesByRoot,
    threadHasMore,
    isLoadingThread,
    fetchThreadReplies,
    clearThreadReplies,
    messagesByChannel,
  } = useChatStore()

  const replies = threadRepliesByRoot[thread.rootMessageId] || []
  const hasMore = threadHasMore[thread.rootMessageId] ?? false
  const bottomRef = useRef(null)
  const prevReplyCountRef = useRef(replies.length)

  // Fetch thread replies on mount / when rootMessageId changes
  useEffect(() => {
    fetchThreadReplies(thread.rootMessageId)
    return () => {
      // Optional: clear thread replies when closing to save memory
      // clearThreadReplies(thread.rootMessageId)
    }
  }, [thread.rootMessageId, fetchThreadReplies])

  // Auto-scroll to bottom when new replies arrive
  useEffect(() => {
    if (replies.length > prevReplyCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevReplyCountRef.current = replies.length
  }, [replies.length])

  // Load more (older) replies via cursor
  const loadMoreReplies = useCallback(async () => {
    if (!hasMore || isLoadingThread || replies.length === 0) return
    const cursor = replies[replies.length - 1]?._id
    fetchThreadReplies(thread.rootMessageId, { cursor, limit: 30 })
  }, [hasMore, isLoadingThread, replies, thread.rootMessageId, fetchThreadReplies])

  const rootMessage = messagesByChannel[thread.channelId]?.find(
    (m) => m._id === thread.rootMessageId
  )

  const replyCount = replies.filter(r => !r.pending).length

  return (
    <div
      className="flex flex-col h-full animate-slide-in-right"
      style={{
        width: 'var(--thread-panel-width)',
        minWidth: 'var(--thread-panel-width)',
        borderLeft: '1px solid var(--border-primary)',
        background: 'var(--bg-primary)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 shrink-0"
        style={{
          height: 'var(--header-height)',
          borderBottom: '1px solid var(--border-primary)',
        }}
      >
        <div className="flex items-center gap-2">
          <MessageSquare size={16} style={{ color: 'var(--text-white)' }} />
          <span className="font-bold text-sm" style={{ color: 'var(--text-white)' }}>
            Thread
          </span>
          {replyCount > 0 && (
            <span
              className="badge badge-muted"
              style={{ fontSize: 10 }}
            >
              {replyCount}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md cursor-pointer transition-colors"
          style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <X size={16} />
        </button>
      </div>

      {/* Thread Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoadingThread && replies.length === 0 ? (
          <div style={{ padding: '16px 20px' }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0' }} className="animate-fade-in">
                <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 'var(--radius-lg)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                    <div className="skeleton" style={{ width: 90, height: 14 }} />
                    <div className="skeleton" style={{ width: 40, height: 14 }} />
                  </div>
                  <div className="skeleton" style={{ width: '75%', height: 14, marginBottom: 4 }} />
                  <div className="skeleton" style={{ width: '50%', height: 14 }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Root Message — highlighted with accent border */}
            {rootMessage && (
              <div
                style={{
                  borderBottom: '1px solid var(--border-secondary)',
                  borderLeft: '3px solid var(--accent-primary)',
                  padding: '4px 0 8px',
                  marginBottom: 4,
                  background: 'var(--bg-secondary)',
                }}
              >
                <MessageItem message={rootMessage} compact={false} />
              </div>
            )}

            {/* Reply count divider */}
            {replies.length > 0 && (
              <div
                className="animate-fade-in"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 20px',
                  gap: 10,
                }}
              >
                <div style={{ flex: 1, height: 1, background: 'var(--border-secondary)' }} />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text-link)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border-secondary)' }} />
              </div>
            )}

            {/* Replies */}
            {replies.map((reply) => (
              <MessageItem key={reply._id} message={reply} compact={false} />
            ))}

            {/* Load more replies */}
            {hasMore && (
              <div className="text-center py-3">
                <button
                  onClick={loadMoreReplies}
                  disabled={isLoadingThread}
                  className="text-xs cursor-pointer px-4 py-1.5 rounded-md transition-colors"
                  style={{
                    color: 'var(--text-link)',
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--border-secondary)',
                    opacity: isLoadingThread ? 0.5 : 1,
                  }}
                >
                  {isLoadingThread ? 'Loading...' : 'Load more replies'}
                </button>
              </div>
            )}

            {replies.length === 0 && !isLoadingThread && (
              <div className="text-center py-8 animate-fade-in">
                <MessageSquare
                  size={28}
                  style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }}
                />
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  No replies yet. Start the conversation!
                </p>
              </div>
            )}

            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Reply Input */}
      <MessageInput
        channelId={thread.channelId}
        threadId={thread.rootMessageId}
        placeholder="Reply in thread..."
      />
    </div>
  )
}
