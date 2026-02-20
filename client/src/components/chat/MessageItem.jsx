import { useState } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import { format } from 'date-fns'
import {
  Smile, MessageSquare, MoreHorizontal, Edit, Trash2, Pin,
  FileText, Download, Image as ImageIcon, File, FileArchive, FileCode,
} from 'lucide-react'
import { Avatar } from './MemberAvatarGroup'

/* ── Attachment helpers ───────────────────────────────────────────────── */
function isImage(mimeType) {
  return mimeType?.startsWith('image/')
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
  if (mimeType?.includes('pdf') || mimeType?.includes('document') || mimeType?.includes('word'))
    return FileText
  if (mimeType?.includes('zip') || mimeType?.includes('rar') || mimeType?.includes('tar') || mimeType?.includes('gzip'))
    return FileArchive
  if (mimeType?.includes('json') || mimeType?.includes('javascript') || mimeType?.includes('xml') || mimeType?.includes('yaml'))
    return FileCode
  return File
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '🚀']

export default function MessageItem({ message, isGrouped, onOpenThread }) {
  const { user } = useAuthStore()
  const { addReaction, removeReaction, editMessage, deleteMessage } = useChatStore()
  const [showActions, setShowActions] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [showReactionPicker, setShowReactionPicker] = useState(false)

  const isOwn = message.authorId?._id === user?._id || message.authorId === user?._id
  const isSystem = message.contentType === 'system' || !message.authorId
  const authorName = message.authorId?.name || 'FlowTask Bot'
  const time = format(new Date(message.createdAt), 'h:mm a')

  const handleEdit = () => {
    if (editContent.trim() && editContent !== message.content) {
      editMessage(message._id, editContent)
    }
    setIsEditing(false)
  }

  const handleReaction = (emoji) => {
    const existing = message.reactions?.find(
      (r) => r.emoji === emoji && r.users?.includes(user?._id),
    )
    if (existing) {
      removeReaction(message._id, emoji)
    } else {
      addReaction(message._id, emoji)
    }
    setShowReactionPicker(false)
  }

  // System messages
  if (isSystem) {
    return (
      <div className="flex items-center gap-3 py-2 px-5 my-1">
        <div className="flex-1 h-px" style={{ background: 'var(--border-secondary)' }} />
        <p className="text-xs italic px-2" style={{ color: 'var(--text-muted)' }}>
          {message.content}
        </p>
        <div className="flex-1 h-px" style={{ background: 'var(--border-secondary)' }} />
      </div>
    )
  }

  return (
    <div
      className="relative group"
      style={{ background: showActions ? 'var(--bg-hover)' : 'transparent' }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowReactionPicker(false) }}
    >
      <div className={`flex gap-2.5 px-5 ${isGrouped ? 'py-0.5' : 'pt-2 pb-0.5'}`}>
        {/* Avatar */}
        {!isGrouped ? (
          <Avatar
            member={{
              name: authorName,
              avatar: message.authorId?.avatar,
              onlineStatus: 'offline',
            }}
            size={36}
            showStatus={false}
          />
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
          {!isGrouped && (
            <div className="flex items-baseline gap-2 mb-0.5">
              <span
                className="font-bold text-sm cursor-pointer hover:underline"
                style={{ color: 'var(--text-white)' }}
              >
                {authorName}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {time}
              </span>
              {message.isEdited && (
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  (edited)
                </span>
              )}
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
                className="w-full px-3 py-1.5 rounded-md text-sm outline-none"
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--accent-primary)',
                  color: 'var(--text-primary)',
                }}
                autoFocus
              />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Enter to save · Escape to cancel
              </p>
            </div>
          ) : (
            <div
              className="message-content text-[15px] leading-relaxed"
              style={{ color: 'var(--text-primary)' }}
            >
              {message.content}
            </div>
          )}

          {/* Attachments */}
          {message.attachments?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {message.attachments.map((att, idx) =>
                isImage(att.mimeType) ? (
                  <a
                    key={att._id || idx}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg overflow-hidden border transition-opacity hover:opacity-90"
                    style={{ border: '1px solid var(--border-primary)', maxWidth: 320 }}
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
                  </a>
                ) : (
                  <a
                    key={att._id || idx}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={att.originalName}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors"
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-primary)',
                      color: 'var(--text-primary)',
                      minWidth: 200,
                      maxWidth: 320,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                  >
                    {(() => { const FIcon = fileIcon(att.mimeType); return <FIcon size={28} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} /> })()}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{att.originalName}</p>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {formatFileSize(att.fileSize)}
                      </p>
                    </div>
                    <Download size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  </a>
                ),
              )}
            </div>
          )}

          {/* Reactions */}
          {message.reactions?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {message.reactions.map((reaction) => (
                <button
                  key={reaction.emoji}
                  onClick={() => handleReaction(reaction.emoji)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs cursor-pointer transition-colors"
                  style={{
                    background: reaction.users?.includes(user?._id)
                      ? 'rgba(18, 100, 163, 0.3)'
                      : 'var(--bg-hover)',
                    border: `1px solid ${reaction.users?.includes(user?._id) ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                    color: 'var(--text-primary)',
                  }}
                >
                  {reaction.emoji} {reaction.users?.length || 0}
                </button>
              ))}
            </div>
          )}

          {/* Thread link */}
          {message.replyCount > 0 && (
            <button
              onClick={() => onOpenThread?.({ rootMessageId: message._id, channelId: message.channelId })}
              className="flex items-center gap-1.5 mt-1.5 text-xs cursor-pointer hover:underline py-1 px-2 rounded-md transition-colors"
              style={{
                color: 'var(--text-link)',
                background: 'transparent',
              }}
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
      {showActions && !isEditing && (
        <div
          className="absolute -top-3.5 right-5 flex items-center gap-0.5 px-1 py-0.5 rounded-lg shadow-lg z-10"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
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
            <ActionButton
              icon={Edit}
              title="Edit"
              onClick={() => { setEditContent(message.content); setIsEditing(true) }}
            />
          )}
          {isOwn && (
            <ActionButton
              icon={Trash2}
              title="Delete"
              danger
              onClick={() => deleteMessage(message._id, message.channelId)}
            />
          )}
        </div>
      )}

      {/* Reaction Picker */}
      {showReactionPicker && (
        <div
          className="absolute -top-11 right-5 flex gap-1 px-2 py-1.5 rounded-lg shadow-lg z-20"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
          }}
        >
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleReaction(emoji)}
              className="text-lg p-1 rounded hover:scale-125 transition-transform cursor-pointer"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ActionButton({ icon: Icon, title, onClick, danger }) {
  return (
    <button
      className="p-1.5 rounded-md cursor-pointer transition-colors"
      style={{ color: danger ? 'var(--accent-red)' : 'var(--text-muted)' }}
      onClick={onClick}
      title={title}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <Icon size={15} />
    </button>
  )
}
