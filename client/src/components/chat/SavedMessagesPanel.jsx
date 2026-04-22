import { useEffect, useState } from 'react'
import { Bookmark, X, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { Avatar } from './MemberAvatarGroup'
import { sanitizeHtml } from '../../utils/sanitize'
import { savedMessageAPI } from '../../services/api'
import toast from 'react-hot-toast'

export default function SavedMessagesPanel({ onClose, onJumpToMessage }) {
  const [savedMessages, setSavedMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [unsavingIds, setUnsavingIds] = useState(new Set())

  useEffect(() => {
    let cancelled = false
    async function fetch() {
      try {
        const { data } = await savedMessageAPI.list()
        if (!cancelled) {
          setSavedMessages(data.data?.messages || (Array.isArray(data.data) ? data.data : []))
        }
      } catch {
        toast.error('Failed to load saved messages')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetch()
    return () => { cancelled = true }
  }, [])

  const handleUnsave = async (messageId) => {
    if (unsavingIds.has(messageId)) return
    setUnsavingIds((prev) => new Set(prev).add(messageId))
    try {
      await savedMessageAPI.toggle(messageId)
      setSavedMessages((prev) => prev.filter((s) => s.messageId?._id !== messageId))
      toast.success('Removed from saved', { duration: 1500 })
    } catch {
      toast.error('Failed to unsave')
    } finally {
      setUnsavingIds((prev) => { const next = new Set(prev); next.delete(messageId); return next })
    }
  }

  return (
    <div className="panel animate-slide-in-right" style={{ width: 380, maxWidth: '100vw' }}>
      {/* Header */}
      <div className="panel-header">
        <Bookmark size={16} style={{ color: 'var(--accent-primary)' }} />
        <h3 className="font-semibold text-sm flex-1" style={{ color: 'var(--text-primary)' }}>
          Saved Messages
        </h3>
        <span
          className="text-xs px-1.5 py-0.5 rounded-full font-medium"
          style={{ background: 'var(--bg-active)', color: 'var(--accent-primary)' }}
        >
          {savedMessages.length}
        </span>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md cursor-pointer transition-colors"
          style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="panel-body">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : savedMessages.length === 0 ? (
          <div className="panel-empty">
            <Bookmark size={32} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
            <p className="text-sm mt-3" style={{ color: 'var(--text-muted)' }}>
              No saved messages yet
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
              Click the bookmark icon on any message to save it here
            </p>
          </div>
        ) : (
          <div className="panel-list">
            {savedMessages.map((saved) => {
              const msg = saved.messageId
              if (!msg) return null
              const author = msg.senderSnapshot || msg.authorId || {}
              return (
                <div
                  key={saved._id}
                  className="panel-item cursor-pointer transition-colors"
                  onClick={() => onJumpToMessage?.({ channelId: msg.channelId, _id: msg._id })}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Avatar
                      member={{ name: author.name || 'Unknown', avatar: author.avatar }}
                      size={20}
                      showStatus={false}
                    />
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-white)' }}>
                      {author.name || 'Unknown'}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {(() => { const d = new Date(msg.createdAt); return isNaN(d.getTime()) ? '' : format(d, 'MMM d, h:mm a') })()}
                    </span>
                    <div className="flex-1" />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleUnsave(msg._id) }}
                      className="p-1 rounded cursor-pointer transition-colors"
                      style={{ color: 'var(--accent-primary)', background: 'transparent', border: 'none' }}
                      title="Remove from saved"
                    >
                      <Bookmark size={13} />
                    </button>
                  </div>
                  {msg.htmlContent ? (
                    <div
                      className="text-[13px] line-clamp-3"
                      style={{ color: 'var(--text-primary)' }}
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.htmlContent) }}
                    />
                  ) : (
                    <p className="text-[13px] line-clamp-3" style={{ color: 'var(--text-primary)' }}>
                      {msg.content || 'Attachment'}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
