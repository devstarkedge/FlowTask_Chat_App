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
