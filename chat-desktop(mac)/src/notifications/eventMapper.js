/**
 * @file eventMapper.js
 * Event Normalizer and Mapper Layer.
 * Normalizes disparate socket, task, and application events into standard intermediate events.
 */

import { NotificationType } from './types.js'
import { useAuthStore } from '../stores/authStore.js'
import { useWorkspaceStore } from '../stores/workspaceStore.js'
import { useChannelStore } from '../stores/channelStore.js'
import { useUserProfileStore } from '../stores/userProfileStore.js'

/**
 * Robustly resolve sender name, ID, and avatar across objects, snapshots, stores, and channels.
 * @param {Object} payload
 * @param {Object} [context]
 * @returns {{ id: string, name: string, avatar?: string }}
 */
export function resolveSender(payload, context = {}) {
  if (!payload) return { id: 'system', name: 'System' }
  const message = payload.message || payload

  // 1. Direct object property checks
  const authorObj =
    (typeof message.authorId === 'object' && message.authorId) ||
    (typeof message.author === 'object' && message.author) ||
    (typeof message.sender === 'object' && message.sender) ||
    (typeof message.senderSnapshot === 'object' && message.senderSnapshot) ||
    (typeof payload.authorId === 'object' && payload.authorId) ||
    (typeof payload.author === 'object' && payload.author) ||
    (typeof payload.sender === 'object' && payload.sender) ||
    (typeof payload.senderSnapshot === 'object' && payload.senderSnapshot) ||
    null

  const directName =
    authorObj?.name ||
    authorObj?.fullName ||
    authorObj?.displayName ||
    authorObj?.username ||
    message.authorName ||
    message.senderName ||
    message.userName ||
    payload.authorName ||
    payload.senderName ||
    payload.userName ||
    payload.author_name ||
    payload.updaterName ||
    payload.deleterName

  const authorId =
    (typeof message.authorId === 'string' && message.authorId) ||
    authorObj?._id ||
    authorObj?.id ||
    message.authorId?._id ||
    message.author?._id ||
    message.sender?._id ||
    message.userId ||
    payload.userId ||
    payload.authorId ||
    payload.senderId ||
    payload.updaterId ||
    payload.deleterId

  const authorAvatar =
    authorObj?.avatar ||
    authorObj?.avatarUrl ||
    message.authorAvatar ||
    message.senderAvatar ||
    payload.avatar

  if (directName && directName !== 'User' && directName !== 'Unknown') {
    return { id: String(authorId || 'user'), name: directName, avatar: authorAvatar }
  }

  // 2. Check if author is current logged-in user
  const currentUser = useAuthStore?.getState ? useAuthStore.getState()?.user : null
  if (currentUser && authorId && (String(authorId) === String(currentUser._id) || String(authorId) === String(currentUser.flowTaskUserId))) {
    return { id: String(authorId), name: currentUser.name || currentUser.username || 'You', avatar: currentUser.avatar }
  }

  // 3. Lookup in workspaceStore members
  if (authorId) {
    const wsMembers = useWorkspaceStore?.getState ? useWorkspaceStore.getState()?.members || [] : []
    const wsMember = wsMembers.find(
      (m) =>
        String(m._id || m.userId || m.id || m.flowTaskUserId) === String(authorId),
    )
    if (wsMember?.name || wsMember?.displayName) {
      return {
        id: String(authorId),
        name: wsMember.name || wsMember.displayName,
        avatar: wsMember.avatar || authorAvatar,
      }
    }

    // 4. Lookup in channelStore membersByChannel
    const channelId = message.channelId || payload.channelId || context.channelId
    if (channelId) {
      const channelMembers = useChannelStore?.getState ? useChannelStore.getState()?.membersByChannel?.[String(channelId)] || [] : []
      const chMember = channelMembers.find(
        (m) => String(m._id || m.userId || m.id) === String(authorId),
      )
      if (chMember?.name || chMember?.displayName) {
        return {
          id: String(authorId),
          name: chMember.name || chMember.displayName,
          avatar: chMember.avatar || authorAvatar,
        }
      }
    }

    // 5. Lookup in userProfileStore
    const workspaceId = context.workspaceId || (useWorkspaceStore?.getState ? useWorkspaceStore.getState()?.activeWorkspaceId : null)
    if (workspaceId) {
      const profiles = useUserProfileStore?.getState ? useUserProfileStore.getState()?.profilesByWorkspace?.[workspaceId] || {} : {}
      const profile = profiles[String(authorId)]
      if (profile?.name) {
        return { id: String(authorId), name: profile.name, avatar: profile.avatar || authorAvatar }
      }
    }
  }

  // 6. DM channel fallback name if this is a DM channel
  const channelId = message.channelId || payload.channelId || context.channelId
  if (channelId) {
    const channels = useChannelStore?.getState ? useChannelStore.getState()?.channels || [] : []
    const ch = channels.find((c) => String(c._id) === String(channelId))
    if (ch && ch.type === 'dm' && ch.name) {
      return { id: String(authorId || 'user'), name: ch.name, avatar: ch.avatar || authorAvatar }
    }
  }

  // Fallback
  return { id: String(authorId || 'user'), name: directName || 'Teammate', avatar: authorAvatar }
}

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
      const sender = resolveSender(payload, context)

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
        sender,
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
      const sender = resolveSender(payload, context)
      return {
        type: NotificationType.MESSAGE_EDITED,
        eventId: `edit_${message._id}_${message.updatedAt || Date.now()}`,
        messageId: message._id,
        channelId: message.channelId != null ? String(message.channelId) : null,
        workspaceId: context.workspaceId,
        sender,
        rawContent: message.content || '',
        timestamp: Date.now(),
      }
    })

    // 3. Thread Reply Event Mapper
    this.mappers.set('thread:reply', (payload, context = {}) => {
      const message = payload.message || payload
      const rootMessageId = payload.rootMessageId || message.threadId
      const channelId = message.channelId != null ? String(message.channelId) : null
      const sender = resolveSender(payload, context)

      return {
        type: NotificationType.THREAD_REPLY,
        eventId: message._id || `reply_${Date.now()}`,
        messageId: message._id,
        threadId: rootMessageId,
        channelId,
        conversationId: channelId,
        workspaceId: context.workspaceId,
        sender,
        rawContent: message.content || '',
        metadata: {
          rootMessageId,
        },
        timestamp: message.createdAt ? new Date(message.createdAt).getTime() : Date.now(),
      }
    })

    // 4. Reaction Add Event Mapper
    this.mappers.set('reaction:add', (payload, context = {}) => {
      const sender = resolveSender(payload, context)
      return {
        type: NotificationType.REACTION_ADDED,
        eventId: `react_${payload.messageId}_${payload.userId}_${payload.emoji}`,
        messageId: payload.messageId,
        channelId: payload.channelId != null ? String(payload.channelId) : null,
        workspaceId: context.workspaceId,
        sender,
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
          id: String(channel.createdBy || 'system'),
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
      const sender = resolveSender(payload, context)
      return {
        type: NotificationType.MEMBER_ADDED,
        eventId: `member_join_${payload.channelId}_${payload.userId || Date.now()}`,
        channelId: String(payload.channelId),
        workspaceId: context.workspaceId,
        sender,
        rawContent: 'Joined the channel',
        timestamp: Date.now(),
      }
    })

    // 7. FlowTask Task Events Mapper (task:created, task:updated, task:deleted)
    const mapTaskEvent = (eventType, payload, context) => {
      const task = payload.task || payload.card || payload
      const taskId = task._id || task.id || payload.taskId || `task_${Date.now()}`
      const sender = resolveSender(payload, context)

      let type = NotificationType.TASK_UPDATED
      if (eventType === 'task:created') type = NotificationType.TASK_CREATED
      if (eventType === 'task:deleted') type = NotificationType.TASK_DELETED

      return {
        type,
        eventId: `${type}_${taskId}_${payload.updatedAt || Date.now()}`,
        workspaceId: context.workspaceId || payload.workspaceId,
        sender,
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
    const sender = resolveSender(notification, context)

    return {
      type: notification.type || NotificationType.SYSTEM_ALERT,
      eventId: notification._id || notification.id || `notif_${Date.now()}`,
      messageId: notification.messageId,
      channelId: channelId ? String(channelId) : undefined,
      conversationId: channelId ? String(channelId) : undefined,
      workspaceId: context.workspaceId || notification.workspaceId,
      sender,
      rawTitle: notification.title,
      rawContent: notification.body || notification.content || '',
      priority: notification.priority || 'normal',
      metadata: notification.metadata || notification,
      timestamp: notification.createdAt ? new Date(notification.createdAt).getTime() : Date.now(),
    }
  }
}

export const eventMapper = new EventMapperRegistry()
