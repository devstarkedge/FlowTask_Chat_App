import { io } from 'socket.io-client'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { useChannelStore } from '../stores/channelStore'

let socket = null

const SOCKET_EVENTS = {
  MESSAGE_NEW: 'message:new',
  MESSAGE_UPDATED: 'message:updated',
  MESSAGE_DELETED: 'message:deleted',
  MESSAGE_PINNED: 'message:pinned',
  MESSAGE_UNPINNED: 'message:unpinned',
  REACTION_ADDED: 'reaction:added',
  REACTION_REMOVED: 'reaction:removed',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  USER_ONLINE: 'user:online',
  USER_OFFLINE: 'user:offline',
  CHANNEL_ADDED: 'channel:added',
  CHANNEL_REMOVED: 'channel:removed',
  CHANNEL_UPDATED: 'channel:updated',
  MEMBER_JOINED: 'channel:member_joined',
  MEMBER_LEFT: 'channel:member_left',
  THREAD_CREATED: 'thread:created',
  THREAD_UPDATED: 'thread:updated',
  NOTIFICATION: 'notification',
  UNREAD_UPDATED: 'unread:updated',
}

export function connectSocket() {
  const token = useAuthStore.getState().token
  if (!token || socket?.connected) return

  socket = io(window.location.origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  })

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id)
  })

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason)
  })

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message)
  })

  // ─── Message Events ──────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.MESSAGE_NEW, ({ message }) => {
    useChatStore.getState().addMessage(message)
  })

  socket.on(SOCKET_EVENTS.MESSAGE_UPDATED, ({ message }) => {
    useChatStore.getState().updateMessage(message)
  })

  socket.on(SOCKET_EVENTS.MESSAGE_DELETED, ({ messageId, channelId }) => {
    useChatStore.getState().removeMessage(messageId, channelId)
  })

  // ─── Reaction Events ────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.REACTION_ADDED, ({ messageId, userId, emoji }) => {
    useChatStore.getState().addReactionLocal(messageId, userId, emoji)
  })

  socket.on(SOCKET_EVENTS.REACTION_REMOVED, ({ messageId, userId, emoji }) => {
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
    // Re-fetch members when a member joins the active channel
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

  socket.on('channel:members:updated', ({ channelId }) => {
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

export function emitTypingStart(channelId) {
  socket?.emit('typing:start', { channelId })
}

export function emitTypingStop(channelId) {
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
