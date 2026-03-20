export function normalizeNotification(notification) {
  if (!notification) return null

  const senderName = notification.senderName || notification.senderId?.name || 'Someone'
  const senderAvatar = notification.senderAvatar || notification.senderId?.avatar || null
  const conversationId = notification.conversationId || notification.channelId?._id || notification.channelId || null
  const conversationType = notification.conversationType
    || (notification.type === 'dm' ? 'dm' : 'channel')
  const messageId = notification.messageId || notification.sourceId || null
  const messagePreview = notification.messagePreview || notification.body || ''

  return {
    ...notification,
    senderName,
    senderAvatar,
    conversationId,
    conversationType,
    messageId,
    messagePreview,
  }
}

export function getNotificationText(input) {
  const notification = normalizeNotification(input)
  if (!notification) return 'Notification'

  const senderName = notification.senderName
  const channelName = notification.channelId?.name || notification.channelName

  switch (notification.type) {
    case 'mention':
      return `${senderName} mentioned you${channelName ? ` in #${channelName}` : ''}`
    case 'dm':
      return `New direct message from ${senderName}`
    case 'thread_reply':
      return `${senderName} replied in a thread${channelName ? ` in #${channelName}` : ''}`
    case 'channel_invite':
      return `${senderName} added you to #${channelName || 'channel'}`
    case 'task_update':
      return notification.title || 'Task update'
    default:
      return notification.title || 'Notification'
  }
}

export function getNotificationMeta(input) {
  const notification = normalizeNotification(input)
  if (!notification) return ''

  if (notification.conversationType === 'dm' || notification.type === 'dm') return 'DM'
  if (notification.channelId?.name) return `#${notification.channelId.name}`
  if (notification.channelName) return `#${notification.channelName}`
  return 'Workspace'
}
