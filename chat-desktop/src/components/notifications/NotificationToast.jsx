import { useEffect, useState } from 'react'
import { X, MessageCircle, AtSign, MessageSquareText, Bell } from 'lucide-react'

const TOAST_DURATION = 5000
const TYPE_ICONS = {
  dm: MessageCircle,
  mention: AtSign,
  thread_reply: MessageSquareText,
  keyword_match: AtSign,
  default: Bell,
}

/**
 * In-app toast notification — shown when user is active in app
 * but on a different page from the notification source.
 *
 * @param {object} props
 * @param {object} props.notification - Notification data
 * @param {Function} props.onClick - Click handler (deep-link to message)
 * @param {Function} props.onDismiss - Dismiss handler
 * @param {boolean} props.playSound - Whether to play notification sound
 */
export default function NotificationToast({ notification, onClick, onDismiss, playSound = true }) {
  const [isVisible, setIsVisible] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setIsVisible(true))

    // Play sound if enabled
    if (playSound) {
      try {
        const audio = new Audio('/notification.mp3')
        audio.volume = 0.3
        audio.play().catch(() => {})
      } catch {
        // Audio not available
      }
    }

    // Auto-dismiss
    const timer = setTimeout(() => {
      setIsLeaving(true)
      setTimeout(() => onDismiss?.(), 300)
    }, TOAST_DURATION)

    return () => clearTimeout(timer)
  }, [playSound, onDismiss])

  const handleDismiss = () => {
    setIsLeaving(true)
    setTimeout(() => onDismiss?.(), 300)
  }

  const handleClick = () => {
    handleDismiss()
    onClick?.()
  }

  const Icon = TYPE_ICONS[notification?.type] || TYPE_ICONS.default
  const senderName = notification?.senderName || 'Someone'
  const preview = notification?.messagePreview || notification?.body || ''
  const channelName = notification?.channelName
  const avatarUrl = notification?.senderAvatar

  return (
    <div
      className={`notif-toast ${isVisible && !isLeaving ? 'is-visible' : ''} ${isLeaving ? 'is-leaving' : ''}`}
      onClick={handleClick}
      role="alert"
      aria-live="polite"
    >
      <div className="notif-toast__accent" />

      <div className="notif-toast__body">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={senderName}
            className="notif-toast__avatar"
          />
        ) : (
          <div className="notif-toast__avatar-fallback">
            <Icon size={16} />
          </div>
        )}

        <div className="notif-toast__content">
          <div className="notif-toast__header">
            <strong>{senderName}</strong>
            {channelName && (
              <span className="notif-toast__channel">
                in #{channelName}
              </span>
            )}
          </div>
          <p className="notif-toast__preview">{preview}</p>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation()
            handleDismiss()
          }}
          className="notif-toast__close"
          aria-label="Dismiss notification"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
