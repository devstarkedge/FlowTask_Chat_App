/**
 * @file badgeService.js
 * Windows Taskbar Badge and Unread Message Count Notification Service.
 * 
 * Manages the generation and real-time synchronization of the Windows taskbar
 * badge overlay icon (`BrowserWindow.setOverlayIcon()`) and dock badge count.
 * 
 * Source of truth: Actual unread message count across DMs and channels.
 * Activity notifications are NOT combined with message unreads to prevent
 * duplicate counting when messages generate activity notifications.
 */

import { updateTaskbarBadge, clearTaskbarBadge } from './desktopService'
import { unreadManager } from './unreadManager'
import { useChannelStore } from '../stores/channelStore'

/**
 * Generate a crisp 32x32 badge image data URL (PNG) for Windows taskbar overlay.
 * Handles single-digit (1-9), double-digit (10-99), and overflow (99+).
 * 
 * @param {number} count 
 * @returns {string|null} PNG data URL or SVG data URL fallback
 */
export function generateBadgeDataUrl(count) {
  if (!count || count <= 0) return null

  const displayCount = count > 99 ? '99+' : String(count)

  // Use HTML5 Canvas if available in DOM environment
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 32
      canvas.height = 32
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, 32, 32)

        const isOverflow = count > 99
        const isDoubleDigit = count >= 10 && count <= 99

        // Background badge styling
        ctx.fillStyle = '#EF4444' // Vibrant red
        ctx.strokeStyle = '#FFFFFF' // Subtle 1.5px border for contrast on light/dark taskbars
        ctx.lineWidth = 1.5

        if (isOverflow) {
          // Rounded pill badge for 99+
          const x = 1.5
          const y = 5.5
          const w = 29
          const h = 21
          const r = 10.5
          ctx.beginPath()
          ctx.moveTo(x + r, y)
          ctx.arcTo(x + w, y, x + w, y + h, r)
          ctx.arcTo(x + w, y + h, x, y + h, r)
          ctx.arcTo(x, y + h, x, y, r)
          ctx.arcTo(x, y, x + w, y, r)
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
        } else if (isDoubleDigit) {
          // Slightly wide circle / rounded oval for 10-99
          const x = 3.5
          const y = 3.5
          const w = 25
          const h = 25
          const r = 12.5
          ctx.beginPath()
          ctx.arc(16, 16, r, 0, Math.PI * 2)
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
        } else {
          // Perfect circle for 1-9
          ctx.beginPath()
          ctx.arc(16, 16, 13, 0, Math.PI * 2)
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
        }

        // Text styling
        ctx.fillStyle = '#FFFFFF'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        if (isOverflow) {
          ctx.font = 'bold 11px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
          ctx.fillText(displayCount, 16, 16.5)
        } else if (isDoubleDigit) {
          ctx.font = 'bold 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
          ctx.fillText(displayCount, 16, 16.5)
        } else {
          ctx.font = 'bold 18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
          ctx.fillText(displayCount, 16, 17)
        }

        return canvas.toDataURL('image/png')
      }
    } catch {
      // Fall through to SVG fallback
    }
  }

  // Pure SVG data URL fallback (node or canvas-restricted environments)
  const isOverflow = count > 99
  const fontSize = isOverflow ? 11 : count >= 10 ? 14 : 18
  const shape = isOverflow
    ? `<rect x="2" y="6" width="28" height="20" rx="10" fill="#EF4444" stroke="#FFFFFF" stroke-width="1.5"/>`
    : `<circle cx="16" cy="16" r="13" fill="#EF4444" stroke="#FFFFFF" stroke-width="1.5"/>`

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${shape}<text x="16" y="${isOverflow ? 19.5 : 21}" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="${fontSize}" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${displayCount}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export class BadgeService {
  constructor() {
    this._currentTotal = 0
    this._unsubscribers = []
    this._isInitialized = false
    this._originalDocumentTitle = typeof document !== 'undefined' ? document.title || 'TaskChat' : 'TaskChat'
  }

  /**
   * Calculate current aggregate unread count.
   * Total = all unread messages from channels and DMs.
   * Activity notifications are NOT included to prevent duplicate counting.
   * 
   * @returns {number}
   */
  calculateTotalUnread() {
    const channelStoreState = useChannelStore?.getState ? useChannelStore.getState() : {}
    const unreads = channelStoreState.unreads || {}
    const channels = channelStoreState.channels || []

    // If channel list is available, exclude archived channels
    if (channels.length > 0) {
      const channelMap = new Map(channels.map((c) => [c._id, c]))
      return Object.entries(unreads).reduce((sum, [cid, count]) => {
        const ch = channelMap.get(cid)
        if (ch && ch.isArchived) return sum
        const validCount = typeof count === 'number' && Number.isFinite(count) && count > 0 ? count : 0
        return sum + validCount
      }, 0)
    }

    return unreadManager.calculateTotalUnread(unreads)
  }

  /**
   * Synchronize taskbar badge with current total unread message count.
   * @param {number} [forcedCount]
   */
  sync(forcedCount) {
    const total = typeof forcedCount === 'number' ? Math.max(0, forcedCount) : this.calculateTotalUnread()
    this._currentTotal = total

    // Update document title with unread indicator
    if (typeof document !== 'undefined') {
      const baseTitle = this._originalDocumentTitle.replace(/^\(\d+\+?\)\s*/, '')
      document.title = total > 0 ? `(${total > 99 ? '99+' : total}) ${baseTitle}` : baseTitle
    }

    if (total <= 0) {
      clearTaskbarBadge()
      return
    }

    const dataUrl = generateBadgeDataUrl(total)
    const description = `${total} unread message${total > 1 ? 's' : ''}`
    updateTaskbarBadge(total, dataUrl, description)
  }

  /**
   * Initialize subscriptions to state stores.
   * Auto-updates taskbar overlay whenever unread message count changes.
   */
  init() {
    if (this._isInitialized) {
      this.sync()
      return () => this.cleanup()
    }
    this._isInitialized = true

    if (typeof document !== 'undefined') {
      this._originalDocumentTitle = document.title || 'TaskChat'
    }

    // Subscribe to channelStore (message unreads across channels & DMs)
    if (useChannelStore?.subscribe) {
      const unsubChannel = useChannelStore.subscribe((state, prevState) => {
        if (state.unreads !== prevState.unreads || state.channels !== prevState.channels) {
          this.sync()
        }
      })
      this._unsubscribers.push(unsubChannel)
    }

    // Initial badge update
    this.sync()

    return () => this.cleanup()
  }

  /**
   * Unsubscribe and clear state.
   */
  cleanup() {
    this._unsubscribers.forEach((unsub) => {
      try {
        if (typeof unsub === 'function') unsub()
      } catch {}
    })
    this._unsubscribers = []
    this._isInitialized = false
    this.sync(0)
  }
}

export const badgeService = new BadgeService()
export default badgeService
