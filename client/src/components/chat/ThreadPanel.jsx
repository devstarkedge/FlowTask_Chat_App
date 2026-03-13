import { useEffect, useRef, useCallback } from 'react'
import { useChatStore } from '../../stores/chatStore'
import MessageInput from './MessageInput'
import { X, MessageSquare, SlidersHorizontal, MoreHorizontal } from 'lucide-react'
import { Avatar } from './MemberAvatarGroup'
import { format } from 'date-fns'
import { sanitizeHtml } from '../../utils/sanitize'

/* ─── Thread Message Item ─────────────────────────────────────────────────── */
function ThreadMessage({ message, isRoot = false }) {
  const authorName = message.senderSnapshot?.name || message.authorId?.name || 'FlowTask Bot'
  const authorAvatar =
    message.senderSnapshot?.avatar ||
    (typeof message.authorId === 'object' ? message.authorId?.avatar : null)
  const time = format(new Date(message.createdAt), 'h:mm a')
  const isDeleted = message.isDeleted === true
  const isPending = message.pending === true

  return (
    <div className={`thread-message${isRoot ? ' thread-message--root' : ''}`}>
      <div className="thread-message__avatar">
        <Avatar
          member={{ name: authorName, avatar: authorAvatar, onlineStatus: 'offline' }}
          size={36}
          showStatus={false}
        />
      </div>
      <div className="thread-message__body">
        <div className="thread-message__meta">
          <span className="thread-message__name">{authorName}</span>
          {message.contentType === 'bot' && (
            <span className="thread-message__bot-badge">BOT</span>
          )}
          <span className="thread-message__time">{time}</span>
          {message.isEdited && (
            <span className="thread-message__edited">(edited)</span>
          )}
          {isPending && (
            <span className="thread-message__pending">Sending…</span>
          )}
        </div>

        {isDeleted ? (
          <p className="thread-message__deleted">This message was deleted</p>
        ) : message.htmlContent && message.htmlContent !== message.content ? (
          <div
            className="message-content thread-message__content"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(message.htmlContent) }}
          />
        ) : (
          <p className="thread-message__content">{message.content}</p>
        )}

        {/* Reactions */}
        {message.reactions?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {message.reactions.map((reaction) => {
              const count = reaction.users?.length || reaction.count || 0
              return (
                <span
                  key={reaction.emoji}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                  style={{
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--border-secondary)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {reaction.emoji} {count}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Loading Skeleton ────────────────────────────────────────────────────── */
function ThreadSkeleton() {
  return (
    <div style={{ padding: '12px 16px' }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0' }}>
          <div
            className="skeleton"
            style={{ width: 36, height: 36, borderRadius: 'var(--radius-lg)', flexShrink: 0 }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 7 }}>
              <div className="skeleton" style={{ width: 100, height: 13 }} />
              <div className="skeleton" style={{ width: 50, height: 13 }} />
            </div>
            <div className="skeleton" style={{ width: '78%', height: 13, marginBottom: 5 }} />
            <div className="skeleton" style={{ width: '52%', height: 13 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── Main Panel ──────────────────────────────────────────────────────────── */
export default function ThreadPanel({ thread, onClose }) {
  const {
    threadRepliesByRoot,
    threadHasMore,
    isLoadingThread,
    fetchThreadReplies,
    messagesByChannel,
  } = useChatStore()

  const replies = threadRepliesByRoot[thread.rootMessageId] || []
  const hasMore = threadHasMore[thread.rootMessageId] ?? false
  const bottomRef = useRef(null)
  const prevReplyCountRef = useRef(replies.length)

  useEffect(() => {
    fetchThreadReplies(thread.rootMessageId)
  }, [thread.rootMessageId, fetchThreadReplies])

  useEffect(() => {
    if (replies.length > prevReplyCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevReplyCountRef.current = replies.length
  }, [replies.length])

  const loadMoreReplies = useCallback(async () => {
    if (!hasMore || isLoadingThread || replies.length === 0) return
    const cursor = replies[replies.length - 1]?._id
    fetchThreadReplies(thread.rootMessageId, { cursor, limit: 30 })
  }, [hasMore, isLoadingThread, replies, thread.rootMessageId, fetchThreadReplies])

  const rootMessage = messagesByChannel[thread.channelId]?.find(
    (m) => m._id === thread.rootMessageId,
  )

  const replyCount = replies.filter((r) => !r.pending).length

  return (
    <div className="thread-panel">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="thread-panel__header">
        <div className="thread-panel__header-left">
          <MessageSquare size={15} style={{ color: 'var(--text-secondary)' }} />
          <span className="thread-panel__title">Thread</span>
          {replyCount > 0 && (
            <span className="thread-panel__badge">{replyCount}</span>
          )}
        </div>
        <div className="thread-panel__header-actions">
          <button className="thread-panel__icon-btn" title="Sort / filter">
            <SlidersHorizontal size={15} />
          </button>
          <button className="thread-panel__icon-btn" title="More options">
            <MoreHorizontal size={15} />
          </button>
          <button
            className="thread-panel__icon-btn thread-panel__close-btn"
            onClick={onClose}
            title="Close thread"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── Scrollable Content ─────────────────────────────────────────── */}
      <div className="thread-panel__content">
        {isLoadingThread && replies.length === 0 ? (
          <ThreadSkeleton />
        ) : (
          <>
            {/* Root message */}
            {rootMessage && (
              <div className="thread-panel__root">
                <ThreadMessage message={rootMessage} isRoot />
              </div>
            )}

            {/* Reply count divider */}
            {replyCount > 0 && (
              <div className="thread-panel__divider">
                <div className="thread-panel__divider-line" />
                <span className="thread-panel__divider-text">
                  {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                </span>
                <div className="thread-panel__divider-line" />
              </div>
            )}

            {/* Replies */}
            <div className="thread-panel__replies">
              {replies.map((reply) => (
                <ThreadMessage key={reply._id} message={reply} />
              ))}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center py-3">
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
                  {isLoadingThread ? 'Loading…' : 'Load earlier replies'}
                </button>
              </div>
            )}

            {/* Empty state */}
            {replies.length === 0 && !isLoadingThread && (
              <div className="thread-panel__empty">
                <MessageSquare
                  size={32}
                  style={{ color: 'var(--text-muted)', opacity: 0.45 }}
                />
                <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-secondary)' }}>
                  No replies yet
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Be the first to reply to this thread.
                </p>
              </div>
            )}

            <div ref={bottomRef} style={{ height: 8 }} />
          </>
        )}
      </div>

      {/* ── Reply Composer ─────────────────────────────────────────────── */}
      <div className="thread-panel__composer">
        <MessageInput
          channelId={thread.channelId}
          threadId={thread.rootMessageId}
          placeholder="Reply in thread…"
        />
      </div>
    </div>
  )
}
