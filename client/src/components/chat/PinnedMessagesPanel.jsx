import { useEffect } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import { X, Pin, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { Avatar } from './MemberAvatarGroup'
import { sanitizeHtml } from '../../utils/sanitize'

export default function PinnedMessagesPanel({ channelId, onClose }) {
  const { pinnedMessagesByChannel, fetchPinnedMessages, unpinMessage, isLoadingPins } = useChatStore()
  const user = useAuthStore((s) => s.user)
  const pinnedMessages = pinnedMessagesByChannel[channelId] || []

  useEffect(() => {
    if (channelId) {
      fetchPinnedMessages(channelId)
    }
  }, [channelId, fetchPinnedMessages])

  return (
    <div
      className="flex flex-col border-l shrink-0 animate-slide-in-right"
      style={{
        width: 380,
        maxWidth: '100vw',
        borderColor: 'var(--border-primary)',
        background: 'var(--bg-secondary)',
        height: '100%',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 shrink-0"
        style={{
          height: 'var(--header-height)',
          borderBottom: '1px solid var(--border-primary)',
        }}
      >
        <Pin size={16} style={{ color: 'var(--accent-primary)' }} />
        <h3 className="font-semibold text-sm flex-1" style={{ color: 'var(--text-primary)' }}>
          Pinned Messages
        </h3>
        <span
          className="text-xs px-1.5 py-0.5 rounded-full font-medium"
          style={{
            background: 'var(--bg-active)',
            color: 'var(--accent-primary)',
          }}
        >
          {pinnedMessages.length}
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded-md cursor-pointer transition-colors"
          style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoadingPins ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : pinnedMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
              style={{ background: 'var(--bg-tertiary)' }}
            >
              <Pin size={20} style={{ color: 'var(--text-muted)' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              No pinned messages
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Pin important messages to keep them handy
            </p>
          </div>
        ) : (
          pinnedMessages.map((msg) => {
            const authorName = msg.senderSnapshot?.name || msg.authorId?.name || 'Unknown'
            const authorAvatar = msg.senderSnapshot?.avatar || (typeof msg.authorId === 'object' ? msg.authorId?.avatar : null)
            const createdAt = msg.createdAt ? new Date(msg.createdAt) : null
            const time = createdAt && !Number.isNaN(createdAt.getTime())
              ? format(createdAt, 'MMM d, yyyy · h:mm a')
              : 'Unknown date'

            return (
              <div
                key={msg._id}
                className="rounded-lg p-3 transition-colors group"
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-secondary)',
                }}
              >
                {/* Author row */}
                <div className="flex items-center gap-2 mb-1.5">
                  <Avatar member={{ name: authorName, avatar: authorAvatar }} size={22} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {authorName}
                  </span>
                  <span className="text-[11px] ml-auto" style={{ color: 'var(--text-muted)' }}>
                    {time}
                  </span>
                </div>

                {/* Message content */}
                {msg.htmlContent && msg.htmlContent !== msg.content ? (
                  <div
                    className="message-content text-sm leading-relaxed"
                    style={{ color: 'var(--text-secondary)' }}
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.htmlContent) }}
                  />
                ) : (
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {msg.content}
                  </p>
                )}

                {/* Unpin action */}
                <div className="flex justify-end mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => unpinMessage(msg._id)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer transition-colors"
                    style={{
                      color: 'var(--accent-red)',
                      background: 'transparent',
                      border: '1px solid var(--border-secondary)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Pin size={11} />
                    Unpin
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
