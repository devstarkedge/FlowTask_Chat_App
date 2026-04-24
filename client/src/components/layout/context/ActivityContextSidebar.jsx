import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  Activity,
  AtSign,
  Bell,
  CheckCheck,
  Info,
  Loader2,
  MessageCircle,
  MessageSquareText,
  UserPlus,
} from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { useNotificationStore } from '../../../stores/notificationStore'
import { Avatar } from '../../chat/MemberAvatarGroup'
import WorkspaceSwitcher from '../../workspace/WorkspaceSwitcher'
import SidebarContainer from '../sidebar/SidebarContainer'
import SidebarItem from '../sidebar/SidebarItem'
import { getNotificationText, normalizeNotification } from '../../../utils/notificationFormat'

const NOTIFICATION_ICONS = {
  mention: { icon: AtSign, color: 'var(--accent-primary)' },
  dm: { icon: MessageCircle, color: 'var(--accent-green)' },
  thread_reply: { icon: MessageSquareText, color: 'var(--accent-blue, var(--accent-primary))' },
  channel_invite: { icon: UserPlus, color: 'var(--accent-purple)' },
  task_update: { icon: Activity, color: 'var(--accent-yellow)' },
  system: { icon: Info, color: 'var(--text-muted)' },
}

function moveListFocus(event, direction) {
  const current = event.currentTarget
  const sibling = direction === 'next' ? current.nextElementSibling : current.previousElementSibling
  if (sibling?.tagName === 'BUTTON') {
    sibling.focus()
  }
}

function ActivitySkeleton() {
  return (
    <div className="sidebar-item" style={{ cursor: 'default', pointerEvents: 'none' }}>
      <span className="sidebar-item-icon">
        <div className="w-7 h-7 rounded-lg skeleton" />
      </span>
      <span className="sidebar-item-content">
        <div className="h-3.5 rounded skeleton" style={{ width: '80%', marginBottom: 6 }} />
        <div className="h-3 rounded skeleton" style={{ width: '55%' }} />
      </span>
    </div>
  )
}

function NotificationIcon({ notification }) {
  const data = normalizeNotification(notification)

  // If sender name exists, use Avatar component (handles default placeholder initials)
  if (data?.senderName) {
    return (
      <Avatar
        member={{
          name: data.senderName,
          avatar: data.senderAvatar,
        }}
        size={28}
      />
    )
  }

  const iconEntry = NOTIFICATION_ICONS[notification.type] || NOTIFICATION_ICONS.system
  const Icon = iconEntry.icon

  return (
    <div
      className="flex items-center justify-center rounded-lg"
      style={{
        width: 28,
        height: 28,
        background: `${iconEntry.color}1F`,
      }}
    >
      <Icon size={14} style={{ color: iconEntry.color }} />
    </div>
  )
}

export default function ActivityContextSidebar({
  selectedNotificationId,
  onSelectNotification,
  onAutoSelect,
}) {
  const {
    notifications,
    unreadCount,
    isLoading,
    hasMore,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
  } = useNotificationStore()

  const scrollRef = useRef(null)

  useEffect(() => {
    fetchNotifications(true)
    fetchUnreadCount()
  }, [fetchNotifications, fetchUnreadCount])

  const selectedNotification = useMemo(
    () => notifications.find((n) => n._id === selectedNotificationId) || null,
    [notifications, selectedNotificationId],
  )

  useEffect(() => {
    if (selectedNotification) return
    if (notifications.length === 0) return
    const firstNavigable = notifications.find((n) => !!n.channelId) || notifications[0]
    onAutoSelect?.(firstNavigable)
  }, [notifications, selectedNotification, onAutoSelect])

  const handleSelectNotification = useCallback(async (notification) => {
    if (!notification) return
    if (!notification.isRead) {
      await markAsRead(notification._id)
    }
    onSelectNotification?.(notification)
  }, [markAsRead, onSelectNotification])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || isLoading || !hasMore) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
      fetchNotifications(false)
    }
  }, [fetchNotifications, hasMore, isLoading])

  const header = (
    <div>
      <div className="w-full flex items-center justify-between" style={{ minHeight: 32 }}>
        <WorkspaceSwitcher />
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={18} style={{ color: 'var(--accent-primary)' }} />
          <h1 className="text-sm font-semibold" style={{ color: 'var(--text-white)' }}>
            Activity
          </h1>
          {unreadCount > 0 && (
            <span
              className="text-[11px] px-1.5 py-0.5 rounded-full font-semibold"
              style={{ background: 'var(--accent-primary)', color: '#fff' }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer"
            style={{ color: 'var(--accent-primary)', border: 'none', background: 'transparent' }}
          >
            <CheckCheck size={13} />
            Mark all read
          </button>
        )}
      </div>
    </div>
  )

  return (
    <SidebarContainer header={header} aria-label="Activity notifications">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto"
        role="listbox"
        aria-label="Activity notifications"
      >
        {/* Loading skeletons */}
        {isLoading && notifications.length === 0 && (
          <div className="px-2 pt-2">
            {Array.from({ length: 7 }).map((_, idx) => (
              <ActivitySkeleton key={idx} />
            ))}
            <div className="py-4 flex items-center justify-center">
              <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && notifications.length === 0 && (
          <div className="py-16 px-6 text-center">
            <Bell size={34} className="mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.45 }} />
            <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--text-white)' }}>
              No recent activity
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Mentions, replies, and reactions will appear here in real-time.
            </p>
          </div>
        )}

        {/* Notification items */}
        <div className="px-2 pt-1">
          {notifications.map((notification) => {
            const isSelected = notification._id === selectedNotificationId
            const timeAgo = notification.createdAt
              ? formatDistanceToNowStrict(new Date(notification.createdAt), { addSuffix: true })
              : ''

            return (
              <SidebarItem
                key={notification._id}
                icon={<NotificationIcon notification={notification} />}
                label={getNotificationText(notification)}
                sublabel={notification.body || undefined}
                meta={timeAgo && (
                  <span className="text-[11px]" style={{ color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)' }}>
                    {timeAgo}
                  </span>
                )}
                indicator={
                  !notification.isRead && (
                    <span
                      className="rounded-full shrink-0"
                      style={{
                        width: 7,
                        height: 7,
                        background: 'var(--accent-primary)',
                      }}
                    />
                  )
                }
                isBold={!notification.isRead}
                isActive={isSelected}
                onClick={() => handleSelectNotification(notification)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    moveListFocus(e, 'next')
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    moveListFocus(e, 'prev')
                  }
                }}
                ariaSelected={isSelected}
              />
            )
          })}
        </div>

        {/* Load more spinner */}
        {isLoading && notifications.length > 0 && (
          <div className="py-3 flex items-center justify-center">
            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        )}
      </div>
    </SidebarContainer>
  )
}
