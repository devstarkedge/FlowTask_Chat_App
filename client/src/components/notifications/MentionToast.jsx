import { Avatar } from '../chat/MemberAvatarGroup'
import { getNotificationMeta, getNotificationText, normalizeNotification } from '../../utils/notificationFormat'

export default function MentionToast({ notification }) {
  const data = normalizeNotification(notification)
  if (!data) return null

  return (
    <div className="mention-toast-card">
      <span className="mention-toast-avatar">
        <Avatar
          member={{ name: data.senderName, avatar: data.senderAvatar }}
          size={30}
          showStatus={false}
        />
      </span>

      <span className="mention-toast-content">
        <span className="mention-toast-title">{getNotificationText(data)}</span>
        <span className="mention-toast-preview">{data.messagePreview || 'Open to view the message.'}</span>
        <span className="mention-toast-meta">{getNotificationMeta(data)}</span>
      </span>
    </div>
  )
}
