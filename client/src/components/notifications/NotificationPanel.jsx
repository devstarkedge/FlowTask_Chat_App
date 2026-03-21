import { useEffect, useCallback, useRef } from 'react'
import { useNotificationStore } from '../../stores/notificationStore'
import { useChannelStore } from '../../stores/channelStore'
import {
  X, Bell, AtSign, MessageCircle, UserPlus, ClipboardList, Info,
  MessageSquareText, CheckCheck, Loader2,
} from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import NotificationItem from './NotificationItem'
import { getNotificationMeta, getNotificationText, normalizeNotification } from '../../utils/notificationFormat'

export default function NotificationPanel({ onClose, onSelectNotification }) {
  const {
    notifications, unreadCount, isLoading, hasMore,
    fetchNotifications, fetchUnreadCount, markAsRead, markAllAsRead,
  } = useNotificationStore()
  const { setActiveChannel } = useChannelStore()
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
    const data = normalizeNotification(notification)
    if (!data) return

    if (!notification.isRead) {
      markAsRead(notification._id)
    }

    if (onSelectNotification) {
      onSelectNotification(data)
      onClose?.()
      return
    }

    if (data.channelId) {
      setActiveChannel(data.channelId._id || data.channelId)
    }
    onClose?.()
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
          return (
            <NotificationItem
              key={n._id}
              notification={n}
              isRead={n.isRead}
              isActive={false}
              onClick={() => handleNotificationClick(n)}
              showTime={true}
              className="notification-panel-item"
            />
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
