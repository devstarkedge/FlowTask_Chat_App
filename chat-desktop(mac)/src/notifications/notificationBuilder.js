/**
 * @file notificationBuilder.js
 * Notification Builder Layer.
 * Constructs clean, formatted NotificationEvent payloads with navigation targets.
 */

import { NotificationType, NotificationPriority, NavigationTargetType } from './types.js'

export class NotificationBuilder {
  /**
   * Strip HTML tags from text content.
   * @param {string} html
   * @returns {string}
   */
  static stripHtml(html) {
    if (!html) return ''
    return String(html)
      .replace(/<[^>]*>?/gm, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim()
  }

  /**
   * Build a standardized NotificationEvent from a normalized intermediate event.
   * @param {Object} intermediateEvent
   * @param {Object} [context]
   * @param {Array<Object>} [context.channels] - Channel list for name lookups
   * @returns {import('./types.js').NotificationEvent}
   */
  static build(intermediateEvent, context = {}) {
    if (!intermediateEvent) return null

    const {
      type,
      eventId,
      messageId,
      channelId,
      workspaceId,
      sender,
      rawContent,
      rawTitle,
      metadata = {},
      threadId,
      timestamp,
      priority,
    } = intermediateEvent

    const channels = context.channels || []
    const channel = channelId ? channels.find((c) => String(c._id) === String(channelId)) : null
    const isDm = channel?.type === 'dm' || metadata.channelType === 'dm'
    const channelName = channel ? channel.name : null

    let senderName = sender?.name
    if (!senderName || senderName === 'User' || senderName === 'Someone' || senderName === 'Teammate') {
      if (isDm && channelName) {
        senderName = channelName
      } else if (!senderName) {
        senderName = 'Teammate'
      }
    }

    let title = rawTitle || ''
    let body = this.stripHtml(rawContent) || ''
    let navTargetType = isDm ? NavigationTargetType.DM : NavigationTargetType.CHANNEL
    let navTargetId = channelId
    let calculatedPriority = priority || NotificationPriority.NORMAL
    let extraNav = {}

    switch (type) {
      case NotificationType.NEW_MESSAGE:
        if (isDm) {
          title = senderName || channelName || 'Direct Message'
          body = body || 'Sent a message'
        } else {
          title = channelName ? `#${channelName}` : 'New Message'
          body = `${senderName}: ${body || 'Sent a message'}`
        }
        break

      case NotificationType.GIF_RECEIVED:
        if (isDm) {
          title = senderName || channelName || 'Direct Message'
          body = 'GIF'
        } else {
          title = channelName ? `#${channelName}` : 'New GIF'
          body = `${senderName}: GIF`
        }
        break

      case NotificationType.FILE_RECEIVED:
        if (isDm) {
          title = senderName || channelName || 'Direct Message'
          body = 'Sent an attachment'
        } else {
          title = channelName ? `#${channelName}` : 'New Attachment'
          body = `${senderName}: Sent an attachment`
        }
        break

      case NotificationType.MENTION_RECEIVED:
        title = `Mentioned by ${senderName}`
        body = channelName ? `#${channelName}: ${body}` : body
        calculatedPriority = NotificationPriority.HIGH
        break

      case NotificationType.THREAD_REPLY:
        title = channelName ? `Reply in #${channelName}` : `Thread reply from ${senderName}`
        body = `${senderName}: ${body}`
        navTargetType = NavigationTargetType.THREAD
        navTargetId = threadId || messageId
        extraNav = { channelId }
        break

      case NotificationType.REACTION_ADDED:
        title = `${senderName} reacted ${metadata.emoji || ''}`
        body = channelName ? `In #${channelName}` : 'In chat'
        calculatedPriority = NotificationPriority.LOW
        break

      case NotificationType.CHANNEL_CREATED:
        title = 'New Channel Created'
        body = `#${metadata.channelName || rawContent}`
        break

      case NotificationType.MEMBER_ADDED:
        title = 'Member Joined'
        body = `${senderName} joined ${channelName ? `#${channelName}` : 'the channel'}`
        calculatedPriority = NotificationPriority.LOW
        break

      case NotificationType.TASK_CREATED:
        title = `Task Created: ${metadata.taskTitle || 'FlowTask Item'}`
        body = `Created by ${senderName}`
        navTargetType = NavigationTargetType.TASK
        navTargetId = metadata.taskId
        break

      case NotificationType.TASK_UPDATED:
        title = `Task Updated: ${metadata.taskTitle || 'FlowTask Item'}`
        body = `Updated by ${senderName}`
        navTargetType = NavigationTargetType.TASK
        navTargetId = metadata.taskId
        break

      case NotificationType.TASK_DELETED:
        title = `Task Deleted: ${metadata.taskTitle || 'FlowTask Item'}`
        body = `Deleted by ${senderName}`
        navTargetType = NavigationTargetType.TASK
        navTargetId = metadata.taskId
        break

      case NotificationType.SYSTEM_ALERT:
      default:
        title = title || 'Notification'
        body = body || 'You have a new update'
        if (!navTargetId && metadata.targetId) {
          navTargetId = metadata.targetId
        }
        break
    }

    const navigationTarget = navTargetId
      ? {
          type: navTargetType,
          targetId: String(navTargetId),
          extra: Object.keys(extraNav).length > 0 ? extraNav : undefined,
        }
      : undefined

    return {
      type,
      eventId: String(eventId || `event_${Date.now()}`),
      workspaceId,
      channelId: channelId ? String(channelId) : undefined,
      conversationId: channelId ? String(channelId) : undefined,
      messageId: messageId ? String(messageId) : undefined,
      sender: {
        id: sender?.id || 'user',
        name: senderName,
        avatar: sender?.avatar,
      },
      title,
      body,
      priority: calculatedPriority,
      metadata,
      navigationTarget,
      timestamp: timestamp || Date.now(),
    }
  }
}
