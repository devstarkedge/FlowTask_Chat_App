import { useEffect, useCallback, useRef, useState } from 'react'
import { useNotificationStore } from '../../stores/notificationStore'
import { useChannelStore } from '../../stores/channelStore'
import {
  X, Bell, AtSign, MessageCircle, CheckCheck, Loader2,
  Settings, MessageSquareText, PauseCircle, Filter,
} from 'lucide-react'
import NotificationItem from './NotificationItem'
import NotificationSettingsModal from './NotificationSettingsModal'
import PauseNotificationsDropdown from './PauseNotificationsDropdown'
import { normalizeNotification } from '../../utils/notificationFormat'

const FILTER_TABS = [
  { id: 'all', label: 'All', icon: Bell },
  { id: 'dms', label: 'DMs', icon: MessageCircle },
  { id: 'mentions', label: 'Mentions', icon: AtSign },
  { id: 'threads', label: 'Threads', icon: MessageSquareText },
]

export default function NotificationPanel({ onClose, onSelectNotification }) {
  const {
    notifications, unreadCount, isLoading, hasMore,
    fetchNotifications, fetchUnreadCount, markAsRead, markAllAsRead,
    activeFilter, setActiveFilter, getFilteredNotifications,
    isPaused, fetchPreferences,
  } = useNotificationStore()
  const { setActiveChannel } = useChannelStore()
  const scrollRef = useRef(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showPauseDropdown, setShowPauseDropdown] = useState(false)

  useEffect(() => {
    fetchNotifications(true)
    fetchUnreadCount()
    fetchPreferences()
  }, [fetchNotifications, fetchUnreadCount, fetchPreferences])

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

  const filteredNotifications = getFilteredNotifications()

  return (
    <>
      <div
        className="notification-panel flex flex-col h-full animate-slide-in-right"
        style={{
          width: 'var(--thread-panel-width)',
          minWidth: 'var(--thread-panel-width)',
          borderLeft: '1px solid var(--border-primary)',
          background: 'var(--bg-primary)',
        }}
      >
        {/* Header */}
        <div
          className="notification-panel-header flex items-center justify-between px-4 py-3 shrink-0"
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
            {isPaused && (
              <span
                className="notif-pause-badge text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1"
                style={{
                  background: 'var(--status-warning, #f59e0b)',
                  color: '#fff',
                }}
              >
                <PauseCircle size={10} />
                Paused
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="read-all-btn flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors"
                title="Mark all as read"
                aria-label="Mark all notifications as read"
              >
                <CheckCheck size={14} />
                Read all
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => setShowPauseDropdown(!showPauseDropdown)}
                className="close-btn p-1.5 rounded-md cursor-pointer transition-colors"
                title="Pause notifications"
                aria-label="Pause notifications"
              >
                <PauseCircle size={16} />
              </button>
              {showPauseDropdown && (
                <PauseNotificationsDropdown
                  onClose={() => setShowPauseDropdown(false)}
                />
              )}
            </div>
            <button
              onClick={() => setShowSettings(true)}
              className="close-btn p-1.5 rounded-md cursor-pointer transition-colors"
              title="Notification settings"
              aria-label="Open notification settings"
              id="notif-settings-btn"
            >
              <Settings size={16} />
            </button>
            <button
              onClick={onClose}
              className="close-btn p-1.5 rounded-md cursor-pointer transition-colors"
              aria-label="Close notifications"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div
          className="notif-filter-tabs flex items-center gap-1 px-3 py-2 shrink-0"
          style={{ borderBottom: '1px solid var(--border-primary)' }}
        >
          {FILTER_TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeFilter === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`notif-filter-tab ${isActive ? 'is-active' : ''}`}
                aria-pressed={isActive}
                id={`notif-filter-${tab.id}`}
              >
                <Icon size={13} />
                {tab.label}
              </button>
            )
          })}
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

          {!isLoading && filteredNotifications.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                style={{ background: 'var(--bg-hover)' }}
              >
                <Filter size={22} style={{ color: 'var(--text-muted)' }} />
              </div>
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                {activeFilter === 'all' ? 'No notifications yet' : `No ${activeFilter} notifications`}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {activeFilter === 'all'
                  ? "You'll see mentions, DMs, and updates here"
                  : `Try switching to "All" to see all notifications`
                }
              </p>
            </div>
          )}

          {filteredNotifications.map((n) => (
            <NotificationItem
              key={n._id}
              notification={n}
              isRead={n.isRead}
              isActive={false}
              onClick={() => handleNotificationClick(n)}
              showTime={true}
              className="notification-panel-item"
            />
          ))}

          {isLoading && notifications.length > 0 && (
            <div className="flex items-center justify-center py-4">
              <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          )}
        </div>
      </div>

      {showSettings && (
        <NotificationSettingsModal onClose={() => setShowSettings(false)} />
      )}
    </>
  )
}
