import { create } from 'zustand'
import { messageAPI, threadAPI, botAPI } from '../services/api'
import { useAuthStore } from './authStore'
import toast from 'react-hot-toast'

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
          // Initial load: prefer fresh messages, keep existing ones that aren't in fresh (e.g. pending local ones)
          const freshIds = new Set(sortedIncoming.map(m => m._id))
          const uniqueExisting = existingMessages.filter(m => !freshIds.has(m._id) && m.pending)
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
      console.error('Failed to fetch messages:', error)
    } finally {
      fetching.delete(fetchKey)
    }
  },

  /**
   * Send a message with optimistic UI.
   * Flow: generate tempId → show instantly → send to server → reconcile on ACK
   */
  sendMessage: async (channelId, content, options = {}) => {
    try {
      // Check if it's a slash command (not optimistic)
      if (content.trim().startsWith('/flowtask')) {
        const command = content.trim().replace(/^\/flowtask\s*/i, '')
        const { data } = await botAPI.command(command, channelId)
        return data.data
      }

      const user = useAuthStore.getState().user
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
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
        attachments: [],
        fileReferences: [],
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
      if (options.threadId) {
        const threadReplies = get().threadRepliesByRoot[options.threadId] || []
        const failedMsg = threadReplies.find(m => m.pending && m._id?.startsWith('temp-'))
        if (failedMsg) {
          get().markThreadReplyFailed(failedMsg._id, options.threadId)
        }
      } else {
        const tempMessages = (get().messagesByChannel[channelId] || [])
        const failedMsg = tempMessages.find(m => m.pending && m._id?.startsWith('temp-'))
        if (failedMsg) {
          get().markMessageFailed(failedMsg._id, channelId)
        }
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
      get().removeMessage(messageId, channelId)
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

  // ─── Thread Replies ─────────────────────────────────────────────────
  fetchThreadReplies: async (rootMessageId, options = {}) => {
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
          const pendingOnly = existing.filter(m => !freshIds.has(m._id) && m.pending)
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
      console.error('Failed to fetch thread replies:', error)
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
      users.set(userId, true)
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
}))
