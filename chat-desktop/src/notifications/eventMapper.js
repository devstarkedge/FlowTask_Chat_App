/**
 * @file eventMapper.js
 * Event Normalizer and Mapper Layer.
 * Normalizes disparate socket, task, and application events into standard intermediate events.
 */

import { NotificationType } from './types.js'

class EventMapperRegistry {
  constructor() {
    /** @type {Map<string, (payload: any, context?: any) => any>} */
    this.mappers = new Map()

    // Register standard default mappers
    this._registerDefaultMappers()
  }

  /**
   * Register a custom event mapper function.
   * @param {string} eventType
   * @param {(payload: any, context?: any) => any} mapperFn
   */
  registerMapper(eventType, mapperFn) {
    if (typeof mapperFn === 'function') {
      this.mappers.set(eventType, mapperFn)
    }
  }

  /**
   * Normalizes a raw event payload into a standard intermediate event representation.
   * @param {string} rawEventType - Socket event name or custom event type
   * @param {any} payload - Raw payload
   * @param {Record<string, any>} [context] - Contextual state (active user ID, channels map, etc.)
   * @returns {Object|null}
   */
  normalize(rawEventType, payload, context = {}) {
    if (!payload) return null

    // Check if a dedicated mapper exists for rawEventType
    if (this.mappers.has(rawEventType)) {
      const mapper = this.mappers.get(rawEventType)
      try {
        return mapper(payload, context)
      } catch (err) {
        console.error(`[NotificationEventMapper] Error normalizing event ${rawEventType}:`, err)
        return null
      }
    }

    // Fallback: If payload is already a structured Notification record (e.g. from `notification` socket event)
    if (rawEventType === 'notification' || payload.type) {
      return this._mapNotificationRecord(payload, context)
    }

    return null
  }

  _registerDefaultMappers() {
    // 1. Message Create Event Mapper
    this.mappers.set('message:create', (payload, context = {}) => {
      const message = payload.message || payload
      const channelId = message.channelId != null ? String(message.channelId) : null
      const authorId = message.authorId?._id || message.authorId || message.author?._id
      const authorName = message.authorId?.name || message.author?.name || 'User'
      const authorAvatar = message.authorId?.avatar || message.author?.avatar

      // Determine specific type
      let type = NotificationType.NEW_MESSAGE
      if (message.content && message.content.includes('giphy.com')) {
        type = NotificationType.GIF_RECEIVED
      } else if (message.attachments && message.attachments.length > 0) {
        type = NotificationType.FILE_RECEIVED
      } else if (context.currentUserId && message.content && message.content.includes(`@${context.currentUserId}`)) {
        type = NotificationType.MENTION_RECEIVED
      }

      return {
        type,
        eventId: message._id || message.tempId || `msg_${Date.now()}`,
        messageId: message._id,
        channelId,
        conversationId: channelId,
        workspaceId: context.workspaceId,
        sender: {
          id: authorId,
          name: authorName,
          avatar: authorAvatar,
        },
        rawContent: message.content || '',
        attachments: message.attachments || [],
        threadId: message.threadId || null,
        metadata: {
          isGif: type === NotificationType.GIF_RECEIVED,
          isFile: type === NotificationType.FILE_RECEIVED,
          channelType: context.channelType || 'public',
        },
        timestamp: message.createdAt ? new Date(message.createdAt).getTime() : Date.now(),
      }
    })

    // 2. Message Update / Edit Event Mapper
    this.mappers.set('message:update', (payload, context = {}) => {
      const message = payload.message || payload
      return {
        type: NotificationType.MESSAGE_EDITED,
        eventId: `edit_${message._id}_${message.updatedAt || Date.now()}`,
        messageId: message._id,
        channelId: message.channelId != null ? String(message.channelId) : null,
        workspaceId: context.workspaceId,
        sender: {
          id: message.authorId?._id || message.authorId || message.author?._id,
          name: message.authorId?.name || message.author?.name || 'User',
        },
        rawContent: message.content || '',
        timestamp: Date.now(),
      }
    })

    // 3. Thread Reply Event Mapper
    this.mappers.set('thread:reply', (payload, context = {}) => {
      const message = payload.message || payload
      const rootMessageId = payload.rootMessageId || message.threadId
      const channelId = message.channelId != null ? String(message.channelId) : null
      const authorId = message.authorId?._id || message.authorId || message.author?._id

      return {
        type: NotificationType.THREAD_REPLY,
        eventId: message._id || `reply_${Date.now()}`,
        messageId: message._id,
        threadId: rootMessageId,
        channelId,
        conversationId: channelId,
        workspaceId: context.workspaceId,
        sender: {
          id: authorId,
          name: message.authorId?.name || message.author?.name || 'User',
          avatar: message.authorId?.avatar || message.author?.avatar,
        },
        rawContent: message.content || '',
        metadata: {
          rootMessageId,
        },
        timestamp: message.createdAt ? new Date(message.createdAt).getTime() : Date.now(),
      }
    })

    // 4. Reaction Add Event Mapper
    this.mappers.set('reaction:add', (payload, context = {}) => {
      return {
        type: NotificationType.REACTION_ADDED,
        eventId: `react_${payload.messageId}_${payload.userId}_${payload.emoji}`,
        messageId: payload.messageId,
        channelId: payload.channelId != null ? String(payload.channelId) : null,
        workspaceId: context.workspaceId,
        sender: {
          id: payload.userId,
          name: payload.userName || 'Someone',
        },
        rawContent: payload.emoji,
        metadata: {
          emoji: payload.emoji,
        },
        timestamp: Date.now(),
      }
    })

    // 5. Channel Created Mapper
    this.mappers.set('channel:created', (payload, context = {}) => {
      const channel = payload.channel || payload
      return {
        type: NotificationType.CHANNEL_CREATED,
        eventId: `chan_create_${channel._id}`,
        channelId: String(channel._id),
        workspaceId: context.workspaceId,
        sender: {
          id: channel.createdBy,
          name: 'System',
        },
        rawContent: channel.name || 'New Channel',
        metadata: {
          channelName: channel.name,
          channelType: channel.type,
        },
        timestamp: Date.now(),
      }
    })

    // 6. Member Joined Mapper
    this.mappers.set('member:joined', (payload, context = {}) => {
      return {
        type: NotificationType.MEMBER_ADDED,
        eventId: `member_join_${payload.channelId}_${payload.userId || Date.now()}`,
        channelId: String(payload.channelId),
        workspaceId: context.workspaceId,
        sender: {
          id: payload.userId,
          name: payload.userName || 'New Member',
        },
        rawContent: 'Joined the channel',
        timestamp: Date.now(),
      }
    })

    // 7. FlowTask Task Events Mapper (task:created, task:updated, task:deleted)
    const mapTaskEvent = (eventType, payload, context) => {
      const task = payload.task || payload.card || payload
      const taskId = task._id || task.id || payload.taskId || `task_${Date.now()}`
      const updaterName = payload.updaterName || payload.userName || 'FlowTask'

      let type = NotificationType.TASK_UPDATED
      if (eventType === 'task:created') type = NotificationType.TASK_CREATED
      if (eventType === 'task:deleted') type = NotificationType.TASK_DELETED

      return {
        type,
        eventId: `${type}_${taskId}_${payload.updatedAt || Date.now()}`,
        workspaceId: context.workspaceId || payload.workspaceId,
        sender: {
          id: payload.updaterId || payload.userId || 'system',
          name: updaterName,
        },
        rawContent: task.title || task.name || 'FlowTask item',
        metadata: {
          taskId,
          taskTitle: task.title || task.name,
          changes: payload.changes || null,
        },
        timestamp: Date.now(),
      }
    }

    this.mappers.set('task:created', (p, ctx) => mapTaskEvent('task:created', p, ctx))
    this.mappers.set('task:updated', (p, ctx) => mapTaskEvent('task:updated', p, ctx))
    this.mappers.set('task:deleted', (p, ctx) => mapTaskEvent('task:deleted', p, ctx))
  }

  _mapNotificationRecord(notification, context = {}) {
    const channelId = notification.channelId?._id || notification.channelId || notification.conversationId
    return {
      type: notification.type || NotificationType.SYSTEM_ALERT,
      eventId: notification._id || notification.id || `notif_${Date.now()}`,
      messageId: notification.messageId,
      channelId: channelId ? String(channelId) : undefined,
      conversationId: channelId ? String(channelId) : undefined,
      workspaceId: context.workspaceId || notification.workspaceId,
      sender: notification.sender || { id: 'system', name: notification.authorName || 'System' },
      rawTitle: notification.title,
      rawContent: notification.body || notification.content || '',
      priority: notification.priority || 'normal',
      metadata: notification.metadata || notification,
      timestamp: notification.createdAt ? new Date(notification.createdAt).getTime() : Date.now(),
    }
  }
}

export const eventMapper = new EventMapperRegistry()
