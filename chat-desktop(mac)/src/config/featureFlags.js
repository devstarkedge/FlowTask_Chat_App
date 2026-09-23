function toBool(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue
  const normalized = String(value).toLowerCase()
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false
  return defaultValue
}

export const CHAT_FEATURE_FLAGS = {
  // Enabled by default so users benefit from warm reloads immediately.
  indexedDbCache: toBool(import.meta.env.VITE_CHAT_ENABLE_INDEXEDDB_CACHE, true),

  // Keep normalization off by default until store migration is complete.
  normalizedMessageStore: toBool(import.meta.env.VITE_CHAT_ENABLE_NORMALIZED_STORE, false),

  // Progressive media loading will be wired in a follow-up phase.
  progressiveMediaLoading: toBool(import.meta.env.VITE_CHAT_ENABLE_PROGRESSIVE_MEDIA, false),

  // Logs slow client-side mutation paths in development when enabled.
  perfDebug: toBool(import.meta.env.VITE_CHAT_ENABLE_PERF_DEBUG, false),

  // Enables interactive Slack-like hover panels for workspace nav previews.
  // Default is true so persistent hover behavior works without extra env setup.
  slackHoverPanels: toBool(import.meta.env.VITE_CHAT_ENABLE_SLACK_HOVER_PANELS, true),
}
