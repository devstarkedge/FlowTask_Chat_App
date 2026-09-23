/**
 * @file notificationService.js
 * Central Notification Service Layer.
 * Pipeline: Socket/Event → Normalizer → Builder → Deduplication → Active Checks → Delivery → Router
 */

import { notificationConfig } from './config.js'
import { eventMapper } from './eventMapper.js'
import { NotificationBuilder } from './notificationBuilder.js'
import { deduplicationManager } from './deduplicationManager.js'
import { navigationRouter } from './navigationRouter.js'
import { showDesktopNotification } from '../services/desktopService.js'
import { useAuthStore } from '../stores/authStore.js'
import { useChannelStore } from '../stores/channelStore.js'
import { useNotificationStore } from '../stores/notificationStore.js'
import { NotificationPriority, ActiveConversationBehavior } from './types.js'

export class NotificationService {
  constructor() {
    this.audioCache = null
  }

  /**
   * Process an incoming raw event payload through the central notification pipeline.
   * @param {string} rawEventType - Socket event name or internal type
   * @param {any} rawPayload - Raw event data
   * @param {Record<string, any>} [extraContext] - Extra runtime context
   * @returns {import('./types.js').NotificationEvent|null} Built event or null if suppressed/duplicate
   */
  processEvent(rawEventType, rawPayload, extraContext = {}) {
    if (!rawEventType || !rawPayload) return null

    // 1. Gather context
    const authState = useAuthStore?.getState ? useAuthStore.getState() : {}
    const channelState = useChannelStore?.getState ? useChannelStore.getState() : {}
    const notifState = useNotificationStore?.getState ? useNotificationStore.getState() : {}

    const currentUserId = authState.user?._id
    const workspaceId = extraContext.workspaceId || authState.user?.workspaceId

    // Sync current preferences into config
    if (authState.user?.chatPreferences) {
      notificationConfig.syncUserPreferences(authState.user.chatPreferences)
    }

    const context = {
      currentUserId,
      workspaceId,
      channels: channelState.channels || [],
      ...extraContext,
    }

    // 2. Event Normalizer / Mapper
    const intermediateEvent = eventMapper.normalize(rawEventType, rawPayload, context)
    if (!intermediateEvent) return null

    // Self-message suppression (don't notify user of their own messages unless explicit test)
    const authorId = intermediateEvent.sender?.id
    if (currentUserId && authorId && String(authorId) === String(currentUserId) && !extraContext.allowSelf) {
      return null
    }

    // 3. Notification Builder
    const notificationEvent = NotificationBuilder.build(intermediateEvent, context)
    if (!notificationEvent) return null

    // 4. Config enablement check
    if (!notificationConfig.isEnabled(notificationEvent.type)) {
      return null
    }

    // 5. Deduplication Manager
    if (deduplicationManager.checkAndTrack(notificationEvent)) {
      // Event is a duplicate — suppress
      return null
    }

    // 6. Active Conversation & Mute / Pause Checks
    const isSuppressed = this.shouldSuppressNotification(notificationEvent, {
      activeChannelId: channelState.activeChannelId,
      notifStore: notifState,
      currentUserId,
    })

    if (isSuppressed) {
      return notificationEvent
    }

    // 7. Delivery
    this.deliverNotification(notificationEvent)

    return notificationEvent
  }

  /**
   * Determine if notification should be suppressed based on active focus, mute, and DND settings.
   * @param {import('./types.js').NotificationEvent} event
   * @param {Object} options
   * @returns {boolean}
   */
  shouldSuppressNotification(event, { activeChannelId, notifStore }) {
    const isCritical = event.priority === NotificationPriority.HIGH

    // Check pause / DND mode
    if (notifStore?.isPaused && !isCritical) {
      return true
    }

    // Check channel mute / paused status
    const channelId = event.channelId || event.conversationId
    if (channelId && notifStore?.preferences?.channels) {
      const channelPrefs =
        notifStore.preferences.channels[channelId] ||
        notifStore.preferences.channels[String(channelId)]
      if ((channelPrefs?.muted || channelPrefs?.paused) && !isCritical) {
        return true
      }
    }

    // Check active conversation view & window focus
    const config = notificationConfig.getConfig()
    if (
      config.activeConversationBehavior === ActiveConversationBehavior.SUPPRESS ||
      (config.activeConversationBehavior === ActiveConversationBehavior.ALLOW_CRITICAL && !isCritical)
    ) {
      const isViewingActiveChannel =
        activeChannelId && channelId && String(channelId) === String(activeChannelId)
      const isDocumentFocused =
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible' &&
        (typeof document.hasFocus === 'function' ? document.hasFocus() : true)

      if (isViewingActiveChannel && isDocumentFocused) {
        return true
      }
    }

    return false
  }

  /**
   * Deliver notification to native Electron, in-app store, and play audio alert.
   * @param {import('./types.js').NotificationEvent} event
   */
  deliverNotification(event) {
    // A. Native Desktop Notification (Electron or Browser Web API)
    showDesktopNotification(event.title, {
      body: event.body,
      data: {
        eventId: event.eventId,
        channelId: event.channelId,
        navigationTarget: event.navigationTarget,
      },
    })

    // B. In-App Notification Store
    const notifStore = useNotificationStore?.getState ? useNotificationStore.getState() : null
    if (notifStore?.addNotification) {
      notifStore.addNotification({
        _id: event.eventId,
        type: event.type,
        title: event.title,
        body: event.body,
        channelId: event.channelId,
        sender: event.sender,
        priority: event.priority,
        metadata: event.metadata,
        navigationTarget: event.navigationTarget,
        createdAt: new Date(event.timestamp || Date.now()).toISOString(),
      })
    }

    // C. Audio sound alert (if enabled)
    this.playSoundAlert()
  }

  /**
   * Play notification alert sound if sound enabled in config.
   */
  playSoundAlert() {
    const config = notificationConfig.getConfig()
    if (!config.soundBehavior?.enabled) return

    try {
      if (typeof window !== 'undefined' && window.Audio) {
        if (!this.audioCache) {
          this.audioCache = new Audio('/sounds/notification.mp3')
        }
        this.audioCache.currentTime = 0
        this.audioCache.play().catch(() => {
          // Ignore autoplay restriction errors in browsers
        })
      }
    } catch {
      // Audio playback silent fallback
    }
  }

  /**
   * Setup click navigation router.
   */
  setupNavigation() {
    navigationRouter.setup()
  }
}

export const notificationService = new NotificationService()
