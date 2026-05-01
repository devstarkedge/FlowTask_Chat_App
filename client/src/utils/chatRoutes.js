export function workspaceBasePath(workspaceId) {
  return `/workspace/${workspaceId}`
}

export function getActivityPath(workspaceId, notificationId = null) {
  return notificationId
    ? `${workspaceBasePath(workspaceId)}/activity/${notificationId}`
    : `${workspaceBasePath(workspaceId)}/activity`
}

export function getFilesPath(workspaceId, fileRefId = null) {
  return fileRefId
    ? `${workspaceBasePath(workspaceId)}/files/${fileRefId}`
    : `${workspaceBasePath(workspaceId)}/files`
}

export function getSearchPath(workspaceId, scopeId = null, query = '') {
  const params = new URLSearchParams()
  if (scopeId) params.set('scope', scopeId)
  if (query) params.set('q', query)
  const suffix = params.toString()
  return `${workspaceBasePath(workspaceId)}/search${suffix ? `?${suffix}` : ''}`
}

export function getDMPath(workspaceId, dmId, messageId = null) {
  const base = `${workspaceBasePath(workspaceId)}/dms/${dmId}`
  return messageId ? `${base}/message/${messageId}` : base
}

export function getChannelPath(workspaceId, channelId, messageId = null) {
  const base = `${workspaceBasePath(workspaceId)}/channel/${channelId}`
  return messageId ? `${base}/message/${messageId}` : base
}

export function getLegacyDMPath(workspaceId, dmId, messageId = null) {
  const base = `${workspaceBasePath(workspaceId)}/dm/${dmId}`
  return messageId ? `${base}/message/${messageId}` : base
}

export function getDirectoriesPath(workspaceId) {
  return `${workspaceBasePath(workspaceId)}/directories`
}

export function getThreadPath(workspaceId, channelId, threadId, messageId = null) {
  const base = `${workspaceBasePath(workspaceId)}/channel/${channelId}`
  return messageId ? `${base}/message/${messageId}` : `${base}/message/${threadId}`
}

/**
 * Resolve a notification's deep-link data to a React Router path.
 * Used by the service worker, notification panel, and toast clicks.
 *
 * @param {object} deepLink - { workspaceId, channelId, messageId, threadId, type }
 * @returns {string} Route path
 */
export function resolveDeepLink(deepLink) {
  if (!deepLink?.workspaceId) return '/'

  const { workspaceId, channelId, messageId, threadId, type } = deepLink

  if (type === 'dm' && channelId) {
    return getDMPath(workspaceId, channelId, messageId)
  }

  if (type === 'thread' && channelId && threadId) {
    return getThreadPath(workspaceId, channelId, threadId, messageId)
  }

  if (channelId) {
    return getChannelPath(workspaceId, channelId, messageId)
  }

  return workspaceBasePath(workspaceId)
}
