function extractId(val) {
  if (!val) return null;
  if (typeof val === 'string') return val;
  return (val._id || val.id || null)?.toString?.() || null;
}

export function workspaceBasePath(workspaceId) {
  return `/workspace/${extractId(workspaceId) || workspaceId}`
}

export function getActivityPath(workspaceId, notificationId = null) {
  const nId = extractId(notificationId) || notificationId;
  return nId
    ? `${workspaceBasePath(workspaceId)}/activity/${nId}`
    : `${workspaceBasePath(workspaceId)}/activity`
}

export function getFilesPath(workspaceId, fileRefId = null) {
  const fId = extractId(fileRefId) || fileRefId;
  return fId
    ? `${workspaceBasePath(workspaceId)}/files/${fId}`
    : `${workspaceBasePath(workspaceId)}/files`
}

export function getSearchPath(workspaceId, scopeId = null, query = '') {
  const params = new URLSearchParams()
  const sId = extractId(scopeId) || scopeId;
  if (sId) params.set('scope', sId)
  if (query) params.set('q', query)
  const suffix = params.toString()
  return `${workspaceBasePath(workspaceId)}/search${suffix ? `?${suffix}` : ''}`
}

export function getDMPath(workspaceId, dmId, messageId = null) {
  const cId = extractId(dmId) || dmId;
  const mId = extractId(messageId) || messageId;
  const base = `${workspaceBasePath(workspaceId)}/dms/${cId}`
  return mId ? `${base}/message/${mId}` : base
}

export function getChannelPath(workspaceId, channelId, messageId = null) {
  const cId = extractId(channelId) || channelId;
  const mId = extractId(messageId) || messageId;
  const base = `${workspaceBasePath(workspaceId)}/channel/${cId}`
  return mId ? `${base}/message/${mId}` : base
}

export function getLegacyDMPath(workspaceId, dmId, messageId = null) {
  const cId = extractId(dmId) || dmId;
  const mId = extractId(messageId) || messageId;
  const base = `${workspaceBasePath(workspaceId)}/dm/${cId}`
  return mId ? `${base}/message/${mId}` : base
}

export function getDirectoriesPath(workspaceId) {
  return `${workspaceBasePath(workspaceId)}/directories`
}

export function getThreadPath(workspaceId, channelId, threadId, messageId = null) {
  const cId = extractId(channelId) || channelId;
  const tId = extractId(threadId) || threadId;
  const mId = extractId(messageId) || messageId;
  const base = `${workspaceBasePath(workspaceId)}/channel/${cId}`
  return mId ? `${base}/message/${mId}` : `${base}/message/${tId}`
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
