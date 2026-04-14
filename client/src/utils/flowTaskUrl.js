/**
 * FlowTask Deep-Link URL Builders
 *
 * Constructs redirect URLs for opening tasks and announcements
 * directly in the FlowTask application from ChatApp bot messages.
 */

function getBaseUrl() {
  const url = import.meta.env.VITE_FLOWTASK_URL
  if (!url) return null
  // Strip trailing slash
  return url.replace(/\/+$/, '')
}

/**
 * Build a deep-link URL to open a specific task modal in FlowTask.
 * Returns null if any required ID is missing or VITE_FLOWTASK_URL is not set.
 *
 * URL format: ${baseUrl}/workflow/${departmentId}/${projectId}/${taskId}
 */
export function buildTaskUrl(departmentId, projectId, taskId) {
  const base = getBaseUrl()
  if (!base || !departmentId || !projectId || !taskId) return null
  return `${base}/workflow/${encodeURIComponent(departmentId)}/${encodeURIComponent(projectId)}/${encodeURIComponent(taskId)}`
}

/**
 * Build a deep-link URL to open the announcement page/modal in FlowTask.
 * If announcementId is provided, appends it as a query param for exact modal opening.
 * Returns null if VITE_FLOWTASK_URL is not set.
 */
export function buildAnnouncementUrl(announcementId) {
  const base = getBaseUrl()
  if (!base) return null
  if (announcementId) {
    return `${base}/announcements?open=${encodeURIComponent(announcementId)}`
  }
  return `${base}/announcements`
}

/**
 * Check whether a task redirect URL can be built from the given activityMeta.
 */
export function canBuildTaskUrl(meta) {
  if (!meta) return false
  return !!(getBaseUrl() && meta.departmentId && meta.projectId && meta.taskId)
}

/**
 * Build the appropriate redirect URL from an activityMeta object.
 * Returns { url, label } or null if no URL can be built.
 */
export function buildRedirectFromMeta(meta) {
  if (!meta) return null

  if (meta.eventType === 'ANNOUNCEMENT_CREATED') {
    const url = buildAnnouncementUrl(meta.announcementId)
    return url ? { url, label: 'View Announcement' } : null
  }

  // All task-related events
  const url = buildTaskUrl(meta.departmentId, meta.projectId, meta.taskId)
  return url ? { url, label: 'Open Task' } : null
}
