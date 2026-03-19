import { io } from 'socket.io-client'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { useChannelStore } from '../stores/channelStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useNotificationStore } from '../stores/notificationStore'
import { throttle } from '../utils/throttle'
import logger from '../utils/logger'

let socket = null

function getSocketUrl() {
  const explicit = import.meta.env.VITE_SOCKET_URL
  if (explicit) return explicit

  const apiBase = import.meta.env.VITE_API_BASE_URL
  if (apiBase && /^https?:\/\//i.test(apiBase)) {
    try {
      return new URL(apiBase).origin
    } catch {
      // fall through
    }
  }

  return window.location.origin
}

function getSocketAuth() {
  return {
    token: useAuthStore.getState().accessToken,
    workspaceId: useWorkspaceStore.getState().activeWorkspaceId,
  }
}

const SOCKET_EVENTS = {
  // Messages (renamed to enterprise standard)
  MESSAGE_CREATE: 'message:create',
  MESSAGE_UPDATE: 'message:update',
  MESSAGE_DELETE: 'message:delete',
  MESSAGE_ACK: 'message:ack',
  MESSAGE_PINNED: 'message:pinned',
  MESSAGE_UNPINNED: 'message:unpinned',
  MESSAGE_STATUS: 'message:status',

  // Reactions
  REACTION_ADD: 'reaction:add',
  REACTION_REMOVE: 'reaction:remove',

  // Typing
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',

  // Presence
  USER_ONLINE: 'presence:online',
  USER_OFFLINE: 'presence:offline',
  USER_AWAY: 'presence:away',

  // Channels
  CHANNEL_ADDED: 'channel:added',
  CHANNEL_REMOVED: 'channel:removed',
  CHANNEL_UPDATED: 'channel:updated',
  MEMBER_JOINED: 'channel:member_joined',
  MEMBER_LEFT: 'channel:member_left',
  CHANNEL_MEMBERS_UPDATED: 'channel:members:updated',

  // Threads
  THREAD_CREATED: 'thread:created',
  THREAD_UPDATED: 'thread:updated',
  THREAD_REPLY: 'thread:reply',

  // Other
  NOTIFICATION: 'notification',
  UNREAD_UPDATED: 'unread:updated',
}

export function connectSocket() {
  const { token, workspaceId } = getSocketAuth()
  if (!token || !workspaceId) return
  if (socket?.connected) return socket

  const explicitSocketUrl = import.meta.env.VITE_SOCKET_URL
  if (!explicitSocketUrl) {
    logger.error(
      '[Socket] VITE_SOCKET_URL is not set. Deriving socket origin from VITE_API_BASE_URL/window.origin. ' +
      'For production, set VITE_SOCKET_URL explicitly to avoid cross-domain websocket failures.'
    )
  }

  const socketUrl = getSocketUrl()

  // Reuse existing disconnected instance instead of creating duplicate clients.
  if (socket && !socket.connected) {
    socket.auth = getSocketAuth()
    useChatStore.getState().setConnectionStatus('connecting')
    socket.connect()
    return socket
  }

  useChatStore.getState().setConnectionStatus('connecting')

  socket = io(socketUrl, {
    auth: (cb) => cb(getSocketAuth()),
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  })

  socket.on('connect', () => {
    logger.log('[Socket] Connected:', socket.id)
    useChatStore.getState().setConnectionStatus('connected')

    // Join all channel rooms on initial connect
    try {
      const channels = useChannelStore.getState().channels
      for (const ch of channels) {
        socket.emit('channel:join', ch._id)
      }
    } catch (err) {
      logger.error('[Socket] Failed to join channels on connect:', err.message)
    }
  })

  socket.on('disconnect', (reason) => {
    logger.log('[Socket] Disconnected:', reason)
    useChatStore.getState().setConnectionStatus('disconnected')
  })

  socket.on('reconnect_attempt', (attempt) => {
    socket.auth = getSocketAuth()
    logger.log('[Socket] Reconnecting... attempt', attempt)
    useChatStore.getState().setConnectionStatus('connecting')
  })

  socket.on('reconnect', (attempt) => {
    logger.log('[Socket] Reconnected after', attempt, 'attempts')
    useChatStore.getState().setConnectionStatus('connected')
    // Re-sync channels, unreads, rejoin rooms, and fill message gaps
    try {
      const channelStore = useChannelStore.getState()
      channelStore.fetchChannels().then(() => {
        // Rejoin all channel rooms
        const channels = useChannelStore.getState().channels
        for (const ch of channels) {
          socket.emit('channel:join', ch._id)
        }
        // Rejoin active channel and sync missed messages
        const activeChannelId = channelStore.activeChannelId
        if (activeChannelId) {
          socket.emit('channel:join', activeChannelId)
          // Fetch fresh messages to fill any gap
          useChatStore.getState().fetchMessages(activeChannelId)
        }
        // Refresh unreads
        channelStore.fetchUnreads()
      })
    } catch (err) {
      logger.error('[Socket] Failed to re-sync after reconnect:', err.message)
    }
  })

  socket.on('connect_error', (err) => {
    const freshAuth = getSocketAuth()
    socket.auth = freshAuth

    logger.error('[Socket] Connection error:', err.message)

    if (!freshAuth.token || !freshAuth.workspaceId) {
      logger.warn('[Socket] Missing token/workspace for socket auth, disconnecting')
      socket.disconnect()
      useChatStore.getState().setConnectionStatus('disconnected')
      return
    }

    // If auth failed (often due stale token), retry with latest auth payload.
    if (err.message?.includes('auth') || err.message?.includes('token') || err.message?.includes('unauthorized')) {
      logger.warn('[Socket] Auth error detected, retrying with fresh auth context')
      useChatStore.getState().setConnectionStatus('connecting')
      setTimeout(() => {
        if (socket && !socket.connected) {
          socket.connect()
        }
      }, 600)
    }
  })

  // ─── Message Events ──────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.MESSAGE_CREATE, ({ message }) => {
    const currentUserId = useAuthStore.getState().user?._id
    // Skip if this is our own message (handled via optimistic UI + ACK)
    if (message.tempId && message.authorId === currentUserId) return

    // Safety guard: never add thread replies to main chat via MESSAGE_CREATE
    if (message.threadId) return

    useChatStore.getState().addMessage(message)
  })

  // ─── Thread Reply Events ──────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.THREAD_REPLY, ({ message, rootMessageId }) => {
    const currentUserId = useAuthStore.getState().user?._id
    // Skip if this is our own message (handled via optimistic UI + ACK)
    if (message.tempId && message.authorId === currentUserId) return

    const resolvedRootId = rootMessageId || message.threadId
    if (resolvedRootId) {
      useChatStore.getState().addThreadReply(resolvedRootId, message)
      // Increment reply count on root message in main channel
      if (message.channelId) {
        useChatStore.getState().incrementReplyCount(resolvedRootId, message.channelId)
      }
    }
  })

  socket.on(SOCKET_EVENTS.MESSAGE_ACK, ({ tempId, message, rootMessageId }) => {
    // Reconcile optimistic message with server-confirmed message
    if (message.threadId) {
      // Use rootMessageId from ACK payload (matches threadRepliesByRoot store key)
      // Fallback to message.threadId only if rootMessageId not provided
      const resolvedRootId = rootMessageId || message.threadId
      useChatStore.getState().reconcileThreadReply(resolvedRootId, tempId, message)
    } else {
      useChatStore.getState().reconcileMessage(tempId, message)
    }
  })

  socket.on(SOCKET_EVENTS.MESSAGE_UPDATE, ({ message }) => {
    useChatStore.getState().updateMessage(message)
  })

  socket.on(SOCKET_EVENTS.MESSAGE_DELETE, ({ messageId, channelId, isDeleted }) => {
    if (isDeleted) {
      // Soft delete — render tombstone UI
      useChatStore.getState().softDeleteMessage(messageId, channelId)
    } else {
      useChatStore.getState().removeMessage(messageId, channelId)
    }
  })

  // ─── Message Delivery Status Events ──────────────────────────────────────
  socket.on(SOCKET_EVENTS.MESSAGE_STATUS, ({ messageId, messageIds, channelId, status, deliveredAt, seenAt }) => {
    useChatStore.getState().updateMessageStatus(channelId, messageId, messageIds, status, { deliveredAt, seenAt })
  })

  // ─── Pin Events ─────────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.MESSAGE_PINNED, (payload) => {
    useChatStore.getState().handleMessagePinned(payload)
  })

  socket.on(SOCKET_EVENTS.MESSAGE_UNPINNED, (payload) => {
    useChatStore.getState().handleMessageUnpinned(payload)
  })

  // ─── Reaction Events ────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.REACTION_ADD, ({ messageId, userId, emoji, channelId }) => {
    useChatStore.getState().addReactionLocal(messageId, userId, emoji, channelId)
  })

  socket.on(SOCKET_EVENTS.REACTION_REMOVE, ({ messageId, userId, emoji, channelId }) => {
    useChatStore.getState().removeReactionLocal(messageId, userId, emoji, channelId)
  })

  // ─── Typing Events ──────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.TYPING_START, ({ channelId, userId, name }) => {
    useChatStore.getState().setTyping(channelId, userId, name)
  })

  socket.on(SOCKET_EVENTS.TYPING_STOP, ({ channelId, userId }) => {
    useChatStore.getState().clearTyping(channelId, userId)
  })

  // ─── Channel Events ─────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.CHANNEL_ADDED, ({ channel }) => {
    useChannelStore.getState().addChannel(channel)
  })

  socket.on(SOCKET_EVENTS.CHANNEL_REMOVED, ({ channelId }) => {
    useChannelStore.getState().removeChannel(channelId)
  })

  socket.on(SOCKET_EVENTS.CHANNEL_UPDATED, ({ channelId, updates }) => {
    useChannelStore.getState().updateChannel(channelId, updates)
  })

  // ─── Member Events ──────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.MEMBER_JOINED, ({ channelId }) => {
    const activeId = useChannelStore.getState().activeChannelId
    if (channelId === activeId) {
      useChannelStore.getState().fetchMembers(channelId)
    }
  })

  socket.on(SOCKET_EVENTS.MEMBER_LEFT, ({ channelId }) => {
    const activeId = useChannelStore.getState().activeChannelId
    if (channelId === activeId) {
      useChannelStore.getState().fetchMembers(channelId)
    }
  })

  socket.on(SOCKET_EVENTS.CHANNEL_MEMBERS_UPDATED, ({ channelId }) => {
    const activeId = useChannelStore.getState().activeChannelId
    if (channelId === activeId) {
      useChannelStore.getState().fetchMembers(channelId)
    }
  })

  // ─── Presence Events ────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.USER_ONLINE, ({ userId, name }) => {
    useChatStore.getState().setUserOnline(userId, name)
  })

  socket.on(SOCKET_EVENTS.USER_OFFLINE, ({ userId }) => {
    useChatStore.getState().setUserOffline(userId)
  })

  socket.on(SOCKET_EVENTS.USER_AWAY, ({ userId }) => {
    useChatStore.getState().setUserAway(userId)
  })

  // ─── Unread Events ──────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.UNREAD_UPDATED, ({ channelId, unreadCount }) => {
    useChannelStore.getState().updateUnread(channelId, unreadCount)
  })

  // ─── Notification Events ────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.NOTIFICATION, ({ notification }) => {
    if (!notification) return

    // Suppress notification if user is actively viewing the channel
    const activeChannelId = useChannelStore.getState().activeChannelId
    if (notification.channelId && notification.channelId === activeChannelId && document.hasFocus()) {
      return
    }
    // Persist to notification store
    useNotificationStore.getState().addNotification(notification)
    // Also keep legacy in-memory notification for toast/badge
    useChatStore.getState().addNotification(notification)
  })

  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

/**
 * Reconnect socket with a new workspace context.
 * Tries server-side workspace:switch first (no disconnect needed).
 * Falls back to full reconnect if socket is not connected.
 */
export function reconnectWithWorkspace() {
  const workspaceId = useWorkspaceStore.getState().activeWorkspaceId

  // Clear transient state across all stores
  useNotificationStore.getState().clearNotifications()
  useChatStore.getState().clearAllTyping?.()

  // If socket is connected, try in-place workspace switch
  if (socket?.connected && workspaceId) {
    const onSwitched = () => {
      socket.off('workspace:switched', onSwitched)
      useChannelStore.getState().fetchChannels()
      useNotificationStore.getState().fetchNotifications(true)
      useNotificationStore.getState().fetchUnreadCount()
    }
    socket.on('workspace:switched', onSwitched)
    socket.emit('workspace:switch', workspaceId)
    return
  }

  // Fallback: full disconnect/reconnect
  disconnectSocket()
  connectSocket()

  if (socket) {
    const onConnect = () => {
      useChannelStore.getState().fetchChannels()
      useNotificationStore.getState().fetchNotifications(true)
      useNotificationStore.getState().fetchUnreadCount()
      socket.off('connect', onConnect)
    }
    if (socket.connected) {
      onConnect()
    } else {
      socket.on('connect', onConnect)
    }
  }
}

// ─── Throttled typing emission (max 1 per 2 seconds) ────────────────────────
const _throttledTypingEmitters = new Map()

export function emitTypingStart(channelId) {
  if (!_throttledTypingEmitters.has(channelId)) {
    _throttledTypingEmitters.set(
      channelId,
      throttle(() => {
        socket?.emit('typing:start', { channelId })
      }, 2000),
    )
  }
  _throttledTypingEmitters.get(channelId)()
}

export function emitTypingStop(channelId) {
  // Cancel any pending throttled typing start
  const throttled = _throttledTypingEmitters.get(channelId)
  if (throttled) throttled.cancel()

  socket?.emit('typing:stop', { channelId })
}

export function joinChannel(channelId) {
  socket?.emit('channel:join', channelId)
}

export function leaveChannel(channelId) {
  socket?.emit('channel:leave', channelId)
}

export function emitPresenceUpdate(status) {
  socket?.emit('presence:update', { status })
}

export function getSocket() {
  return socket
}
