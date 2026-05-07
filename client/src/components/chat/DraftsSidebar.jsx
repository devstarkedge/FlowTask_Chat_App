import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDraftStore, getWorkspaceDrafts } from '../../stores/draftStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useChannelStore } from '../../stores/channelStore'
import { useChatStore } from '../../stores/chatStore'
import { getChannelPath, getDMPath } from '../../utils/chatRoutes'
import {
  Trash2,
  Send,
  Search,
  Loader2,
  PencilLine,
  Hash,
  X,
  FileText,
  FileArchive,
  FileCode,
  Music,
  Video,
  File,
} from 'lucide-react'
import toast from 'react-hot-toast'

function formatTimeAgo(date) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function truncatePreview(text, max = 90) {
  if (!text) return ''
  const stripped = text.replace(/<[^>]*>/g, '').trim()
  return stripped.length > max ? `${stripped.slice(0, max)}…` : stripped
}

function getInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}

const AVATAR_COLORS = [
  '#1264a3', '#059669', '#7c3aed', '#ea580c',
  '#0891b2', '#d97706', '#db2777', '#65a30d',
]

function ChannelAvatar({ name, type, size = 38 }) {
  const initials = getInitials(name.replace(/^#/, ''))
  const colorIndex =
    name.split('').reduce((accumulator, character) => accumulator + character.charCodeAt(0), 0) % AVATAR_COLORS.length
  const bg = AVATAR_COLORS[colorIndex]

  return (
    <div
      className={`dsl-avatar${type === 'dm' ? ' dm' : ''}`}
      style={{
        width: size,
        height: size,
        minWidth: size,
        background: bg,
        fontSize: size * 0.35,
      }}
    >
      {type === 'dm' ? (
        initials
      ) : (
        <Hash size={size * 0.42} strokeWidth={2.2} style={{ opacity: 0.9 }} />
      )}
    </div>
  )
}

function SkeletonCard({ delay = 0 }) {
  return (
    <div className="dsl-skeleton-card" style={{ animationDelay: `${delay}ms` }}>
      <div
        className="dsl-skeleton-line"
        style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0 }}
      />
      <div className="dsl-skeleton-body">
        <div className="dsl-skeleton-line" style={{ width: '50%', height: 12 }} />
        <div className="dsl-skeleton-line" style={{ width: '88%', height: 11 }} />
        <div className="dsl-skeleton-line" style={{ width: '65%', height: 11 }} />
      </div>
    </div>
  )
}

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function AttachmentIcon({ mimeType, size = 14 }) {
  if (!mimeType) return <File size={size} />
  if (mimeType.startsWith('audio/')) return <Music size={size} />
  if (mimeType.startsWith('video/')) return <Video size={size} />
  if (mimeType.includes('pdf') || mimeType.includes('word') || mimeType.includes('excel') ||
      mimeType.includes('powerpoint') || mimeType.includes('presentation') ||
      mimeType.includes('spreadsheet')) return <FileText size={size} />
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z') ||
      mimeType.includes('tar') || mimeType.includes('gzip')) return <FileArchive size={size} />
  if (mimeType.startsWith('text/') || mimeType.includes('javascript') ||
      mimeType.includes('typescript') || mimeType.includes('json') ||
      mimeType.includes('xml') || mimeType.includes('yaml')) return <FileCode size={size} />
  return <File size={size} />
}

function DraftAttachmentPreviews({ attachments }) {
  if (!attachments || attachments.length === 0) return null

  const MAX_PREVIEW = 3
  const shown = attachments.slice(0, MAX_PREVIEW)
  const overflow = attachments.length - MAX_PREVIEW

  return (
    <div className="dsl-attachments">
      {shown.map((att, idx) => {
        const isImage = att.mimeType?.startsWith('image/')
        return (
          <div key={att.fileId || idx} className="dsl-attachment-chip" title={att.fileName}>
            {isImage && att.thumbnailUrl ? (
              <img
                src={att.thumbnailUrl}
                alt={att.fileName}
                className="dsl-attachment-thumb"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            ) : (
              <span className="dsl-attachment-icon">
                <AttachmentIcon mimeType={att.mimeType} size={12} />
              </span>
            )}
            <span className="dsl-attachment-name">{att.fileName || 'file'}</span>
            {att.fileSize ? (
              <span className="dsl-attachment-size">{formatFileSize(att.fileSize)}</span>
            ) : null}
          </div>
        )
      })}
      {overflow > 0 && (
        <div className="dsl-attachment-chip dsl-attachment-chip--overflow">
          +{overflow} more
        </div>
      )}
    </div>
  )
}

function DraftCard({ draft, channelName, channelType, onNavigate, onSend, onDelete, sendingId }) {
  const isSending = sendingId === draft._key
  const preview = truncatePreview(draft.text || draft.html)
  const attachments = draft.attachments || []
  const attachmentCount = attachments.length + (draft.fileReferences?.length || 0)

  return (
    <div
      className="dsl-card"
      onClick={() => onNavigate(draft)}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onNavigate(draft)}
      role="button"
      aria-label={`Draft for ${channelName}`}
    >
      <ChannelAvatar name={channelName} type={channelType} size={38} />

      <div className="dsl-body">
        <div className="dsl-top">
          <div className="dsl-channel-wrap">
            <span className="dsl-channel">{channelName}</span>
            {attachmentCount > 0 && (
              <span className="dsl-badge dsl-badge--attach">
                {attachmentCount} file{attachmentCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <span className="dsl-time">{formatTimeAgo(draft.timestamp)}</span>
        </div>

        <p className="dsl-preview">
          {preview || (
            <em style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No text content
            </em>
          )}
        </p>

        {attachments.length > 0 && (
          <DraftAttachmentPreviews attachments={attachments} />
        )}
      </div>

      <div className="dsl-actions" onClick={(e) => e.stopPropagation()}>
        <button
          className="dsl-action-btn dsl-action-btn--send"
          onClick={(e) => onSend(e, draft)}
          disabled={isSending}
          title="Send now"
          aria-label="Send draft"
        >
          {isSending ? <Loader2 size={13} className="dsl-spin" /> : <Send size={13} />}
        </button>
        <button
          className="dsl-action-btn dsl-action-btn--delete"
          onClick={(e) => onDelete(e, draft)}
          title="Delete draft"
          aria-label="Delete draft"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

export default function DraftsSidebar() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const channels = useChannelStore((s) => s.channels)
  const drafts = useDraftStore((s) => s.drafts)
  const clearDraft = useDraftStore((s) => s.clearDraft)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const navigate = useNavigate()

  const [loading, setLoading] = useState(() => !useDraftStore.persist.hasHydrated())
  const [searchQuery, setSearchQuery] = useState('')
  const [sendingId, setSendingId] = useState(null)
  const searchRef = useRef(null)

  useEffect(() => {
    if (useDraftStore.persist.hasHydrated()) {
      setLoading(false)
      return undefined
    }

    const unsubscribe = useDraftStore.persist.onFinishHydration(() => {
      setLoading(false)
    })

    return unsubscribe
  }, [])

  const visibleDrafts = useMemo(
    () => getWorkspaceDrafts(drafts, activeWorkspaceId),
    [activeWorkspaceId, drafts],
  )

  const getChannelInfo = (channelId) => {
    const channel = channels.find((item) => item._id === channelId)
    if (!channel) return { name: 'Unknown', type: 'channel' }

    if (channel.type === 'dm') {
      return {
        name: channel.name || channel.dmRecipientName || channel.recipientName || 'Direct Message',
        type: 'dm',
      }
    }

    return { name: `#${channel.name}`, type: 'channel' }
  }

  const filteredDrafts = searchQuery
    ? visibleDrafts.filter((draft) => {
        const { name } = getChannelInfo(draft.channelId)
        const query = searchQuery.toLowerCase()
        return (draft.text || '').toLowerCase().includes(query) || name.toLowerCase().includes(query)
      })
    : visibleDrafts

  const handleDelete = (e, draft) => {
    e.stopPropagation()
    clearDraft(draft.channelId, draft.workspaceId || activeWorkspaceId, draft.threadId)
    toast.success('Draft deleted')
  }

  const handleSendNow = async (e, draft) => {
    e.stopPropagation()

    const channel = channels.find((item) => item._id === draft.channelId)
    if (!channel) {
      toast.error('Channel not found')
      return
    }

    setSendingId(draft._key)

    try {
      await sendMessage(draft.channelId, draft.text?.trim() || ' ', {
        threadId: draft.threadId || undefined,
        htmlContent: draft.html || undefined,
        mentions: draft.mentions?.length ? draft.mentions : undefined,
        // Prefer explicit fileReferences; fall back to attachment stubs stored in draft
        fileReferences: draft.fileReferences?.length
          ? draft.fileReferences
          : draft.attachments?.length
            ? draft.attachments.map((a) => a.fileId).filter(Boolean)
            : undefined,
      })
      clearDraft(draft.channelId, draft.workspaceId || activeWorkspaceId, draft.threadId)
      toast.success('Draft sent')
    } catch {
      // sendMessage already reports failures
    } finally {
      setSendingId(null)
    }
  }

  const handleNavigate = (draft) => {
    const channel = channels.find((item) => item._id === draft.channelId)
    if (!channel) {
      toast.error('Channel not found')
      return
    }

    navigate(
      channel.type === 'dm'
        ? getDMPath(activeWorkspaceId, draft.channelId)
        : getChannelPath(activeWorkspaceId, draft.channelId),
    )
  }

  return (
    <div className="dsl-root">
      <div className="dsl-header">
        <div className="dsl-search">
          <Search size={13} className="dsl-search-icon" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search drafts..."
            className="dsl-search-input"
            aria-label="Search drafts"
          />
          {searchQuery && (
            <button
              className="dsl-search-clear"
              onClick={() => {
                setSearchQuery('')
                searchRef.current?.focus()
              }}
              aria-label="Clear search"
            >
              <X size={10} strokeWidth={3} />
            </button>
          )}
        </div>
      </div>

      <div className="dsl-scroll">
        {loading ? (
          <>
            <SkeletonCard delay={0} />
            <SkeletonCard delay={80} />
            <SkeletonCard delay={160} />
            <SkeletonCard delay={240} />
          </>
        ) : filteredDrafts.length === 0 ? (
          <div className="dsl-empty">
            <div className="dsl-empty-icon">
              <PencilLine size={28} />
            </div>
            <h3 className="dsl-empty-title">
              {searchQuery ? 'No matching drafts' : 'No drafts yet'}
            </h3>
            <p className="dsl-empty-desc">
              {searchQuery
                ? 'Try a different search term.'
                : 'Start composing a message and it will appear here automatically.'}
            </p>
          </div>
        ) : (
          <>
            <div className="dsl-section-label">
              {searchQuery
                ? `${filteredDrafts.length} result${filteredDrafts.length !== 1 ? 's' : ''}`
                : 'Recent'}
            </div>

            {filteredDrafts.map((draft) => {
              const { name, type } = getChannelInfo(draft.channelId)
              return (
                <DraftCard
                  key={draft._key}
                  draft={draft}
                  channelName={name}
                  channelType={type}
                  onNavigate={handleNavigate}
                  onSend={handleSendNow}
                  onDelete={handleDelete}
                  sendingId={sendingId}
                />
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}