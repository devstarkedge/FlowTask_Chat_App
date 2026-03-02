import { useState, useEffect, useRef, memo } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import { format } from 'date-fns'
import {
  Smile, MessageSquare, MoreHorizontal, Edit, Trash2, Pin,
  FileText, Download, Image as ImageIcon, File, FileArchive, FileCode,
  Film, Music, Check, CheckCheck,
} from 'lucide-react'
import { Avatar } from './MemberAvatarGroup'
import EmojiPicker from './EmojiPicker'

function isImage(mimeType) {
  return mimeType?.startsWith('image/')
}
function isVideo(mimeType) {
  return mimeType?.startsWith('video/')
}
function isAudio(mimeType) {
  return mimeType?.startsWith('audio/')
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++ }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function fileIcon(mimeType) {
  if (mimeType?.startsWith('image/')) return ImageIcon
  if (mimeType?.startsWith('video/')) return Film
  if (mimeType?.startsWith('audio/')) return Music
  if (mimeType?.includes('pdf') || mimeType?.includes('document') || mimeType?.includes('word'))
    return FileText
  if (mimeType?.includes('zip') || mimeType?.includes('rar') || mimeType?.includes('tar') || mimeType?.includes('gzip'))
    return FileArchive
  if (mimeType?.includes('json') || mimeType?.includes('javascript') || mimeType?.includes('xml'))
    return FileCode
  return File
}

const MESSAGE_EDIT_WINDOW_MS = 10 * 60 * 1000 // 10 minutes

const MessageItem = memo(function MessageItem({ message, compact, onOpenThread, onOpenProfile, onOpenFilePreview, isDMChannel }) {
  const { user } = useAuthStore()
  const { addReaction, removeReaction, editMessage, deleteMessage, retryMessage } = useChatStore()
  const [showActions, setShowActions] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const messageRef = useRef(null)

  // Close action bar + reaction picker when clicking outside the message
  useEffect(() => {
    if (!showReactionPicker) return
    const handleClickOutside = (e) => {
      if (messageRef.current && !messageRef.current.contains(e.target)) {
        setShowReactionPicker(false)
        setShowActions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showReactionPicker])

  const isOwn = message.authorId?._id === user?._id || message.authorId === user?._id
  const isSystem = message.contentType === 'system' && !message.activityMeta
  const isPending = message.pending === true
  const isFailed = message.failed === true
  const isDeleted = message.isDeleted === true
  const canEdit = isOwn && !isDeleted && (Date.now() - new Date(message.createdAt).getTime()) < MESSAGE_EDIT_WINDOW_MS
  // Prefer senderSnapshot for display (denormalized), fall back to populated authorId
  const authorName = message.senderSnapshot?.name || message.authorId?.name || 'FlowTask Bot'
  const authorAvatar = message.senderSnapshot?.avatar || (typeof message.authorId === 'object' ? message.authorId?.avatar : null)
  const authorData = typeof message.authorId === 'object' ? message.authorId : { _id: message.authorId, name: authorName, avatar: authorAvatar }
  const time = format(new Date(message.createdAt), 'h:mm a')

  const handleEdit = () => {
    if (editContent.trim() && editContent !== message.content) {
      editMessage(message._id, editContent)
    }
    setIsEditing(false)
  }

  const handleReaction = (emoji) => {
    const existing = message.reactions?.find(
      (r) => r.emoji === emoji && (r.users?.includes(user?._id) || r.userIds?.some(id => id?.toString() === user?._id)),
    )
    if (existing) {
      removeReaction(message._id, emoji)
    } else {
      addReaction(message._id, emoji)
    }
    setShowReactionPicker(false)
  }

  const derivedAttachments = message.fileReferences?.length > 0
    ? message.fileReferences.map(ref => ref.fileId ? { ...ref.fileId, url: ref.fileId.secureUrl || ref.fileId.url } : null).filter(Boolean)
    : message.attachments || []

  // System messages (plain separator style)
  if (isSystem) {
    return (
      <div className="flex items-center gap-3 py-2 px-5 my-1 animate-fade-in">
        <div className="flex-1 h-px" style={{ background: 'var(--border-secondary)' }} />
        <p className="text-xs italic px-2" style={{ color: 'var(--text-muted)' }}>
          {message.content}
        </p>
        <div className="flex-1 h-px" style={{ background: 'var(--border-secondary)' }} />
      </div>
    )
  }

  // Deleted message tombstone
  if (isDeleted) {
    return (
      <div className="relative group" style={{ opacity: 0.6 }}>
        <div className={`flex gap-2.5 px-5 ${compact ? 'py-0.5' : 'pt-2 pb-0.5'}`}>
          {!compact ? (
            <Avatar
              member={{ name: authorName, avatar: authorAvatar, onlineStatus: 'offline' }}
              size={36}
              showStatus={false}
            />
          ) : (
            <div className="w-9 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            {!compact && (
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="font-bold text-sm" style={{ color: 'var(--text-white)' }}>
                  {authorName}
                </span>
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {time}
                </span>
              </div>
            )}
            <p className="text-[15px] italic" style={{ color: 'var(--text-muted)' }}>
              This message was deleted
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Delivery status indicator for DM messages
  const renderDeliveryStatus = () => {
    if (!isDMChannel || !isOwn || isPending || isFailed) return null
    const status = message.status || 'sent'
    if (status === 'seen') {
      return (
        <span title="Seen" className="inline-flex items-center ml-1">
          <CheckCheck size={13} style={{ color: 'var(--accent-primary)' }} />
        </span>
      )
    }
    if (status === 'delivered') {
      return (
        <span title="Delivered" className="inline-flex items-center ml-1">
          <CheckCheck size={13} style={{ color: 'var(--text-muted)' }} />
        </span>
      )
    }
    // sent
    return (
      <span title="Sent" className="inline-flex items-center ml-1">
        <Check size={13} style={{ color: 'var(--text-muted)' }} />
      </span>
    )
  }

  return (
    <div
      ref={messageRef}
      className="relative group"
      style={{
        background: showActions ? 'var(--bg-hover)' : 'transparent',
        transition: 'background var(--transition-fast)',
        opacity: isPending ? 0.6 : isFailed ? 0.5 : 1,
      }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        // Don't close the action bar if the reaction picker is open
        if (!showReactionPicker) {
          setShowActions(false)
        }
      }}
    >
      <div className={`flex gap-2.5 px-5 ${compact ? 'py-0.5' : 'pt-2 pb-0.5'}`}>
        {/* Avatar / Time gutter */}
        {!compact ? (
          <div
            className="cursor-pointer"
            onClick={() => onOpenProfile?.(authorData)}
          >
            <Avatar
              member={{
                name: authorName,
                avatar: authorAvatar,
                onlineStatus: 'offline',
              }}
              size={36}
              showStatus={false}
            />
          </div>
        ) : (
          <div className="w-9 shrink-0 flex items-center justify-center">
            <span
              className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: 'var(--text-muted)' }}
            >
              {format(new Date(message.createdAt), 'h:mm')}
            </span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {!compact && (
            <div className="flex items-baseline gap-2 mb-0.5">
              <span
                className="font-bold text-sm cursor-pointer hover:underline"
                style={{ color: 'var(--text-white)' }}
                onClick={() => onOpenProfile?.(authorData)}
              >
                {authorName}
              </span>
              {message.contentType === 'bot' && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--accent-primary)',
                    color: 'white',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  BOT
                </span>
              )}
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {time}
              </span>
              {message.isEdited && (
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  (edited)
                </span>
              )}
              {message.isPinned && (
                <Pin size={11} style={{ color: 'var(--accent-yellow)' }} />
              )}
              {renderDeliveryStatus()}
            </div>
          )}

          {isEditing ? (
            <div className="mt-1">
              <input
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleEdit()
                  if (e.key === 'Escape') setIsEditing(false)
                }}
                className="input-field"
                style={{ fontSize: 14, padding: '6px 10px' }}
                autoFocus
              />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Enter to save · Escape to cancel
              </p>
            </div>
          ) : message.htmlContent && message.htmlContent !== message.content ? (
            <div
              className="message-content text-[15px] leading-relaxed"
              style={{ color: 'var(--text-primary)' }}
              dangerouslySetInnerHTML={{ __html: message.htmlContent }}
            />
          ) : (
            <div
              className="message-content text-[15px] leading-relaxed"
              style={{ color: 'var(--text-primary)' }}
            >
              {message.content}
            </div>
          )}

          {/* Failed message indicator */}
          {isFailed && (
            <div className="flex items-center gap-2 mt-1">
              <span style={{ fontSize: 12, color: 'var(--accent-red)' }}>Failed to send</span>
              <button
                onClick={() => retryMessage(message._id, message.channelId)}
                className="text-xs cursor-pointer px-2 py-0.5 rounded"
                style={{
                  color: 'var(--text-link)',
                  background: 'transparent',
                  border: '1px solid var(--border-secondary)',
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Pending indicator */}
          {isPending && !isFailed && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'inline-block' }}>Sending...</span>
          )}

          {/* Attachments */}
          {derivedAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {derivedAttachments.map((att, idx) =>
                isImage(att.mimeType) ? (
                  <div
                    key={att._id || idx}
                    className="rounded-lg overflow-hidden cursor-pointer transition-opacity hover:opacity-90"
                    style={{ border: '1px solid var(--border-primary)', maxWidth: 320 }}
                    onClick={() => onOpenFilePreview?.(att, derivedAttachments)}
                  >
                    <img
                      src={att.thumbnailUrl || att.url}
                      alt={att.originalName}
                      className="max-h-60 object-cover"
                      loading="lazy"
                    />
                    <div
                      className="flex items-center gap-2 px-2 py-1 text-xs"
                      style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
                    >
                      <span className="truncate flex-1">{att.originalName}</span>
                      <span>{formatFileSize(att.fileSize)}</span>
                    </div>
                  </div>
                ) : isVideo(att.mimeType) ? (
                  <div
                    key={att._id || idx}
                    className="file-card"
                    onClick={() => onOpenFilePreview?.(att, derivedAttachments)}
                  >
                    <Film size={24} style={{ color: 'var(--accent-purple)', flexShrink: 0 }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{att.originalName}</p>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{formatFileSize(att.fileSize)}</p>
                    </div>
                    <Download size={14} style={{ color: 'var(--text-muted)' }} />
                  </div>
                ) : isAudio(att.mimeType) ? (
                  <div
                    key={att._id || idx}
                    className="file-card"
                    onClick={() => onOpenFilePreview?.(att, derivedAttachments)}
                  >
                    <Music size={24} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{att.originalName}</p>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{formatFileSize(att.fileSize)}</p>
                    </div>
                    <Download size={14} style={{ color: 'var(--text-muted)' }} />
                  </div>
                ) : (
                  <div
                    key={att._id || idx}
                    className="file-card"
                    onClick={() => onOpenFilePreview?.(att, derivedAttachments)}
                  >
                    {(() => { const FIcon = fileIcon(att.mimeType); return <FIcon size={24} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} /> })()}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{att.originalName}</p>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{formatFileSize(att.fileSize)}</p>
                    </div>
                    <Download size={14} style={{ color: 'var(--text-muted)' }} />
                  </div>
                ),
              )}
            </div>
          )}

          {/* Reactions */}
          {message.reactions?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {message.reactions.map((reaction) => {
                const hasReacted = reaction.users?.includes(user?._id) || reaction.userIds?.some(id => id?.toString() === user?._id)
                return (
                <button
                  key={reaction.emoji}
                  onClick={() => handleReaction(reaction.emoji)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs cursor-pointer transition-all"
                  style={{
                    background: hasReacted
                      ? 'rgba(18, 100, 163, 0.3)'
                      : 'var(--bg-hover)',
                    border: `1px solid ${hasReacted ? 'var(--accent-primary)' : 'var(--border-secondary)'}`,
                    color: 'var(--text-primary)',
                  }}
                >
                  {reaction.emoji} {reaction.users?.length || reaction.count || 0}
                </button>
                )
              })}
            </div>
          )}

          {/* Thread link */}
          {message.replyCount > 0 && (
            <button
              onClick={() => onOpenThread?.({ rootMessageId: message._id, channelId: message.channelId })}
              className="flex items-center gap-1.5 mt-1.5 text-xs cursor-pointer py-1 px-2 rounded-md transition-colors"
              style={{ color: 'var(--text-link)', background: 'transparent', border: 'none' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <MessageSquare size={13} />
              <span className="font-medium">
                {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Action Bar (hover) */}
      {(showActions || showReactionPicker) && !isEditing && !isPending && !isFailed && (
        <div
          className="absolute -top-3.5 right-5 flex items-center gap-0.5 px-1 py-0.5 rounded-lg z-10 animate-fade-in-scale"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <ActionButton
            icon={Smile}
            title="Add reaction"
            onClick={() => setShowReactionPicker(!showReactionPicker)}
          />
          <ActionButton
            icon={MessageSquare}
            title="Reply in thread"
            onClick={() => onOpenThread?.({ rootMessageId: message._id, channelId: message.channelId })}
          />
          {isOwn && (
            <>
              <div style={{ width: 1, height: 16, background: 'var(--border-secondary)', margin: '0 2px' }} />
              {canEdit && (
                <ActionButton
                  icon={Edit}
                  title="Edit"
                  onClick={() => { setEditContent(message.content); setIsEditing(true) }}
                />
              )}
              <ActionButton
                icon={Trash2}
                title="Delete"
                danger
                onClick={() => deleteMessage(message._id, message.channelId)}
              />
            </>
          )}
        </div>
      )}

      {/* Reaction Picker (extended with EmojiPicker) */}
      {showReactionPicker && (
        <div className="absolute -top-3 right-5 z-20" style={{ position: 'absolute' }}>
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
}, (prev, next) => {
  return prev.message._id === next.message._id
    && prev.message.content === next.message.content
    && prev.message.reactions === next.message.reactions
    && prev.message.isEdited === next.message.isEdited
    && prev.message.isPinned === next.message.isPinned
    && prev.message.isDeleted === next.message.isDeleted
    && prev.message.status === next.message.status
    && prev.message.replyCount === next.message.replyCount
    && prev.message.pending === next.message.pending
    && prev.message.failed === next.message.failed
    && prev.compact === next.compact
    && prev.isDMChannel === next.isDMChannel
})

export default MessageItem

function ActionButton({ icon: Icon, title, onClick, danger }) {
  return (
    <button
      className="p-1.5 rounded-md cursor-pointer transition-colors"
      style={{ color: danger ? 'var(--accent-red)' : 'var(--text-muted)', background: 'transparent', border: 'none' }}
      onClick={onClick}
      title={title}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <Icon size={15} />
    </button>
  )
}
