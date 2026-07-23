import { io } from 'socket.io-client'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { useChannelStore } from '../stores/channelStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useNotificationStore } from '../stores/notificationStore'
import { useDraftStore } from '../stores/draftStore'
import { useLaterStore } from '../stores/laterStore'
import { useScheduledStore } from '../stores/scheduledStore'
import { throttle } from '../utils/throttle'
import { conversationPresence } from './conversationPresence'
import { usePresenceStore } from '../stores/presenceStore'
import { unreadManager } from './unreadManager'
import logger from '../utils/logger'

let socket = null
let _disconnectTime = 0   // timestamp when socket last disconnected
const BRIEF_DISCONNECT_THRESHOLD_MS = 5000  // under 5s = brief blip, skip full cascade

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
  PRESENCE_SYNC: 'presence:sync',

  // Channels
  CHANNEL_ADDED: 'channel:added',
  CHANNEL_REMOVED: 'channel:removed',
  CHANNEL_UPDATED: 'channel:updated',
  MEMBER_JOINED: 'member:joined',
  MEMBER_LEFT: 'member:left',
  CHANNEL_MEMBERS_UPDATED: 'channel:members:updated',
  CHANNEL_CREATED: 'channel:created',
  CHANNEL_LIST_INVALIDATED: 'channel:list:invalidated',
  CHANNEL_SYNC_PROGRESS: 'channel-sync:progress',
  CHANNEL_SYNC_COMPLETED: 'channel-sync:completed',
  CHANNEL_SYNC_FAILED: 'channel-sync:failed',
  USER_ACTIVATED: 'user:activated',

  // Threads
  THREAD_CREATED: 'thread:created',
  THREAD_UPDATED: 'thread:updated',
  THREAD_REPLY: 'thread:reply',
  THREAD_STATS_UPDATED: 'thread:stats_updated',

  // Other
  NOTIFICATION: 'notification',
  UNREAD_UPDATED: 'unread:updated',

  // Announcements
  ANNOUNCEMENT_DELETED: 'announcement:deleted',
  ANNOUNCEMENT_UPDATED: 'announcement:updated',

  // Drafts
  DRAFT_UPDATED: 'draft:updated',
  DRAFT_DELETED: 'draft:deleted',

  // Scheduled Messages
  SCHEDULED_MESSAGE_SENT: 'scheduledMessage:sent',
  SCHEDULED_MESSAGE_FAILED: 'scheduledMessage:failed',

  // Saved Messages
  SAVED_MESSAGE_ADDED: 'savedMessage:added',
  SAVED_MESSAGE_REMOVED: 'savedMessage:removed',
  SAVED_MESSAGE_STATUS_UPDATED: 'savedMessage:statusUpdated',

  // User & Role Sync
  USER_ROLE_UPDATED: 'user:role_updated',
  USER_PROFILE_UPDATED: 'user:profile_updated',
  WORKSPACE_MEMBER_UPDATED: 'workspace:member_updated',
  PERMISSIONS_UPDATED: 'permissions:updated',

  // Favorites
  FAVORITE_ADDED: 'favorite:added',
  FAVORITE_REMOVED: 'favorite:removed',

  // Custom Groups
  CUSTOM_GROUP_CREATED: 'customGroup:created',
  CUSTOM_GROUP_UPDATED: 'customGroup:updated',
  CUSTOM_GROUP_DELETED: 'customGroup:deleted',
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

    // Reconcile against the server before joining rooms. Cached sidebar state
    // must never restore access removed while this device was disconnected.
    try {
      useChannelStore.getState().fetchChannels().then(() => {
        const channels = useChannelStore.getState().channels
        for (const ch of channels) {
          socket.emit('channel:join', ch._id)
        }
      })
      useAuthStore.getState().fetchChannelSyncStatus()
      
      // Sync active conversation focus with the server upon connect
      const activeChannelId = useChannelStore.getState().activeChannelId
      if (activeChannelId && document.visibilityState === 'visible') {
        socket.emit('window:focus', { channelId: activeChannelId })
      }
    } catch (err) {
      logger.error('[Socket] Failed to join channels on connect:', err.message)
    }
  })

  // ─── Favorites Events ──────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.FAVORITE_ADDED, ({ favorite }) => {
    try {
      useFavoritesStore.getState().handleFavoriteAdded(favorite)
    } catch (err) {
      logger.error('[Socket] Failed to handle favorite:added:', err.message)
    }
  })

  socket.on(SOCKET_EVENTS.FAVORITE_REMOVED, ({ favoriteId, targetType, targetId }) => {
    try {
      useFavoritesStore.getState().handleFavoriteRemoved(favoriteId, targetType, targetId)
    } catch (err) {
      logger.error('[Socket] Failed to handle favorite:removed:', err.message)
    }
  })

  socket.on('disconnect', (reason) => {
    logger.log('[Socket] Disconnected:', reason)
    _disconnectTime = Date.now()
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

    const disconnectDuration = _disconnectTime > 0
      ? Date.now() - _disconnectTime
      : Infinity

    // ── Always rejoin channel rooms (lightweight, no server queries) ──
    try {
      const channels = useChannelStore.getState().channels
      for (const ch of channels) {
        socket.emit('channel:join', ch._id)
      }
      const activeChannelId = useChannelStore.getState().activeChannelId
      if (activeChannelId) {
        socket.emit('channel:join', activeChannelId)
        
        // Re-sync active conversation focus with the server upon reconnect
        if (document.visibilityState === 'visible') {
          socket.emit('window:focus', { channelId: activeChannelId })
        }
      }
    } catch (err) {
      logger.error('[Socket] Failed to rejoin rooms after reconnect:', err.message)
    }

    // ── Brief disconnect (< 5s): skip full cascade ──
    // The socket already re-joined rooms. Real-time events will fill any
    // tiny gaps. No need to refetch channels, messages, unreads, pins, etc.
    if (disconnectDuration < BRIEF_DISCONNECT_THRESHOLD_MS) {
      logger.log('[Socket] Brief disconnect — skipping full re-sync', { disconnectDuration })
    }

    // ── Long disconnect: full re-sync to catch missed data ──
    logger.log('[Socket] Long disconnect — running full re-sync', { disconnectDuration })
    try {
      useAuthStore.getState().fetchChannelSyncStatus()
      const channelStore = useChannelStore.getState()
      channelStore.fetchChannels().then(() => {
        const channels = useChannelStore.getState().channels
        for (const ch of channels) {
          socket.emit('channel:join', ch._id)
        }
        const activeChannelId = channelStore.activeChannelId
        if (activeChannelId) {
          socket.emit('channel:join', activeChannelId)
          useChatStore.getState().fetchMessages(activeChannelId)
        }
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

    // ── Instant blue-tick for DMs ────────────────────────────────────────
    // If the incoming message is in a DM AND the recipient is currently viewing
    // that exact channel, emit dm:markSeen immediately at the socket event level.
    // This fires BEFORE any React render cycle, so it's immune to state race
    // conditions in conversationPresence.isActive() or component re-renders.
    const { channelId } = message
    if (channelId) {
      const activeChannelId = useChannelStore.getState().activeChannelId
      if (activeChannelId === channelId) {
        const channels = useChannelStore.getState().channels
        const channel = channels.find((c) => c._id === channelId)
        if (channel?.type === 'dm' && document.visibilityState === 'visible') {
          socket.emit('dm:markSeen', { channelId })
        }
      }
    }

    // Update sidebar: lastMessageAt, lastMessagePreview, and unread count.
    // UnreadManager handles presence-based filtering to prevent unread increment
    // when user is actively viewing the conversation.
    unreadManager.handleMessageReceived(message)
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

  // Thread stats update — carries populated participant data for replier avatars
  socket.on(SOCKET_EVENTS.THREAD_STATS_UPDATED, ({ rootMessageId, channelId, replyCount, lastReplyAt, participants }) => {
    if (rootMessageId) {
      useChatStore.getState().updateThreadStats(rootMessageId, channelId, {
        replyCount,
        lastReplyAt,
        threadParticipants: participants || [],
      })
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
    // Subscribe to the new channel's message room so we receive real-time messages
    if (socket && channel?._id) {
      socket.emit('channel:join', channel._id)
    }
  })

  socket.on(SOCKET_EVENTS.CHANNEL_REMOVED, ({ channelId }) => {
    useChannelStore.getState().removeChannel(channelId)
  })

  socket.on(SOCKET_EVENTS.CHANNEL_UPDATED, ({ channelId, updates }) => {
    const store = useChannelStore.getState()
    const exists = store.channels.some((c) => c._id === channelId)
    if (exists) {
      store.updateChannel(channelId, updates)
      if (updates?.visibility !== undefined) {
        store.fetchChannels()
      }
    } else if (updates?.visibility !== undefined) {
      // Channel not in local list (e.g. non-member received workspace-wide
      // visibility change). Refetch to pick up the newly-visible channel.
      store.fetchChannels()
    }
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

  // ─── Custom Group Events ──────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.CUSTOM_GROUP_CREATED, ({ customGroup }) => {
    if (customGroup) {
      useChannelStore.getState().addCustomGroup(customGroup)
    }
  })

  socket.on(SOCKET_EVENTS.CUSTOM_GROUP_UPDATED, ({ customGroup }) => {
    if (customGroup) {
      useChannelStore.getState().updateCustomGroup(customGroup)
    }
  })

  socket.on(SOCKET_EVENTS.CUSTOM_GROUP_DELETED, ({ customGroupId }) => {
    if (customGroupId) {
      useChannelStore.getState().removeCustomGroup(customGroupId)
    }
  })

  // ─── FlowTask Sync Events ─────────────────────────────────────────
  // Handles real-time channel creation from FlowTask board syncs
  socket.on(SOCKET_EVENTS.CHANNEL_CREATED, ({ channel }) => {
    if (channel) {
      useChannelStore.getState().addChannel(channel)
      if (socket && channel._id) {
        socket.emit('channel:join', channel._id)
      }
    }
  })

  socket.on(SOCKET_EVENTS.CHANNEL_SYNC_PROGRESS, (payload) => {
    useAuthStore.getState().setChannelSync(payload)
  })

  socket.on(SOCKET_EVENTS.CHANNEL_SYNC_COMPLETED, (payload) => {
    useAuthStore.getState().setChannelSync(payload)
    useChannelStore.getState().fetchChannels()
  })

  socket.on(SOCKET_EVENTS.CHANNEL_SYNC_FAILED, (payload) => {
    useAuthStore.getState().setChannelSync(payload)
    useChannelStore.getState().fetchChannels()
  })

  socket.on(SOCKET_EVENTS.CHANNEL_LIST_INVALIDATED, () => {
    useChannelStore.getState().fetchChannels()
  })

  // Handles faded → active user transitions (re-fetches member list)
  socket.on(SOCKET_EVENTS.USER_ACTIVATED, ({ channelId }) => {
    const activeId = useChannelStore.getState().activeChannelId
    if (channelId === activeId) {
      useChannelStore.getState().fetchMembers(channelId)
    }
  })

  // ─── Presence Events ────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.USER_ONLINE, ({ userId, flowTaskUserId, name }) => {
    usePresenceStore.getState().setUserPresence(userId, 'online')
    if (flowTaskUserId) {
      usePresenceStore.getState().setUserPresence(flowTaskUserId, 'online')
    }
  })

  socket.on(SOCKET_EVENTS.USER_OFFLINE, ({ userId, flowTaskUserId }) => {
    usePresenceStore.getState().setUserPresence(userId, 'offline')
    if (flowTaskUserId) {
      usePresenceStore.getState().setUserPresence(flowTaskUserId, 'offline')
    }
  })

  socket.on(SOCKET_EVENTS.USER_AWAY, ({ userId, flowTaskUserId }) => {
    usePresenceStore.getState().setUserPresence(userId, 'away')
    if (flowTaskUserId) {
      usePresenceStore.getState().setUserPresence(flowTaskUserId, 'away')
    }
  })

  socket.on(SOCKET_EVENTS.PRESENCE_SYNC, ({ users }) => {
    if (!users || !Array.isArray(users)) return
    const store = usePresenceStore.getState()
    for (const u of users) {
      const id = u.userId || u._id
      if (id) {
        store.setUserPresence(id, u.onlineStatus)
      }
      if (u.flowTaskUserId) {
        store.setUserPresence(u.flowTaskUserId, u.onlineStatus)
      }
      
      // If this is the current user, update authStore
      const currentUser = useAuthStore.getState().user;
      if (currentUser && (currentUser._id === id || currentUser.flowTaskUserId === u.flowTaskUserId)) {
        useAuthStore.setState(state => ({
          user: { 
            ...state.user, 
            onlineStatus: u.onlineStatus, 
            customStatus: u.customStatus || state.user.customStatus 
          }
        }))
      }
    }
    logger.log('[Socket] Initial presence synced', users.length, 'users')
  })

  socket.on('user:preferences_updated', ({ chatPreferences }) => {
    const currentUser = useAuthStore.getState().user;
    if (currentUser) {
      useAuthStore.setState({ 
        user: { ...currentUser, chatPreferences: { ...currentUser.chatPreferences, ...chatPreferences } }
      })
    }
  })

  // ─── User Role Update Events ────────────────────────────────────────
  socket.on(SOCKET_EVENTS.USER_ROLE_UPDATED, ({ userId, oldRole, newRole, workspaceId }) => {
    const currentUserId = useAuthStore.getState().user?._id
    
    console.log('[Socket] USER_ROLE_UPDATED received', { userId, oldRole, newRole, workspaceId, currentUserId })
    
    // Only update if this is the current user
    if (userId === currentUserId) {
      console.log('[Socket] Updating role for current user', { newRole })
      
      // Update auth store user object
      useAuthStore.getState().updateUserRole(newRole, workspaceId)
      
      // Refresh workspace memberships to get updated role
      useWorkspaceStore.getState().fetchWorkspaces()
      
      logger.info('[Socket] User role updated', { userId, oldRole, newRole, workspaceId })
    } else {
      console.log('[Socket] Role update for different user, skipping', { userId, currentUserId })
    }
  })

  // ─── Workspace Member Updated (for other members seeing role changes) ─
  socket.on(SOCKET_EVENTS.WORKSPACE_MEMBER_UPDATED, ({ userId, newRole, workspaceId, updatedBy }) => {
    // Update workspaceStore members array if viewing this workspace
    const store = useWorkspaceStore.getState()
    if (store.activeWorkspaceId === workspaceId) {
      store.updateMemberRoleInStore(userId, newRole)
    }
    
    logger.info('[Socket] Workspace member role updated', { userId, newRole, workspaceId })
  })

  // ─── User Profile Updated Events ────────────────────────────────────
  socket.on(SOCKET_EVENTS.USER_PROFILE_UPDATED, ({ userId, updates, workspaceId }) => {
    const currentUserId = useAuthStore.getState().user?._id
    
    if (userId === currentUserId) {
      // Update authStore user object
      const currentUser = useAuthStore.getState().user
      if (currentUser) {
        useAuthStore.setState({
          user: { ...currentUser, ...updates }
        })
      }
    }
    
    // Update workspaceStore members (other users may see this user in member list)
    useWorkspaceStore.getState().updateMemberProfile(userId, updates)
    
    logger.info('[Socket] User profile updated', { userId, fields: Object.keys(updates || {}) })
  })

  // ─── Unread Events ──────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.UNREAD_UPDATED, ({ channelId, unreadCount }) => {
    // UnreadManager validates against active conversation before applying update
    unreadManager.handleUnreadUpdate({ channelId, unreadCount })
  })

  // ─── Notification Events ────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.NOTIFICATION, ({ notification }) => {
    if (!notification) return

    // Suppress notification if user is actively viewing the channel, EXCEPT for critical system notifications
    const activeChannelId = useChannelStore.getState().activeChannelId
    const isCriticalNotification = ['reminder_overdue', 'system', 'bot_alert'].includes(notification.type) || notification.priority === 'high'
    
    if (!isCriticalNotification && notification.channelId && notification.channelId === activeChannelId && document.hasFocus()) {
      return
    }
    
    // Persist to notification store
    useNotificationStore.getState().addNotification(notification)
    // Also keep legacy in-memory notification for toast/badge
    useChatStore.getState().addNotification(notification)
  })

  // ─── Multi-Device Notification Sync ──────────────────────────────────
  socket.on('notification:dismiss', ({ notificationId }) => {
    if (notificationId) {
      useNotificationStore.getState().dismissNotification(notificationId)
    }
  })

  socket.on('notification:read:sync', ({ notificationId, channelId }) => {
    useNotificationStore.getState().syncReadState({ notificationId, channelId })
  })

  socket.on('notification:preferences:updated', ({ preferences }) => {
    if (preferences) {
      useNotificationStore.getState().applyPreferences(preferences)
    }
  })

  // ─── Scheduled Message Events ────────────────────────────────────────
  socket.on('scheduledMessage:sent', (payload) => {
    const { scheduledMessageId, message } = payload
    useScheduledStore.getState().handleScheduledSent(payload)
    
    // The scheduled message was sent successfully — add to chat if in the channel
    if (message) {
      useChatStore.getState().addMessage(message)
    }
    logger.log('[Socket] Scheduled message sent:', scheduledMessageId)
  })

  socket.on('scheduledMessage:failed', (payload) => {
    const { scheduledMessageId, error } = payload
    useScheduledStore.getState().handleScheduledFailed(payload)
    logger.error('[Socket] Scheduled message failed:', scheduledMessageId, error)
  })

  socket.on('scheduledMessage:cancelled', (payload) => {
    const { scheduledMessageId } = payload
    useScheduledStore.getState().handleScheduledCancelled(payload)
    logger.log('[Socket] Scheduled message cancelled:', scheduledMessageId)
  })

  socket.on('scheduledMessage:deleted', (payload) => {
    const { scheduledMessageId } = payload
    useScheduledStore.getState().handleScheduledCancelled(payload) // same logic
    logger.log('[Socket] Scheduled message deleted:', scheduledMessageId)
  })

  // ─── Saved Message Events ────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.SAVED_MESSAGE_ADDED, ({ savedMessage }) => {
    if (savedMessage) {
      useLaterStore.getState().addSavedMessage(savedMessage)
    }
  })

  socket.on(SOCKET_EVENTS.SAVED_MESSAGE_REMOVED, ({ messageId }) => {
    if (messageId) {
      useLaterStore.getState().removeSavedMessage(messageId)
    }
  })

  socket.on(SOCKET_EVENTS.SAVED_MESSAGE_STATUS_UPDATED, ({ messageId, status }) => {
    if (messageId && status) {
      useLaterStore.getState().updateSavedMessageStatus(messageId, status)
    }
  })

  // ─── Announcement Events ─────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.ANNOUNCEMENT_DELETED, ({ announcementId, workspaceId }) => {
    if (!announcementId) return
    const activeWsId = useWorkspaceStore.getState().activeWorkspaceId
    if (workspaceId && workspaceId !== activeWsId) return
    // Remove any message in the chat store that has this announcementId in activityMeta
    useChatStore.getState().removeAnnouncementMessages?.(announcementId)
    logger.log('[Socket] Announcement deleted:', announcementId)
  })  

  socket.on(SOCKET_EVENTS.ANNOUNCEMENT_UPDATED, ({ announcementId, title, description }) => {
    if (!announcementId) return
    logger.log('[Socket] Announcement updated:', announcementId, title)
  })

  // ─── Draft Sync Events (cross-device) ───────────────────────────────
  socket.on(SOCKET_EVENTS.DRAFT_UPDATED, (draftPayload) => {
    try {
      const { channelId, html, text, workspaceId: wsId, threadId, mentions, attachments, fileReferences } = draftPayload
      if (channelId && wsId) {
        useDraftStore.getState().setDraft(channelId, html || '', text || '', wsId, threadId || null, {
          mentions: mentions || [],
          attachments: attachments || [],
          fileReferences: fileReferences || [],
        })
      }
    } catch (err) {
      logger.error('[Socket] draft:updated handler error:', err.message)
    }
  })

  socket.on(SOCKET_EVENTS.DRAFT_DELETED, ({ channelId, workspaceId: wsId, threadId }) => {
    try {
      if (channelId && wsId) {
        useDraftStore.getState().clearDraft(channelId, wsId, threadId || null)
      }
    } catch (err) {
      logger.error('[Socket] draft:deleted handler error:', err.message)
    }
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
