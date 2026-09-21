/**
 * @file config.js
 * Centralized notification configuration and preference bindings.
 */

import { NotificationType, ActiveConversationBehavior } from './types.js'

class NotificationConfig {
  constructor() {
    this.config = {
      enabledEventTypes: new Set(Object.values(NotificationType)),
      soundBehavior: {
        enabled: true,
        volume: 1.0,
      },
      activeConversationBehavior: ActiveConversationBehavior.ALLOW_CRITICAL,
      navigationBehavior: 'focus_and_navigate',
      desktopNotificationsEnabled: true,
    }
  }

  /**
   * Get complete current configuration.
   */
  getConfig() {
    return {
      ...this.config,
      enabledEventTypes: new Set(this.config.enabledEventTypes),
    }
  }

  /**
   * Check if a given notification type is enabled.
   * @param {string} type
   * @returns {boolean}
   */
  isEnabled(type) {
    if (!this.config.desktopNotificationsEnabled) return false
    if (!type) return true
    return this.config.enabledEventTypes.has(type)
  }

  /**
   * Enable a specific notification type.
   * @param {string} type
   */
  enableEventType(type) {
    this.config.enabledEventTypes.add(type)
  }

  /**
   * Disable a specific notification type.
   * @param {string} type
   */
  disableEventType(type) {
    this.config.enabledEventTypes.delete(type)
  }

  /**
   * Update configuration properties.
   * @param {Partial<typeof this.config>} updates
   */
  updateConfig(updates) {
    if (!updates) return
    if (updates.enabledEventTypes) {
      this.config.enabledEventTypes = new Set(updates.enabledEventTypes)
    }
    if (updates.soundBehavior) {
      this.config.soundBehavior = { ...this.config.soundBehavior, ...updates.soundBehavior }
    }
    if (updates.activeConversationBehavior) {
      this.config.activeConversationBehavior = updates.activeConversationBehavior
    }
    if (updates.navigationBehavior) {
      this.config.navigationBehavior = updates.navigationBehavior
    }
    if (typeof updates.desktopNotificationsEnabled === 'boolean') {
      this.config.desktopNotificationsEnabled = updates.desktopNotificationsEnabled
    }
  }

  /**
   * Sync settings with user preferences state (e.g., from authStore or notificationStore).
   * @param {Object} userChatPreferences
   */
  syncUserPreferences(userChatPreferences) {
    if (!userChatPreferences) return
    this.updateConfig({
      desktopNotificationsEnabled: userChatPreferences.desktopNotifications !== false,
      soundBehavior: {
        enabled: userChatPreferences.notificationSound !== false,
      },
    })
  }
}

export const notificationConfig = new NotificationConfig()
