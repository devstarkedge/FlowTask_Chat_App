import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import { useLaterStore } from '../../stores/laterStore'
import MessageInput from './MessageInput'
import {
  X, MessageSquare, Download,
  Smile, Edit, Trash2, Copy, Bookmark,
  BookmarkCheck, Forward, Link2, MoreVertical, Pin,
} from 'lucide-react'
import { Avatar } from './MemberAvatarGroup'
import { format } from 'date-fns'
import { sanitizeHtml } from '../../utils/sanitize'
import { CHAT_FEATURE_FLAGS } from '../../config/featureFlags'
import SlackFileCard from './SlackFileCard'
import { handleDownload } from '../../utils/handleDownload'
import { openPreview } from '../../services/previewService'
import EmojiPicker from './EmojiPicker'
import toast from 'react-hot-toast'
import { useDeleteConfirm } from '../../hooks/useDeleteConfirm'

const EMPTY_LIST = []
const MESSAGE_EDIT_WINDOW_MS = 10 * 60 * 1000 // 10 minutes

/* ─── ActionButton (identical to MessageItem's) ───────────────────────────── */
function ActionButton({ icon: Icon, title, onClick, danger, color, size = 15 }) {
  const [ripple, setRipple] = useState(null)
  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, id: Date.now() })
    setTimeout(() => setRipple(null), 500)
    onClick?.(e)
  }
  return (
    <button
      className={`ab-btn ${danger ? 'danger' : 'normal'}`}
      onClick={handleClick}
      title={title}
      aria-label={title}
      style={{ color: color || (danger ? 'var(--accent-red, #e5534b)' : 'var(--text-secondary)') }}
    >
      {ripple && (
        <span
          key={ripple.id}
          className="ab-ripple-circle"
          style={{
            left: ripple.x - 12,
            top: ripple.y - 12,
            background: danger
              ? 'color-mix(in srgb, var(--accent-red, #e5534b) 40%, transparent)'
              : 'color-mix(in srgb, var(--text-secondary) 30%, transparent)',
          }}
        />
      )}
      <span className="ab-icon-wrap">
        <Icon size={size} strokeWidth={1.75} />
      </span>
    </button>
  )
}

/* ─── MoreMenuItem ─────────────────────────────────────────────────────────── */
function MoreMenuItem({ icon: Icon, label, onClick, danger }) {
  return (
    <>
      <style>{`
        @keyframes mmi-slide-in { 0%{opacity:0;transform:translateX(-6px)} 100%{opacity:1;transform:translateX(0)} }
        @keyframes mmi-icon-nudge { 0%{transform:translateX(0)} 40%{transform:translateX(3px)} 100%{transform:translateX(0)} }
        .mmi-btn{display:flex;align-items:center;gap:9px;padding:6px 12px;font-size:13px;font-family:inherit;cursor:pointer;background:transparent;border:none;text-align:left;border-radius:6px;margin:1px 4px;width:calc(100% - 8px);transition:background 110ms ease,color 110ms ease,transform 100ms ease;animation:mmi-slide-in 160ms ease both;position:relative;overflow:hidden}
        .mmi-btn:hover{transform:translateX(2px)}
        .mmi-btn:hover .mmi-icon{animation:mmi-icon-nudge 220ms ease forwards}
        .mmi-btn:active{transform:scale(0.98) translateX(1px)}
        .mmi-btn.danger:hover{background:color-mix(in srgb,var(--accent-red,#e5534b) 10%,transparent);color:var(--accent-red,#e5534b)!important}
        .mmi-btn.normal:hover{background:var(--bg-hover)}
        .mmi-label{letter-spacing:-0.01em;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .mmi-icon{flex-shrink:0;transition:opacity 110ms ease}
      `}</style>
      <button
        className={`mmi-btn ${danger ? 'danger' : 'normal'}`}
        onClick={onClick}
        style={{ color: danger ? 'var(--accent-red, #e5534b)' : 'var(--text-primary)' }}
      >
        <span className="mmi-icon" style={{ opacity: danger ? 0.85 : 0.65 }}>
          <Icon size={14} strokeWidth={1.75} />
        </span>
        <span className="mmi-label">{label}</span>
      </button>
    </>
  )
}

/* ─── Thread Message Item ─────────────────────────────────────────────────── */
function ThreadMessage({ message, isRoot = false }) {
  const { user } = useAuthStore()
  const {
    addReaction, removeReaction,
    editThreadReply, deleteThreadReply,
    pinMessage, unpinMessage,
  } = useChatStore()
  const { toggleSaveMessage } = useLaterStore()
  const isSaved = useLaterStore((s) => s.savedMessageIds.has(message._id))
  const { confirm } = useDeleteConfirm()

  const [showActions, setShowActions] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)

  const containerRef = useRef(null)
  const moreMenuRef = useRef(null)

  const authorName = message.senderSnapshot?.name || message.authorId?.name || 'FlowTask Bot'
  const authorAvatar =
    message.senderSnapshot?.avatar ||
    (typeof message.authorId === 'object' ? message.authorId?.avatar : null)
  const time = format(new Date(message.createdAt), 'h:mm a')
  const isDeleted = message.isDeleted === true
  const isPending = message.pending === true
  const isFailed = message.failed === true

  const isOwn = message.authorId?._id === user?._id || message.authorId === user?._id
  const canEdit =
    isOwn &&
    !isDeleted &&
    !isRoot && // Root message edits go through main channel; suppress in thread view
    Date.now() - new Date(message.createdAt).getTime() < MESSAGE_EDIT_WINDOW_MS

  // Derive attachments — same logic as MessageItem
  const derivedAttachments =
    message.fileReferences?.length > 0
      ? message.fileReferences
          .map((ref) =>
            ref.fileId
              ? { ...ref.fileId, url: ref.fileId.secureUrl || ref.fileId.url }
              : null,
          )
          .filter(Boolean)
      : message.attachments || []

  // Close reaction picker on outside click / Escape
  useEffect(() => {
    if (!showReactionPicker) return
    const onDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowReactionPicker(false)
        setShowActions(false)
      }
    }
    const onKey = (e) => {
      if (e.key === 'Escape') { setShowReactionPicker(false); setShowActions(false) }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showReactionPicker])

  // Close more-menu on outside click / Escape
  useEffect(() => {
    if (!showMoreMenu) return
    const onDown = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setShowMoreMenu(false)
        setShowActions(false)
      }
    }
    const onKey = (e) => {
      if (e.key === 'Escape') { setShowMoreMenu(false); setShowActions(false) }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showMoreMenu])

  const handleEdit = () => {
    if (editContent.trim() && editContent !== message.content)
      editThreadReply(message._id, editContent)
    setIsEditing(false)
  }

  const handleReaction = (emoji) => {
    const existing = message.reactions?.find(
      (r) =>
        r.emoji === emoji &&
        (r.users?.includes(user?._id) ||
          r.userIds?.some((id) => id?.toString() === user?._id)),
    )
    if (existing) removeReaction(message._id, emoji)
    else addReaction(message._id, emoji)
    setShowReactionPicker(false)
  }

  const handleCopyText = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(message.content || '')
      } else {
        const ta = document.createElement('textarea')
        ta.value = message.content || ''
        ta.style.cssText = 'position:fixed;opacity:0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      toast.success('Copied to clipboard', { duration: 1500 })
    } catch {
      toast.error('Copy failed')
    }
    setShowMoreMenu(false)
    setShowActions(false)
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/chat/${message.channelId}/${message._id}`,
      )
      toast.success('Link copied', { duration: 1500 })
    } catch {
      toast.error('Failed to copy link')
    }
    setShowMoreMenu(false)
    setShowActions(false)
  }

  // Action bar visibility: show if hovered OR a sub-menu is open
  const actionBarVisible =
    (showActions || showReactionPicker || showMoreMenu) &&
    !isDeleted &&
    !isEditing &&
    !isPending &&
    !isFailed

  return (
    <div
      ref={containerRef}
      className={`thread-message thread-message--interactive${isRoot ? ' thread-message--root' : ''}`}
      style={{ background: showActions ? 'var(--bg-hover)' : 'transparent' }}
      onMouseEnter={() => { if (!isDeleted && !isRoot) setShowActions(true) }}
      onMouseLeave={() => { if (!showReactionPicker && !showMoreMenu) setShowActions(false) }}
    >
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
        ) : isEditing ? (
          <div style={{ marginTop: 4 }}>
            <input
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleEdit()
                if (e.key === 'Escape') setIsEditing(false)
              }}
              className="input-field"
              style={{ fontSize: 14, padding: '6px 10px', width: '100%' }}
              autoFocus
            />
            <p style={{ fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
              Enter to save · Escape to cancel
            </p>
          </div>
        ) : message.htmlContent && message.htmlContent !== message.content ? (
          <div
            className="message-content thread-message__content"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(message.htmlContent) }}
          />
        ) : (
          <p className="thread-message__content">{message.content}</p>
        )}

        {/* Attachments */}
        {!isDeleted && derivedAttachments.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {derivedAttachments.length > 1 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)',
                opacity: 0.85,
              }}>
                <span>{derivedAttachments.length} files</span>
                <span style={{ opacity: 0.4 }}>|</span>
                <button
                  type="button"
                  onClick={() => derivedAttachments.forEach((file) => handleDownload(file))}
                  disabled={derivedAttachments.length === 0}
                  aria-label="Download all attachments"
                  style={{
                    cursor: derivedAttachments.length === 0 ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'transparent', border: 'none', padding: 0,
                    color: 'inherit'
                  }}
                >
                  <Download size={12} style={{ opacity: 0.7 }} /> Download all
                </button>
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {derivedAttachments.map((att, idx) => (
                <SlackFileCard
                  key={att._id || att.referenceId || idx}
                  file={att}
                  onOpen={(f) => openPreview(f, derivedAttachments)}
                  onDownload={handleDownload}
                  isSingle={derivedAttachments.length === 1}
                />
              ))}
            </div>
          </div>
        )}

        {/* Reactions */}
        {message.reactions?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {message.reactions.map((reaction) => {
              const hasReacted =
                reaction.users?.includes(user?._id) ||
                reaction.userIds?.some((id) => id?.toString() === user?._id)
              const count = reaction.users?.length || reaction.count || 0
              return (
                <button
                  key={reaction.emoji}
                  onClick={() => handleReaction(reaction.emoji)}
                  title={`${reaction.emoji} ${count}`}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs cursor-pointer transition-all"
                  style={{
                    background: hasReacted
                      ? 'color-mix(in srgb, var(--accent-color) 22%, transparent)'
                      : 'var(--bg-hover)',
                    border: `1px solid ${hasReacted ? 'var(--accent-primary)' : 'var(--border-secondary)'}`,
                    color: 'var(--text-primary)',
                  }}
                >
                  {reaction.emoji} {count}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Action bar (appears on hover, top-right of message) ─────────────── */}
      {actionBarVisible && (
        <div
          className="thread-msg-actions animate-fade-in-scale"
          style={{
            position: 'absolute',
            top: -14,
            right: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            borderRadius: 8,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            boxShadow: 'var(--shadow-md, 0 4px 16px rgba(0,0,0,0.22))',
            zIndex: 20,
          }}
        >
          <ActionButton
            icon={Smile}
            title="Add reaction"
            onClick={() => setShowReactionPicker(!showReactionPicker)}
          />
          <ActionButton
            icon={isSaved ? BookmarkCheck : Bookmark}
            title={isSaved ? 'Unsave message' : 'Save for later'}
            color={isSaved ? 'var(--accent-primary)' : undefined}
            onClick={(e) => {
              e.preventDefault()
              toggleSaveMessage(message._id)
              setShowActions(false)
            }}
          />
          {isOwn && (
            <>
              {canEdit && (
                <ActionButton
                  icon={Edit}
                  title="Edit message"
                  onClick={() => {
                    setEditContent(message.content)
                    setIsEditing(true)
                  }}
                />
              )}
              <ActionButton
                icon={Trash2}
                title="Delete message"
                danger
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Delete reply',
                    message: 'This reply will be permanently removed.',
                  })
                  if (ok) deleteThreadReply(message._id)
                }}
              />
            </>
          )}
          <ActionButton
            icon={MoreVertical}
            title="More actions"
            onClick={() => setShowMoreMenu(!showMoreMenu)}
          />
        </div>
      )}

      {/* ── More menu dropdown ───────────────────────────────────────────────── */}
      {showMoreMenu && (
        <div
          ref={moreMenuRef}
          style={{
            position: 'absolute',
            top: -40,
            right: 48,
            zIndex: 30,
            width: 192,
            borderRadius: 8,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            boxShadow: 'var(--shadow-md, 0 4px 16px rgba(0,0,0,0.28))',
            padding: '4px 0',
          }}
        >
          {!isRoot && (
            <MoreMenuItem
              icon={Pin}
              label={message.isPinned ? 'Unpin message' : 'Pin message'}
              onClick={() => {
                message.isPinned ? unpinMessage(message._id) : pinMessage(message._id)
                setShowMoreMenu(false)
                setShowActions(false)
              }}
            />
          )}
          <MoreMenuItem
            icon={Copy}
            label="Copy text"
            onClick={handleCopyText}
          />
          <MoreMenuItem
            icon={Link2}
            label="Copy link"
            onClick={handleCopyLink}
          />
          <MoreMenuItem
            icon={Forward}
            label="Forward message"
            onClick={() => {
              toast.success('Forwarding not yet implemented!')
              setShowMoreMenu(false)
              setShowActions(false)
            }}
          />
        </div>
      )}

      {/* ── Emoji Reaction Picker ────────────────────────────────────────────── */}
      {showReactionPicker && (
        <div style={{ position: 'absolute', top: -2, right: 12, zIndex: 30 }}>
          <EmojiPicker
            onSelect={(emoji) => {
              handleReaction(emoji)
              setShowActions(false)
            }}
            onClose={() => {
              setShowReactionPicker(false)
              setShowActions(false)
            }}
            position="top"
          />
        </div>
      )}
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
  const fetchThreadReplies = useChatStore((s) => s.fetchThreadReplies)
  const isLoadingThread = useChatStore((s) => s.isLoadingThread)
  const legacyReplies = useChatStore((s) => s.threadRepliesByRoot[thread.rootMessageId] || EMPTY_LIST)
  const threadReplyIds = useChatStore((s) => s.threadReplyIdsByRoot[thread.rootMessageId] || EMPTY_LIST)
  const threadRepliesById = useChatStore((s) => s.threadRepliesById)
  const threadHasMore = useChatStore((s) => s.threadHasMore[thread.rootMessageId] ?? false)
  const channelMessages = useChatStore((s) => s.messagesByChannel[thread.channelId] || EMPTY_LIST)
  const messagesById = useChatStore((s) => s.messagesById)

  const replies = useMemo(() => {
    if (!CHAT_FEATURE_FLAGS.normalizedMessageStore) return legacyReplies
    if (!threadReplyIds.length) return EMPTY_LIST
    return threadReplyIds
      .map((id) => threadRepliesById[id])
      .filter(Boolean)
  }, [legacyReplies, threadReplyIds, threadRepliesById])

  const hasMore = threadHasMore

  const rootMessage = useMemo(() => {
    if (CHAT_FEATURE_FLAGS.normalizedMessageStore) {
      return messagesById[thread.rootMessageId] || null
    }
    return channelMessages.find((m) => m._id === thread.rootMessageId) || null
  }, [messagesById, thread.rootMessageId, channelMessages])

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
