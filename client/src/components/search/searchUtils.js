function asId(value) {
  if (!value) return null
  if (typeof value === 'string') return value
  return (value._id || value.id || null)?.toString?.() || null
}

export function stripMarkup(value = '') {
  return value
    .toString()
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildScopedSearchQuery(channelId, query, authorId = null) {
  const tokens = []
  if (channelId) tokens.push(`in:${channelId}`)
  if (authorId) tokens.push(`from:${authorId}`)
  if (query?.trim()) tokens.push(query.trim())
  return tokens.join(' ').trim()
}

export function getScopeLabel(channel) {
  if (!channel) return ''
  const name = channel.name || channel.slug || 'Conversation'
  return channel.type === 'dm' ? `in:${name}` : `in:#${name}`
}

export function getScopeTargetLabel(channel) {
  return channel?.type === 'dm' ? 'conversation' : 'channel'
}

export function normalizeSearchMessage(message, fallbackChannel = null) {
  const author = message.authorId && typeof message.authorId === 'object'
    ? message.authorId
    : null
  const senderSnapshot = message.senderSnapshot && typeof message.senderSnapshot === 'object'
    ? message.senderSnapshot
    : null
  const channelRef = message.channelId && typeof message.channelId === 'object'
    ? message.channelId
    : null

  const id = message.id || asId(message._id) || asId(message.messageId)
  const channelId = asId(message.channelId) || fallbackChannel?._id || null

  if (!id || !channelId) return null

  return {
    id,
    type: 'message',
    channelId,
    channelType: message.channelType || channelRef?.type || fallbackChannel?.type || 'channel',
    channelName:
      message.channelName
      || channelRef?.name
      || fallbackChannel?.name
      || fallbackChannel?.slug
      || 'Conversation',
    senderName:
      message.senderName
      || senderSnapshot?.name
      || author?.name
      || 'Someone',
    senderAvatar: message.senderAvatar || senderSnapshot?.avatar || author?.avatar || null,
    snippet: message.snippet || stripMarkup(message.content || message.htmlContent || message.activityMeta?.taskTitle || ''),
    createdAt: message.createdAt || message.updatedAt || null,
    reasonLabel: message.reasonLabel || null,
  }
}

export function normalizeSearchMessages(messages = [], fallbackChannel = null) {
  return messages
    .map((message) => normalizeSearchMessage(message, fallbackChannel))
    .filter(Boolean)
}

export function normalizeRecentMessages(messages = [], channel = null, limit = 12) {
  return [...messages]
    .slice(-limit)
    .reverse()
    .map((message) => normalizeSearchMessage({
      ...message,
      id: message._id,
      reasonLabel: 'Recent message',
    }, channel))
    .filter(Boolean)
}