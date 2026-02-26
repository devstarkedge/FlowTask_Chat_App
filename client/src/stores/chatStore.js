import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { messageAPI, botAPI } from '../services/api'
import toast from 'react-hot-toast'

export const useChatStore = create(
  persist(
    (set, get) => ({
  // Messages keyed by channelId
  messagesByChannel: {},
  hasMore: {},
  isLoadingMessages: false,

  // Typing indicators keyed by channelId → { userId: name }
  typingByChannel: {},

  // Online users
  onlineUsers: new Map(),

  // Notifications
  notifications: [],

  // ─── Messages ────────────────────────────────────────────────────────
  fetchMessages: async (channelId, options = {}) => {
    set({ isLoadingMessages: true })
    try {
      const { data } = await messageAPI.list(channelId, options)
      const messages = data.data.items || []
      const hasMore = data.data.hasMore ?? false

      set((state) => {
        const existingMessages = state.messagesByChannel[channelId] || []
        
        // Defensive fix: Ensure incoming messages are always Oldest -> Newest
        // (Bypasses the need for backend restart if message.repository hasn't reloaded)
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

        return {
          messagesByChannel: {
            ...state.messagesByChannel,
            [channelId]: merged,
          },
          hasMore: { ...state.hasMore, [channelId]: hasMore },
          isLoadingMessages: false,
        }
      })
    } catch (error) {
      set({ isLoadingMessages: false })
      console.error('Failed to fetch messages:', error)
    }
  },

  sendMessage: async (channelId, content, options = {}) => {
    try {
      // Check if it's a slash command
      if (content.trim().startsWith('/flowtask')) {
        const command = content.trim().replace(/^\/flowtask\s*/i, '')
        const { data } = await botAPI.command(command, channelId)
        // Bot response is returned via system message
        return data.data
      }

      const { data } = await messageAPI.send(channelId, {
        content,
        ...options,
      })
      return data.data.message
    } catch (error) {
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

  addReactionLocal: (messageId, userId, emoji) => {
    set((state) => {
      const newState = { ...state.messagesByChannel }
      for (const channelId of Object.keys(newState)) {
        newState[channelId] = newState[channelId].map((m) => {
          if (m._id !== messageId) return m
          const reactions = [...(m.reactions || [])]
          const existing = reactions.find((r) => r.emoji === emoji)
          if (existing) {
            if (!existing.users.includes(userId)) {
              existing.users = [...existing.users, userId]
            }
          } else {
            reactions.push({ emoji, users: [userId] })
          }
          return { ...m, reactions }
        })
      }
      return { messagesByChannel: newState }
    })
  },

  removeReactionLocal: (messageId, userId, emoji) => {
    set((state) => {
      const newState = { ...state.messagesByChannel }
      for (const channelId of Object.keys(newState)) {
        newState[channelId] = newState[channelId].map((m) => {
          if (m._id !== messageId) return m
          const reactions = (m.reactions || [])
            .map((r) => {
              if (r.emoji !== emoji) return r
              return { ...r, users: r.users.filter((u) => u !== userId) }
            })
            .filter((r) => r.users.length > 0)
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
}),
{
  name: 'flowtask-chat-storage',
  partialize: (state) => ({ messagesByChannel: state.messagesByChannel }),
}
)
)
