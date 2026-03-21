import NotificationItem from './NotificationItem'

export default function MentionToast({ notification }) {
  return (
    <div className="mention-toast-card-wrapper">
      <NotificationItem
        notification={notification}
        isRead={false}
        showTime={true}
        onClick={() => { /* toast click handled at store level or can be added here */ }}
      />
    </div>
  )
}
