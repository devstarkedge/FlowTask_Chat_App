/**
 * @file navigationRouter.js
 * Notification Click Router Layer.
 * Handles deep navigation when a user clicks on a desktop or in-app notification.
 */

import { NavigationTargetType } from './types.js'
import { onDesktopNotificationClicked } from '../services/desktopService.js'
import { useChannelStore } from '../stores/channelStore.js'
import { useChatStore } from '../stores/chatStore.js'

export class NavigationRouter {
  constructor() {
    this.customNavigators = new Map()
    this.isInitialized = false
  }

  /**
   * Register custom navigation handler for specific target types.
   * @param {string} targetType
   * @param {(targetId: string, extra?: Record<string, any>) => void} handler
   */
  registerNavigator(targetType, handler) {
    if (typeof handler === 'function') {
      this.customNavigators.set(targetType, handler)
    }
  }

  /**
   * Navigate based on notification navigation target.
   * @param {import('./types.js').NavigationTarget | Object} target
   */
  navigate(target) {
    if (!target) return

    const type = target.type || (target.channelId ? NavigationTargetType.CHANNEL : null)
    const targetId = target.targetId || target.channelId || target.taskId || target.threadId
    const extra = target.extra || {}

    if (!type || !targetId) return

    // Check custom handler first
    if (this.customNavigators.has(type)) {
      try {
        this.customNavigators.get(type)(targetId, extra)
        return
      } catch (err) {
        console.error(`[NavigationRouter] Custom navigator error for type ${type}:`, err)
      }
    }

    // Default navigators
    switch (type) {
      case NavigationTargetType.CHANNEL:
      case NavigationTargetType.DM:
        if (useChannelStore?.getState()?.setActiveChannel) {
          useChannelStore.getState().setActiveChannel(targetId)
        }
        break

      case NavigationTargetType.THREAD:
        if (extra.channelId && useChannelStore?.getState()?.setActiveChannel) {
          useChannelStore.getState().setActiveChannel(extra.channelId)
        }
        if (useChatStore?.getState()?.openThread) {
          useChatStore.getState().openThread({ rootMessageId: targetId, channelId: extra.channelId })
        }
        break

      case NavigationTargetType.TASK:
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('flowtask:navigate:task', { detail: { taskId: targetId, extra } }),
          )
        }
        break

      case NavigationTargetType.URL:
        if (typeof window !== 'undefined') {
          window.open(targetId, '_blank')
        }
        break

      default:
        console.warn(`[NavigationRouter] Unknown navigation type: ${type}`)
        break
    }
  }

  /**
   * Initialize listener for Electron native notification click events.
   */
  setup() {
    if (this.isInitialized) return
    this.isInitialized = true

    onDesktopNotificationClicked((data) => {
      if (!data) return
      // Data might contain navigationTarget object directly or legacy payload with channelId
      if (data.navigationTarget) {
        this.navigate(data.navigationTarget)
      } else if (data.channelId) {
        this.navigate({ type: NavigationTargetType.CHANNEL, targetId: data.channelId })
      } else if (data.taskId) {
        this.navigate({ type: NavigationTargetType.TASK, targetId: data.taskId })
      }
    })
  }
}

export const navigationRouter = new NavigationRouter()
