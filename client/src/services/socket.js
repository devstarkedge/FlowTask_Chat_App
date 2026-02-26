import { io } from 'socket.io-client'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { useChannelStore } from '../stores/channelStore'
import { throttle } from '../utils/throttle'

let socket = null

const SOCKET_EVENTS = {
  // Messages (renamed to enterprise standard)
  MESSAGE_CREATE: 'message:create',
  MESSAGE_UPDATE: 'message:update',
  MESSAGE_DELETE: 'message:delete',
  MESSAGE_ACK: 'message:ack',
  MESSAGE_PINNED: 'message:pinned',
  MESSAGE_UNPINNED: 'message:unpinned',

  // Reactions
  REACTION_ADD: 'reaction:add',
  REACTION_REMOVE: 'reaction:remove',

  // Typing
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',

  // Presence
  USER_ONLINE: 'presence:online',
  USER_OFFLINE: 'presence:offline',

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

  // Other
  NOTIFICATION: 'notification',
  UNREAD_UPDATED: 'unread:updated',
}

export function connectSocket() {
  const token = useAuthStore.getState().accessToken
  if (!token || socket?.connected) return

  socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  })

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id)
  })

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason)
  })

  socket.on('reconnect', (attempt) => {
    console.log('[Socket] Reconnected after', attempt, 'attempts')
  })

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message)
  })

  // ─── Message Events ──────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.MESSAGE_CREATE, ({ message }) => {
    const currentUserId = useAuthStore.getState().user?._id
    // Skip if this is our own message (handled via optimistic UI + ACK)
    if (message.tempId && message.authorId === currentUserId) return

    if (message.threadId) {
      // Thread reply — route to thread store + update reply count in main chat
      // We need to figure out the rootMessageId. The server stores threadId as the Thread doc _id,
      // but the thread was created with rootMessageId = the parent message _id.
      // For socket events, we use threadId to key the thread replies.
      const rootMessageId = message.threadId
      useChatStore.getState().addThreadReply(rootMessageId, message)
      // Increment reply count on root message in main channel
      if (message.channelId) {
        useChatStore.getState().incrementReplyCount(rootMessageId, message.channelId)
      }
    } else {
      useChatStore.getState().addMessage(message)
    }
  })

  socket.on(SOCKET_EVENTS.MESSAGE_ACK, ({ tempId, message }) => {
    // Reconcile optimistic message with server-confirmed message
    if (message.threadId) {
      useChatStore.getState().reconcileThreadReply(message.threadId, tempId, message)
    } else {
      useChatStore.getState().reconcileMessage(tempId, message)
    }
  })

  socket.on(SOCKET_EVENTS.MESSAGE_UPDATE, ({ message }) => {
    useChatStore.getState().updateMessage(message)
  })

  socket.on(SOCKET_EVENTS.MESSAGE_DELETE, ({ messageId, channelId }) => {
    useChatStore.getState().removeMessage(messageId, channelId)
  })

  // ─── Reaction Events ────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.REACTION_ADD, ({ messageId, userId, emoji }) => {
    useChatStore.getState().addReactionLocal(messageId, userId, emoji)
  })

  socket.on(SOCKET_EVENTS.REACTION_REMOVE, ({ messageId, userId, emoji }) => {
    useChatStore.getState().removeReactionLocal(messageId, userId, emoji)
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

  // ─── Unread Events ──────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.UNREAD_UPDATED, ({ channelId, unreadCount }) => {
    useChannelStore.getState().updateUnread(channelId, unreadCount)
  })

  // ─── Notification Events ────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.NOTIFICATION, (data) => {
    useChatStore.getState().addNotification(data)
  })

  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
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

export function getSocket() {
  return socket
}
