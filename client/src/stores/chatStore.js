import { create } from 'zustand'
import { messageAPI, threadAPI, botAPI } from '../services/api'
import { useAuthStore } from './authStore'
import toast from 'react-hot-toast'
import logger from '../utils/logger'

// ─── LRU Message Cache ─────────────────────────────────────────────────────
// Prevent unbounded memory growth by evicting least-recently-used channels.
const MAX_CACHED_CHANNELS = 10
const channelAccessOrder = [] // Most-recently-accessed at end

function touchChannel(channelId) {
  const idx = channelAccessOrder.indexOf(channelId)
  if (idx !== -1) channelAccessOrder.splice(idx, 1)
  channelAccessOrder.push(channelId)
}

function getChannelsToEvict() {
  if (channelAccessOrder.length <= MAX_CACHED_CHANNELS) return []
  return channelAccessOrder.splice(0, channelAccessOrder.length - MAX_CACHED_CHANNELS)
}

export const useChatStore = create((set, get) => ({
  // Messages keyed by channelId
  messagesByChannel: {},
  hasMore: {},
  isLoadingMessages: false,

  highlightMessageId: null,
  setHighlightMessageId: (id) => set({ highlightMessageId: id }),

  // Pinned messages keyed by channelId
  pinnedMessagesByChannel: {},
  isLoadingPins: false,

  // All threads for the current user
  allThreads: [],
  allThreadsLoading: false,

  // Thread replies keyed by rootMessageId
  threadRepliesByRoot: {},
  threadHasMore: {},
  isLoadingThread: false,

  // Debounce guard for pagination fetches
  _fetchingChannels: new Set(),

  // Typing indicators keyed by channelId → { userId: name }
  typingByChannel: {},

  // Online users
  onlineUsers: new Map(),

  // Notifications
  notifications: [],

  // Connection status for reconnect indicator
  connectionStatus: 'disconnected', // 'connected' | 'connecting' | 'disconnected'

  // Active thread (persisted to sessionStorage for refresh survival)
  activeThread: JSON.parse(sessionStorage.getItem('chat_activeThread') || 'null'),

  openThread: (thread) => {
    set({ activeThread: thread })
    try { sessionStorage.setItem('chat_activeThread', JSON.stringify(thread)) } catch {}
  },

  closeThread: () => {
    set({ activeThread: null })
    sessionStorage.removeItem('chat_activeThread')
  },

  // ─── Messages ────────────────────────────────────────────────────────
  fetchMessages: async (channelId, options = {}) => {
    // Debounce guard: prevent duplicate fetches for the same channel
    const fetchKey = `${channelId}-${options.cursor || 'initial'}`
    const fetching = get()._fetchingChannels
    if (fetching.has(fetchKey)) return
    fetching.add(fetchKey)

    // LRU tracking
    touchChannel(channelId)

    set({ isLoadingMessages: true })
    try {
      const { data } = await messageAPI.list(channelId, options)
      const messages = data.data.items || []
      const hasMore = data.data.hasMore ?? false

      set((state) => {
        const existingMessages = state.messagesByChannel[channelId] || []
        
        // Defensive fix: Ensure incoming messages are always Oldest -> Newest
        const sortedIncoming = [...messages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        
        let merged
        if (options.cursor) {
          // Loading older messages: prepend new ones, but filter out duplicates
          const existingIds = new Set(existingMessages.map(m => m._id))
          const uniqueNew = sortedIncoming.filter(m => !existingIds.has(m._id))
          merged = [...uniqueNew, ...existingMessages]
        } else {
          // Initial load: prefer fresh messages, keep only RECENT pending local messages (< 30s old)
          const freshIds = new Set(sortedIncoming.map(m => m._id))
          const thirtySecsAgo = Date.now() - 30000
          const uniqueExisting = existingMessages.filter(m =>
            !freshIds.has(m._id) &&
            m.pending &&
            m.channelId === channelId &&
            new Date(m.createdAt).getTime() > thirtySecsAgo
          )
          merged = [...sortedIncoming, ...uniqueExisting]
        }

        // Final safety check: enforce strict chronological order
        merged.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

        const newMessagesByChannel = {
          ...state.messagesByChannel,
          [channelId]: merged,
        }

        // Evict LRU channels to keep memory bounded
        const toEvict = getChannelsToEvict()
        for (const evictId of toEvict) {
          delete newMessagesByChannel[evictId]
        }

        return {
          messagesByChannel: newMessagesByChannel,
          hasMore: { ...state.hasMore, [channelId]: hasMore },
          isLoadingMessages: false,
        }
      })
    } catch (error) {
      set({ isLoadingMessages: false })
      logger.error('Failed to fetch messages:', error)
    } finally {
      fetching.delete(fetchKey)
    }
  },

  /**
   * Send a message with optimistic UI.
   * Flow: generate tempId → show instantly → send to server → reconcile on ACK
   */
  sendMessage: async (channelId, content, options = {}) => {
    let tempId = null
    try {
      // Check if it's a slash command (not optimistic)
      if (content.trim().startsWith('/flowtask')) {
        const command = content.trim().replace(/^\/flowtask\s*/i, '')
        const { data } = await botAPI.command(command, channelId)
        return data.data
      }

      const user = useAuthStore.getState().user
      tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const isThreadReply = !!options.threadId

      // Create optimistic message to show immediately
      const optimisticMessage = {
        _id: tempId,
        channelId,
        content,
        htmlContent: options.htmlContent || content,
        contentType: 'text',
        authorId: user,
        senderSnapshot: { name: user?.name || 'You', avatar: user?.avatar || null },
        attachments: options.attachments || [],
        fileReferences: options.fileReferences || [],
        mentions: [],
        reactions: [],
        replyCount: 0,
        isEdited: false,
        isPinned: false,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pending: true,
        failed: false,
        threadId: options.threadId || null,
      }

      // Show optimistic message immediately — thread replies go to thread store
      if (isThreadReply) {
        get().addThreadReply(options.threadId, optimisticMessage)
      } else {
        get().addMessage(optimisticMessage)
      }

      // Send to server with tempId for ACK reconciliation
      const { data } = await messageAPI.send(channelId, {
        content,
        htmlContent: options.htmlContent || undefined,
        tempId,
        ...options,
      })

      // Server ACK will arrive via socket and reconcile via reconcileMessage()
      // But if ACK hasn't arrived yet, reconcile from HTTP response
      const serverMessage = data.data.message
      if (isThreadReply) {
        get().reconcileThreadReply(options.threadId, tempId, serverMessage)
        // Increment reply count on root message in main chat
        get().incrementReplyCount(options.threadId, channelId)
      } else {
        get().reconcileMessage(tempId, serverMessage)
      }

      return serverMessage
    } catch (error) {
      // Mark the optimistic message as failed
      if (tempId && options.threadId) {
        get().markThreadReplyFailed(tempId, options.threadId)
      } else if (tempId) {
        get().markMessageFailed(tempId, channelId)
      }
      toast.error('Failed to send message')
      throw error
    }
  },

  editMessage: async (messageId, content) => {
    try {
      const { data } = await messageAPI.edit(messageId, content)
      const message = data.data.message
      set((state) => {
        const channelMsgs = state.messagesByChannel[message.channelId] || []
        return {
          messagesByChannel: {
            ...state.messagesByChannel,
            [message.channelId]: channelMsgs.map((m) =>
              m._id === messageId ? message : m,
            ),
          },
        }
      })
    } catch (error) {
      toast.error('Failed to edit message')
    }
  },

  deleteMessage: async (messageId, channelId) => {
    try {
      await messageAPI.delete(messageId)
      // Use soft delete locally to show tombstone
      get().softDeleteMessage(messageId, channelId)
    } catch (error) {
      toast.error('Failed to delete message')
    }
  },

  // ─── Real-time message handlers ─────────────────────────────────────
  addMessage: (message) => {
    set((state) => {
      // Never add thread replies to main chat timeline
      if (message.threadId) return state
      const channelId = message.channelId
      const existing = state.messagesByChannel[channelId] || []
      // Avoid duplicates
      if (existing.some((m) => m._id === message._id)) return state
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: [...existing, message],
        },
      }
    })
  },

  /**
   * Reconcile an optimistic (temp) message with the server-confirmed message.
   * Replaces tempId with real _id and clears pending state.
   */
  reconcileMessage: (tempId, serverMessage) => {
    if (!tempId || !serverMessage) return

    set((state) => {
      const channelId = serverMessage.channelId
      const existing = state.messagesByChannel[channelId] || []

      // Check if already reconciled (edge case: both HTTP response and socket ACK arrive)
      if (existing.some(m => m._id === serverMessage._id)) {
        // Just remove the temp message
        return {
          messagesByChannel: {
            ...state.messagesByChannel,
            [channelId]: existing.filter(m => m._id !== tempId),
          },
        }
      }

      // Replace temp message with server message
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: existing.map(m =>
            m._id === tempId
              ? { ...serverMessage, pending: false, failed: false }
              : m,
          ),
        },
      }
    })
  },

  /**
   * Mark a pending message as failed. User can retry later.
   */
  markMessageFailed: (tempId, channelId) => {
    set((state) => {
      const existing = state.messagesByChannel[channelId] || []
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: existing.map(m =>
            m._id === tempId ? { ...m, pending: false, failed: true } : m,
          ),
        },
      }
    })
  },

  /**
   * Retry sending a failed message.
   */
  retryMessage: async (tempId, channelId) => {
    const messages = get().messagesByChannel[channelId] || []
    const failedMsg = messages.find(m => m._id === tempId && m.failed)
    if (!failedMsg) return

    // Remove the failed message
    get().removeMessage(tempId, channelId)

    // Resend
    try {
      await get().sendMessage(channelId, failedMsg.content, {
        threadId: failedMsg.threadId,
        htmlContent: failedMsg.htmlContent,
        fileReferences: failedMsg.fileReferences,
        attachments: failedMsg.attachments,
      })
    } catch {
      // Error already handled in sendMessage
    }
  },

  updateMessage: (message) => {
    set((state) => {
      const channelId = message.channelId
      const existing = state.messagesByChannel[channelId] || []
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: existing.map((m) => (m._id === message._id ? message : m)),
        },
      }
    })
  },

  removeMessage: (messageId, channelId) => {
    set((state) => {
      if (!channelId) return state
      const existing = state.messagesByChannel[channelId] || []
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: existing.filter((m) => m._id !== messageId),
        },
      }
    })
  },

  /**
   * Soft-delete a message: mark as deleted but keep in timeline (tombstone UI).
   */
  softDeleteMessage: (messageId, channelId) => {
    set((state) => {
      if (!channelId) return state
      const existing = state.messagesByChannel[channelId] || []
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: existing.map((m) =>
            m._id === messageId
              ? { ...m, isDeleted: true, content: '', htmlContent: '', deletedAt: new Date().toISOString() }
              : m
          ),
        },
      }
    })
  },

  /**
   * Update message delivery status (DM-only: sent → delivered → seen).
   */
  updateMessageStatus: (channelId, messageId, messageIds, status, timestamps = {}) => {
    set((state) => {
      if (!channelId) return state
      const existing = state.messagesByChannel[channelId] || []
      const idsToUpdate = messageIds || (messageId ? [messageId] : [])
      if (idsToUpdate.length === 0) return state

      const idSet = new Set(idsToUpdate)
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: existing.map((m) =>
            idSet.has(m._id)
              ? { ...m, status, ...timestamps }
              : m
          ),
        },
      }
    })
  },

  // ─── Thread Replies ─────────────────────────────────────────────────
  fetchThreadReplies: async (rootMessageId, options = {}) => {
    // Normalize: if an object is passed instead of a plain ID string, extract ._id
    const resolvedId = (rootMessageId?._id ?? rootMessageId)?.toString?.()
    if (!resolvedId) return
    rootMessageId = resolvedId
    set({ isLoadingThread: true })
    try {
      const { data } = await threadAPI.replies(rootMessageId, options)
      const items = data.data.items || data.data.messages || []
      const hasMore = data.data.hasMore ?? false

      set((state) => {
        const existing = state.threadRepliesByRoot[rootMessageId] || []
        let merged
        if (options.cursor) {
          const existingIds = new Set(existing.map(m => m._id))
          const unique = items.filter(m => !existingIds.has(m._id))
          merged = [...existing, ...unique]
        } else {
          const freshIds = new Set(items.map(m => m._id))
          const thirtySecsAgo = Date.now() - 30000
          const pendingOnly = existing.filter(m =>
            !freshIds.has(m._id) &&
            m.pending &&
            new Date(m.createdAt).getTime() > thirtySecsAgo
          )
          merged = [...items, ...pendingOnly]
        }
        merged.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

        return {
          threadRepliesByRoot: {
            ...state.threadRepliesByRoot,
            [rootMessageId]: merged,
          },
          threadHasMore: { ...state.threadHasMore, [rootMessageId]: hasMore },
          isLoadingThread: false,
        }
      })
    } catch (error) {
      set({ isLoadingThread: false })
      logger.error('Failed to fetch thread replies:', error)
    }
  },

  addThreadReply: (rootMessageId, reply) => {
    set((state) => {
      const existing = state.threadRepliesByRoot[rootMessageId] || []
      if (existing.some(m => m._id === reply._id)) return state
      return {
        threadRepliesByRoot: {
          ...state.threadRepliesByRoot,
          [rootMessageId]: [...existing, reply],
        },
      }
    })
  },

  reconcileThreadReply: (rootMessageId, tempId, serverReply) => {
    if (!tempId || !serverReply) return
    set((state) => {
      const existing = state.threadRepliesByRoot[rootMessageId] || []
      if (existing.some(m => m._id === serverReply._id)) {
        return {
          threadRepliesByRoot: {
            ...state.threadRepliesByRoot,
            [rootMessageId]: existing.filter(m => m._id !== tempId),
          },
        }
      }
      return {
        threadRepliesByRoot: {
          ...state.threadRepliesByRoot,
          [rootMessageId]: existing.map(m =>
            m._id === tempId ? { ...serverReply, pending: false, failed: false } : m,
          ),
        },
      }
    })
  },

  markThreadReplyFailed: (tempId, rootMessageId) => {
    set((state) => {
      const existing = state.threadRepliesByRoot[rootMessageId] || []
      return {
        threadRepliesByRoot: {
          ...state.threadRepliesByRoot,
          [rootMessageId]: existing.map(m =>
            m._id === tempId ? { ...m, pending: false, failed: true } : m,
          ),
        },
      }
    })
  },

  incrementReplyCount: (rootMessageId, channelId) => {
    set((state) => {
      const existing = state.messagesByChannel[channelId] || []
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: existing.map(m =>
            m._id === rootMessageId
              ? { ...m, replyCount: (m.replyCount || 0) + 1 }
              : m,
          ),
        },
      }
    })
  },

  clearThreadReplies: (rootMessageId) => {
    set((state) => {
      const newThreadReplies = { ...state.threadRepliesByRoot }
      delete newThreadReplies[rootMessageId]
      return { threadRepliesByRoot: newThreadReplies }
    })
  },

  // ─── Reactions ──────────────────────────────────────────────────────
  addReaction: async (messageId, emoji) => {
    try {
      await messageAPI.addReaction(messageId, emoji)
    } catch (error) {
      toast.error('Failed to add reaction')
    }
  },

  removeReaction: async (messageId, emoji) => {
    try {
      await messageAPI.removeReaction(messageId, emoji)
    } catch (error) {
      toast.error('Failed to remove reaction')
    }
  },

  addReactionLocal: (messageId, userId, emoji, channelId) => {
    set((state) => {
      const newState = { ...state.messagesByChannel }
      // If channelId is provided, only scan that channel (O(messages) vs O(channels×messages))
      const channelsToScan = channelId && newState[channelId] ? [channelId] : Object.keys(newState)
      for (const cid of channelsToScan) {
        newState[cid] = newState[cid].map((m) => {
          if (m._id !== messageId) return m
          const reactions = [...(m.reactions || [])]
          const existing = reactions.find((r) => r.emoji === emoji)
          if (existing) {
            if (!existing.users?.includes(userId) && !existing.userIds?.some(id => id?.toString() === userId)) {
              existing.users = [...(existing.users || []), userId]
              existing.userIds = [...(existing.userIds || []), userId]
              existing.count = (existing.count || 0) + 1
            }
          } else {
            reactions.push({ emoji, users: [userId], userIds: [userId], count: 1 })
          }
          return { ...m, reactions }
        })
      }
      return { messagesByChannel: newState }
    })
  },

  removeReactionLocal: (messageId, userId, emoji, channelId) => {
    set((state) => {
      const newState = { ...state.messagesByChannel }
      const channelsToScan = channelId && newState[channelId] ? [channelId] : Object.keys(newState)
      for (const cid of channelsToScan) {
        newState[cid] = newState[cid].map((m) => {
          if (m._id !== messageId) return m
          const reactions = (m.reactions || [])
            .map((r) => {
              if (r.emoji !== emoji) return r
              return {
                ...r,
                users: (r.users || []).filter((u) => u !== userId),
                userIds: (r.userIds || []).filter((u) => u?.toString() !== userId),
                count: Math.max(0, (r.count || 1) - 1),
              }
            })
            .filter((r) => (r.users?.length > 0 || r.count > 0))
          return { ...m, reactions }
        })
      }
      return { messagesByChannel: newState }
    })
  },

  // ─── Typing ─────────────────────────────────────────────────────────
  setTyping: (channelId, userId, name) => {
    set((state) => ({
      typingByChannel: {
        ...state.typingByChannel,
        [channelId]: { ...state.typingByChannel[channelId], [userId]: name },
      },
    }))
    // Auto-clear after 5s
    setTimeout(() => {
      get().clearTyping(channelId, userId)
    }, 5000)
  },

  clearTyping: (channelId, userId) => {
    set((state) => {
      const typing = { ...state.typingByChannel[channelId] }
      delete typing[userId]
      return {
        typingByChannel: { ...state.typingByChannel, [channelId]: typing },
      }
    })
  },

  // ─── Presence ───────────────────────────────────────────────────────
  setUserOnline: (userId) => {
    set((state) => {
      const users = new Map(state.onlineUsers)
      users.set(userId, 'online')
      return { onlineUsers: users }
    })
  },

  setUserOffline: (userId) => {
    set((state) => {
      const users = new Map(state.onlineUsers)
      users.delete(userId)
      return { onlineUsers: users }
    })
  },

  setUserAway: (userId) => {
    set((state) => {
      const users = new Map(state.onlineUsers)
      if (users.has(userId)) {
        users.set(userId, 'away')
      }
      return { onlineUsers: users }
    })
  },

  // ─── Notifications ─────────────────────────────────────────────────
  addNotification: (notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, 50),
    }))
    if (notification.type === 'mention') {
      toast(`${notification.authorName} mentioned you in #${notification.channelName}`)
    }
  },

  clearNotifications: () => set({ notifications: [] }),

  // ─── Pinned Messages ───────────────────────────────────────────────
  fetchPinnedMessages: async (channelId) => {
    set({ isLoadingPins: true })
    try {
      const { data } = await messageAPI.getPinned(channelId)
      const pins = data.data?.items || data.data?.messages || data.data || []
      set((state) => ({
        pinnedMessagesByChannel: {
          ...state.pinnedMessagesByChannel,
          [channelId]: Array.isArray(pins) ? pins : [],
        },
        isLoadingPins: false,
      }))
    } catch (error) {
      set({ isLoadingPins: false })
      logger.error('Failed to fetch pinned messages:', error)
    }
  },

  pinMessage: async (messageId) => {
    try {
      await messageAPI.pin(messageId)
      // Optimistic: update isPinned in message list
      set((state) => {
        const newState = { ...state.messagesByChannel }
        for (const cid of Object.keys(newState)) {
          newState[cid] = newState[cid].map((m) =>
            m._id === messageId ? { ...m, isPinned: true } : m,
          )
        }
        return { messagesByChannel: newState }
      })
      toast.success('Message pinned')
    } catch (error) {
      toast.error('Failed to pin message')
    }
  },

  unpinMessage: async (messageId) => {
    try {
      await messageAPI.unpin(messageId)
      set((state) => {
        const newState = { ...state.messagesByChannel }
        for (const cid of Object.keys(newState)) {
          newState[cid] = newState[cid].map((m) =>
            m._id === messageId ? { ...m, isPinned: false } : m,
          )
        }
        // Remove from pinned cache
        const newPins = { ...state.pinnedMessagesByChannel }
        for (const cid of Object.keys(newPins)) {
          newPins[cid] = (newPins[cid] || []).filter((m) => m._id !== messageId)
        }
        return { messagesByChannel: newState, pinnedMessagesByChannel: newPins }
      })
      toast.success('Message unpinned')
    } catch (error) {
      toast.error('Failed to unpin message')
    }
  },

  // Handle pin socket events
  handleMessagePinned: (payload) => {
    set((state) => {
      const message = payload?.message || payload
      const messageId = message?._id || payload?.messageId
      const cid = message?.channelId || payload?.channelId
      if (!messageId || !cid) return state

      const newMsgs = { ...state.messagesByChannel }
      if (newMsgs[cid]) {
        newMsgs[cid] = newMsgs[cid].map((m) =>
          m._id === messageId ? { ...m, isPinned: true } : m,
        )
      }
      // Add to pinned cache if loaded
      const newPins = { ...state.pinnedMessagesByChannel }
      if (newPins[cid]) {
        if (!newPins[cid].some((m) => m._id === messageId)) {
          const cachedMessage = newMsgs[cid]?.find((m) => m._id === messageId)
          const pinEntry = cachedMessage || (message?._id ? message : null)
          if (pinEntry) {
            newPins[cid] = [{ ...pinEntry, isPinned: true }, ...newPins[cid]]
          }
        }
      }
      return { messagesByChannel: newMsgs, pinnedMessagesByChannel: newPins }
    })
  },

  handleMessageUnpinned: (payload) => {
    set((state) => {
      const message = payload?.message || payload
      const messageId = message?._id || payload?.messageId
      const cid = message?.channelId || payload?.channelId
      if (!messageId || !cid) return state

      const newMsgs = { ...state.messagesByChannel }
      if (newMsgs[cid]) {
        newMsgs[cid] = newMsgs[cid].map((m) =>
          m._id === messageId ? { ...m, isPinned: false } : m,
        )
      }
      const newPins = { ...state.pinnedMessagesByChannel }
      if (newPins[cid]) {
        newPins[cid] = newPins[cid].filter((m) => m._id !== messageId)
      }
      return { messagesByChannel: newMsgs, pinnedMessagesByChannel: newPins }
    })
  },

  // ─── All Threads ────────────────────────────────────────────────────
  fetchAllThreads: async () => {
    set({ allThreadsLoading: true })
    try {
      const { data } = await threadAPI.myThreads()
      const threads = data.data?.items || data.data?.threads || data.data || []
      set({ allThreads: Array.isArray(threads) ? threads : [], allThreadsLoading: false })
    } catch (error) {
      set({ allThreadsLoading: false })
      logger.error('Failed to fetch threads:', error)
    }
  },

  // ─── Connection Status ──────────────────────────────────────────────
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  // ─── Workspace Switch — Clear all cached data ──────────────────────
  clearCache: () => set({
    messagesByChannel: {},
    hasMore: {},
    pinnedMessagesByChannel: {},
    allThreads: [],
    threadRepliesByRoot: {},
    threadHasMore: {},
    typingByChannel: {},
    onlineUsers: new Map(),
    notifications: [],
    activeThread: null,
  }),
}))
