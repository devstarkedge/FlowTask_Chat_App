import { formatDistanceToNowStrict } from 'date-fns'
import { Avatar } from '../chat/MemberAvatarGroup'
import { getNotificationText, getNotificationMeta, normalizeNotification } from '../../utils/notificationFormat'

export default function NotificationItem({
  notification,
  onClick,
  isRead = true,
  isActive = false,
  showTime = true,
  showAvatar = true,
  className = '',
}) {
  const data = normalizeNotification(notification)
  if (!data) return null

  const text = getNotificationText(data)
  const meta = getNotificationMeta(data)
  const timeAgo = data.createdAt
    ? formatDistanceToNowStrict(new Date(data.createdAt), { addSuffix: true })
    : ''

  const showPreview = !!data.messagePreview

  return (
    <button
      type="button"
      onClick={onClick}
      className={`notification-item ${isActive ? 'active' : ''} ${!isRead ? 'unread' : ''} ${className}`}
      aria-label={text}
    >
      {showAvatar ? (
        <div className="notification-item-avatar">
          <Avatar member={{ name: data.senderName, avatar: data.senderAvatar }} size={36} showStatus={false} />
        </div>
      ) : null}

      <div className="notification-item-content">
        <p className="notification-item-title" title={text}>
          {text}
        </p>

        {showPreview && (
          <p className="notification-item-preview" title={data.messagePreview}>
            {data.messagePreview}
          </p>
        )}

        <div className="notification-item-meta">
          <span className="notification-item-channel" title={meta}>
            {meta}
          </span>
          {showTime && timeAgo ? (
            <>
              <span className="notification-item-separator" aria-hidden="true">•</span>
              <span className="notification-item-time">{timeAgo}</span>
            </>
          ) : null}
        </div>
      </div>

      {!isRead && <span className="notification-item-unread-dot" aria-label="Unread notification" />}
    </button>
  )
}
