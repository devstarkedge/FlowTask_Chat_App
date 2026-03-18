import { useEffect, useCallback, useRef } from 'react'
import { useNotificationStore } from '../../stores/notificationStore'
import { useChannelStore } from '../../stores/channelStore'
import { useAuthStore } from '../../stores/authStore'
import {
  X, Bell, AtSign, MessageCircle, UserPlus, ClipboardList, Info,
  MessageSquareText, CheckCheck, Loader2,
} from 'lucide-react'
import { Avatar } from '../chat/MemberAvatarGroup'
import { formatDistanceToNowStrict } from 'date-fns'

const NOTIFICATION_ICONS = {
  mention: { icon: AtSign, color: 'var(--accent-primary)' },
  dm: { icon: MessageCircle, color: 'var(--accent-green)' },
  channel_invite: { icon: UserPlus, color: 'var(--accent-purple)' },
  task_update: { icon: ClipboardList, color: 'var(--accent-yellow)' },
  thread_reply: { icon: MessageSquareText, color: 'var(--accent-blue)' },
  system: { icon: Info, color: 'var(--text-muted)' },
}

export default function NotificationPanel({ onClose }) {
  const {
    notifications, unreadCount, isLoading, hasMore,
    fetchNotifications, fetchUnreadCount, markAsRead, markAllAsRead,
  } = useNotificationStore()
  const { setActiveChannel } = useChannelStore()
  const { user } = useAuthStore()
  const scrollRef = useRef(null)

  useEffect(() => {
    fetchNotifications(true)
    fetchUnreadCount()
  }, [fetchNotifications, fetchUnreadCount])

  // Infinite scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || isLoading || !hasMore) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
      fetchNotifications(false)
    }
  }, [isLoading, hasMore, fetchNotifications])

  const handleNotificationClick = (notification) => {
    if (!notification.isRead) {
      markAsRead(notification._id)
    }
    // Navigate to source
    if (notification.channelId) {
      setActiveChannel(notification.channelId._id || notification.channelId)
    }
    onClose?.()
  }

  const getNotificationText = (n) => {
    const senderName = n.senderName || n.senderId?.name || 'Someone'
    const channelName = getChannelName(n) || n.channelName

    switch (n.type) {
      case 'mention':
        return <span><strong>{senderName}</strong> mentioned you{channelName ? <span> in <strong>#{channelName}</strong></span> : ''}</span>
      case 'dm':
        return <span>New message from <strong>{senderName}</strong></span>
      case 'channel_invite':
        return <span><strong>{senderName}</strong> added you to <strong>#{channelName}</strong></span>
      case 'task_update':
        return <span>Task update from <strong>{senderName}</strong></span>
      case 'thread_reply':
        return <span><strong>{senderName}</strong> replied in a thread{channelName ? <span> in <strong>#{channelName}</strong></span> : ''}</span>
      case 'system':
        return <span>{n.title || 'System notification'}</span>
      default:
        return <span>{n.title || 'New notification'}</span>
    }
  }

  const getChannelName = (n) => {
    if (n.channelId && typeof n.channelId === 'object') {
      return n.channelId.name
    }
    return null
  }

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
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border-primary)' }}
      >
        <div className="flex items-center gap-2">
          <Bell size={18} style={{ color: 'var(--text-white)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-white)' }}>
            Notifications
          </h2>
          {unreadCount > 0 && (
            <span
              className="text-[11px] px-1.5 py-0.5 rounded-full font-medium"
              style={{
                background: 'var(--accent-primary)',
                color: 'white',
              }}
            >
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors"
              title="Mark all as read"
              style={{
                color: 'var(--accent-primary)',
                background: 'transparent',
                border: 'none',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <CheckCheck size={14} />
              Read all
            </button>
          )}
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
      </div>

      {/* Notification List */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        {isLoading && notifications.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        )}

        {!isLoading && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
              style={{ background: 'var(--bg-hover)' }}
            >
              <Bell size={22} style={{ color: 'var(--text-muted)' }} />
            </div>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              No notifications yet
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              You'll see mentions, DMs, and updates here
            </p>
          </div>
        )}

        {notifications.map((n) => {
          const iconEntry = NOTIFICATION_ICONS[n.type] || NOTIFICATION_ICONS.system
          const Icon = iconEntry.icon
          const channelName = getChannelName(n)
          const timeAgo = n.createdAt
            ? formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true })
            : ''

          return (
            <button
              key={n._id}
              onClick={() => handleNotificationClick(n)}
              className="flex items-start gap-3 w-full px-4 py-3 text-left transition-colors cursor-pointer"
              style={{
                background: n.isRead ? 'transparent' : 'var(--bg-hover)',
                border: 'none',
                borderBottom: '1px solid var(--border-secondary)',
              }}
              onMouseEnter={(e) => {
                if (n.isRead) e.currentTarget.style.background = 'var(--bg-hover)'
              }}
              onMouseLeave={(e) => {
                if (n.isRead) e.currentTarget.style.background = 'transparent'
              }}
            >
              {/* Icon / Avatar */}
              <div className="mt-0.5 shrink-0">
                {n.senderId?.avatar ? (
                  <Avatar
                    member={{ name: n.senderId.name, avatar: n.senderId.avatar }}
                    size={32}
                  />
                ) : (
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: `${iconEntry.color}15` }}
                  >
                    <Icon size={16} style={{ color: iconEntry.color }} />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-[14px] leading-snug truncate pr-2" style={{ color: 'var(--text-white)' }}>
                    {getNotificationText(n)}
                  </p>
                  {timeAgo && (
                    <span className="text-[11px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                      {timeAgo}
                    </span>
                  )}
                </div>
                {n.body && (
                  <p
                    className="text-[13px] leading-relaxed line-clamp-2"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {n.body}
                  </p>
                )}
              </div>

              {/* Unread dot */}
              {!n.isRead && (
                <div
                  className="w-2 h-2 rounded-full mt-2 shrink-0"
                  style={{ background: 'var(--accent-primary)' }}
                />
              )}
            </button>
          )
        })}

        {isLoading && notifications.length > 0 && (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        )}
      </div>
    </div>
  )
}
