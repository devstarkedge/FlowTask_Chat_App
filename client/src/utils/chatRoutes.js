function extractId(val) {
  if (!val) return null;
  if (typeof val === 'string' && val !== '[object Object]') return val;
  if (val._id) return extractId(val._id);
  if (val.id) return extractId(val.id);
  if (val.$oid) return val.$oid;
  if (typeof val.toString === 'function') {
    const str = val.toString();
    if (str !== '[object Object]') return str;
  }
  return null;
}

function safeString(val) {
  const str = extractId(val) || (typeof val === 'string' ? val : '');
  return str === '[object Object]' ? '' : str;
}

export function workspaceBasePath(workspaceId) {
  const wId = safeString(workspaceId);
  return `/workspace/${wId}`
}

export function getActivityPath(workspaceId, notificationId = null) {
  const nId = safeString(notificationId);
  return nId
    ? `${workspaceBasePath(workspaceId)}/activity/${nId}`
    : `${workspaceBasePath(workspaceId)}/activity`
}

export function getFilesPath(workspaceId, fileRefId = null) {
  const fId = safeString(fileRefId);
  return fId
    ? `${workspaceBasePath(workspaceId)}/files/${fId}`
    : `${workspaceBasePath(workspaceId)}/files`
}

export function getSearchPath(workspaceId, scopeId = null, query = '') {
  const params = new URLSearchParams()
  const sId = safeString(scopeId);
  if (sId) params.set('scope', sId)
  if (query) params.set('q', query)
  const suffix = params.toString()
  return `${workspaceBasePath(workspaceId)}/search${suffix ? `?${suffix}` : ''}`
}

export function getDMPath(workspaceId, dmId, messageId = null) {
  const cId = safeString(dmId);
  const mId = safeString(messageId);
  const base = `${workspaceBasePath(workspaceId)}/dms/${cId}`
  return mId ? `${base}/message/${mId}` : base
}

export function getChannelPath(workspaceId, channelId, messageId = null) {
  const cId = safeString(channelId);
  const mId = safeString(messageId);
  const base = `${workspaceBasePath(workspaceId)}/channel/${cId}`
  return mId ? `${base}/message/${mId}` : base
}

export function getLegacyDMPath(workspaceId, dmId, messageId = null) {
  const cId = safeString(dmId);
  const mId = safeString(messageId);
  const base = `${workspaceBasePath(workspaceId)}/dm/${cId}`
  return mId ? `${base}/message/${mId}` : base
}

export function getDirectoriesPath(workspaceId) {
  return `${workspaceBasePath(workspaceId)}/directories`
}

export function getThreadPath(workspaceId, channelId, threadId, messageId = null) {
  const cId = safeString(channelId);
  const tId = safeString(threadId);
  const mId = safeString(messageId);
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
