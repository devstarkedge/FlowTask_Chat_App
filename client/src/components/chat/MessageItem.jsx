import { useState } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import { format } from 'date-fns'
import {
  Smile, MessageSquare, MoreHorizontal, Edit, Trash2, Pin,
  FileText, Download, Image as ImageIcon, File, FileArchive, FileCode,
  Film, Music,
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

export default function MessageItem({ message, compact, onOpenThread, onOpenProfile, onOpenFilePreview }) {
  const { user } = useAuthStore()
  const { addReaction, removeReaction, editMessage, deleteMessage } = useChatStore()
  const [showActions, setShowActions] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [showReactionPicker, setShowReactionPicker] = useState(false)

  const isOwn = message.authorId?._id === user?._id || message.authorId === user?._id
  const isSystem = message.contentType === 'system' && !message.activityMeta
  const authorName = message.authorId?.name || 'FlowTask Bot'
  const authorData = typeof message.authorId === 'object' ? message.authorId : null
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

  return (
    <div
      className="relative group"
      style={{
        background: showActions ? 'var(--bg-hover)' : 'transparent',
        transition: 'background var(--transition-fast)',
      }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowReactionPicker(false) }}
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
                avatar: authorData?.avatar,
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
                  <div
                    key={att._id || idx}
                    className="rounded-lg overflow-hidden cursor-pointer transition-opacity hover:opacity-90"
                    style={{ border: '1px solid var(--border-primary)', maxWidth: 320 }}
                    onClick={() => onOpenFilePreview?.(att, message.attachments)}
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
                    onClick={() => onOpenFilePreview?.(att, message.attachments)}
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
                    onClick={() => onOpenFilePreview?.(att, message.attachments)}
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
                    onClick={() => onOpenFilePreview?.(att, message.attachments)}
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
              {message.reactions.map((reaction) => (
                <button
                  key={reaction.emoji}
                  onClick={() => handleReaction(reaction.emoji)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs cursor-pointer transition-all"
                  style={{
                    background: reaction.users?.includes(user?._id)
                      ? 'rgba(18, 100, 163, 0.3)'
                      : 'var(--bg-hover)',
                    border: `1px solid ${reaction.users?.includes(user?._id) ? 'var(--accent-primary)' : 'var(--border-secondary)'}`,
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
      {showActions && !isEditing && (
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

      {/* Reaction Picker (extended with EmojiPicker) */}
      {showReactionPicker && (
        <div className="absolute -top-3 right-5 z-20" style={{ position: 'absolute' }}>
          <EmojiPicker
            onSelect={(emoji) => handleReaction(emoji)}
            onClose={() => setShowReactionPicker(false)}
            position="top"
          />
        </div>
      )}
    </div>
  )
}

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
