import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useChannelStore } from '../../stores/channelStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { useChatStore } from '../../stores/chatStore'
import { Avatar } from '../chat/MemberAvatarGroup'
import { MessageSquare, Bell, FolderOpen } from 'lucide-react'

export default function HoverPreview({ section, anchorRect, onClose }) {
  const ref = useRef(null)
  const channels = useChannelStore((s) => s.channels)
  const unreads = useChannelStore((s) => s.unreads)
  const { onlineUsers } = useChatStore()

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!ref.current || !anchorRect) return
      const previewRect = ref.current.getBoundingClientRect()
      const buffer = 20
      const inPreview =
        e.clientX >= previewRect.left - buffer &&
        e.clientX <= previewRect.right + buffer &&
        e.clientY >= previewRect.top - buffer &&
        e.clientY <= previewRect.bottom + buffer
      const inAnchor =
        e.clientX >= anchorRect.left - buffer &&
        e.clientX <= anchorRect.right + buffer &&
        e.clientY >= anchorRect.top - buffer &&
        e.clientY <= anchorRect.bottom + buffer
      if (!inPreview && !inAnchor) {
        onClose()
      }
    }
    document.addEventListener('mousemove', handleMouseMove)
    return () => document.removeEventListener('mousemove', handleMouseMove)
  }, [anchorRect, onClose])

  if (!anchorRect) return null

  const top = anchorRect.top
  const left = anchorRect.right + 8

  let content = null

  if (section === 'dms') {
    const dmChannels = channels
      .filter((c) => c.type === 'dm' && !c.isArchived)
      .sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
        return bTime - aTime
      })
      .slice(0, 5)

    content = (
      <>
        <div className="flex items-center gap-2 mb-2 px-1">
          <MessageSquare size={14} style={{ color: 'var(--accent-primary)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-white)' }}>
            Direct Messages
          </span>
        </div>
        {dmChannels.length === 0 ? (
          <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>No recent DMs</p>
        ) : (
          dmChannels.map((ch) => {
            const unread = unreads[ch._id] || 0
            return (
              <div key={ch._id} className="hover-preview-item">
                <Avatar
                  member={{ name: ch.name, avatar: ch.avatar, onlineStatus: onlineUsers?.has?.(ch.dmRecipientId) ? 'online' : 'offline' }}
                  size={28}
                  showStatus={true}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-white)' }}>{ch.name}</p>
                  {ch.lastMessagePreview && (
                    <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{ch.lastMessagePreview}</p>
                  )}
                </div>
                {unread > 0 && <span className="badge badge-red">{unread > 99 ? '99+' : unread}</span>}
              </div>
            )
          })
        )}
      </>
    )
  }

  if (section === 'activity') {
    content = (
      <>
        <div className="flex items-center gap-2 mb-2 px-1">
          <Bell size={14} style={{ color: 'var(--accent-primary)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-white)' }}>
            Activity
          </span>
        </div>
        <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>
          View mentions, reactions, and task updates
        </p>
      </>
    )
  }

  if (section === 'files') {
    content = (
      <>
        <div className="flex items-center gap-2 mb-2 px-1">
          <FolderOpen size={14} style={{ color: 'var(--accent-primary)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-white)' }}>
            Files
          </span>
        </div>
        <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>
          Browse shared files across channels
        </p>
      </>
    )
  }

  if (!content) return null

  if (typeof document === 'undefined' || !document.body) return null

  return createPortal(
    <div
      ref={ref}
      className="hover-preview"
      style={{ top, left }}
      onMouseLeave={onClose}
    >
      {content}
    </div>,
    document.body,
  )
}
