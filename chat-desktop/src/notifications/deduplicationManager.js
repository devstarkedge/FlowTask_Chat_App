/**
 * @file deduplicationManager.js
 * Deduplication Manager Layer.
 * Centralized notification deduplication using event ID, event type, workspace, and conversation context.
 */

export class DeduplicationManager {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxSize=1000] Maximum number of keys to retain in cache
   * @param {number} [options.ttlMs=600000] Time to live for event keys in ms (default 10 mins)
   */
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000
    this.ttlMs = options.ttlMs || 600000 // 10 minutes
    /** @type {Map<string, number>} */
    this.cache = new Map()
  }

  /**
   * Derive a unique deduplication key for a notification event.
   * @param {import('./types.js').NotificationEvent} event
   * @returns {string}
   */
  generateKey(event) {
    if (!event) return ''

    const type = event.type || 'generic'
    const id = event.eventId || event.messageId || 'noid'
    const workspace = event.workspaceId || 'global'
    const contextId = event.channelId || event.conversationId || 'noctx'

    return `${type}:${id}:${workspace}:${contextId}`
  }

  /**
   * Check if an event has already been processed and recorded.
   * Purges expired entries automatically.
   * @param {import('./types.js').NotificationEvent} event
   * @returns {boolean}
   */
  isDuplicate(event) {
    const key = this.generateKey(event)
    if (!key) return false

    this._cleanupExpired()

    if (this.cache.has(key)) {
      const timestamp = this.cache.get(key)
      if (Date.now() - timestamp < this.ttlMs) {
        return true
      }
      // Expired entry
      this.cache.delete(key)
    }

    return false
  }

  /**
   * Track an event as processed.
   * @param {import('./types.js').NotificationEvent} event
   */
  track(event) {
    const key = this.generateKey(event)
    if (!key) return

    // Evict oldest entries if capacity reached
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) this.cache.delete(oldestKey)
    }

    this.cache.set(key, Date.now())
  }

  /**
   * Helper method to atomically check and track an event.
   * @param {import('./types.js').NotificationEvent} event
   * @returns {boolean} True if event was a duplicate, false if new and tracked
   */
  checkAndTrack(event) {
    if (this.isDuplicate(event)) {
      return true
    }
    this.track(event)
    return false
  }

  /**
   * Internal cleanup of expired cache entries.
   */
  _cleanupExpired() {
    const now = Date.now()
    for (const [key, timestamp] of this.cache.entries()) {
      if (now - timestamp >= this.ttlMs) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Clear all cached deduplication entries.
   */
  clear() {
    this.cache.clear()
  }
}

export const deduplicationManager = new DeduplicationManager()
