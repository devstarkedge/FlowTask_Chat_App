import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { channelAPI, readReceiptAPI } from '../services/api'
import toast from 'react-hot-toast'
import logger from '../utils/logger'

export const useChannelStore = create(
  persist(
    (set, get) => ({
  channels: [],
  activeChannelId: null,
  unreads: {},
  isLoading: false,

  // Members per channel
  membersByChannel: {},
  isMembersLoading: false,

  // Channel info panel
  showInfoPanel: false,

  fetchChannels: async (overrideWorkspaceId = null) => {
    set({ isLoading: true })
    try {
      const options = overrideWorkspaceId
        ? { headers: { 'X-Workspace-Id': overrideWorkspaceId } }
        : undefined
      const { data } = await channelAPI.list(options)
      set({ channels: data.data.channels, isLoading: false })
      get().fetchUnreads()
    } catch (error) {
      set({ isLoading: false })
      logger.error('Failed to fetch channels:', error)
    }
  },

  fetchUnreads: async () => {
    try {
      const { data } = await readReceiptAPI.getUnread()
      const unreads = {}
      const lastReadByChannel = {}
      const channelsUpdates = {} // Collect fresh timestamps from unread receipts

      for (const item of data.data.unreads) {
        // channelId might be an object if populated by backend, or just the string ID
        const cid = typeof item.channelId === 'object' && item.channelId !== null
          ? item.channelId._id
          : (item.channelId || item._id)
          
        unreads[cid] = item.unreadCount || 0
        if (item.lastReadMessageId) {
          lastReadByChannel[cid] = item.lastReadMessageId
        }

        // If backend populated the channel details (to bypass the 60s cache during initial load), process them
        if (typeof item.channelId === 'object' && item.channelId !== null && item.channelId.lastMessageAt) {
          channelsUpdates[cid] = {
            lastMessageAt: item.channelId.lastMessageAt,
            lastMessagePreview: item.channelId.lastMessagePreview
          }
        }
      }

      set((state) => {
        let newChannels = state.channels
        if (Object.keys(channelsUpdates).length > 0) {
          newChannels = state.channels.map((c) =>
            channelsUpdates[c._id] ? { ...c, ...channelsUpdates[c._id] } : c
          )
        }
        return { unreads, lastReadByChannel, channels: newChannels }
      })
    } catch (error) {
      logger.error('Failed to fetch unreads:', error)
    }
  },

  setActiveChannel: (channelId) => {
    set({ activeChannelId: channelId, showInfoPanel: false })
    if (channelId) {
      readReceiptAPI.markRead(channelId).catch(() => {})
      set((state) => ({
        unreads: { ...state.unreads, [channelId]: 0 },
      }))
      get().fetchMembers(channelId)
    }
  },

  fetchMembers: async (channelId) => {
    if (!channelId) return
    set({ isMembersLoading: true })
    try {
      const { data } = await channelAPI.getMembers(channelId)
      set((state) => ({
        membersByChannel: {
          ...state.membersByChannel,
          [channelId]: data.data.members,
        },
        isMembersLoading: false,
      }))
    } catch (error) {
      set({ isMembersLoading: false })
      logger.error('Failed to fetch members:', error)
    }
  },

  toggleInfoPanel: () => {
    set((state) => ({ showInfoPanel: !state.showInfoPanel }))
  },

  setShowInfoPanel: (show) => {
    set({ showInfoPanel: show })
  },

  addChannel: (channel) => {
    set((state) => {
      if (state.channels.some((c) => c._id === channel._id)) return state
      return { channels: [...state.channels, channel] }
    })
  },

  removeChannel: (channelId) => {
    set((state) => ({
      channels: state.channels.filter((c) => c._id !== channelId),
      activeChannelId: state.activeChannelId === channelId ? null : state.activeChannelId,
    }))
  },

  updateChannel: (channelId, updates) => {
    set((state) => ({
      channels: state.channels.map((c) =>
        c._id === channelId ? { ...c, ...updates } : c,
      ),
    }))
  },

  updateUnread: (channelId, count) => {
    set((state) => ({
      unreads: { ...state.unreads, [channelId]: count },
    }))
  },

  /**
   * Called when a new message:create socket event arrives.
   * Updates sidebar lastMessageAt + lastMessagePreview and increments
   * unread count for channels that are not currently active.
   * This is the client-side optimistic counterpart to the server's
   * channel:updated + unread:updated socket emissions.
   */
  handleNewMessage: (message) => {
    const { channelId, content, createdAt } = message
    if (!channelId) return

    // Derive a plain-text preview (strip HTML tags, cap at 80 chars)
    const rawText = (content || '').replace(/<[^>]*>/g, '').trim()
    const preview = rawText.length > 80 ? rawText.substring(0, 80) + '\u2026' : rawText
    const timestamp = createdAt || new Date().toISOString()

    set((state) => {
      const isActive = channelId === state.activeChannelId

      // Update the channel's lastMessageAt + lastMessagePreview in the channels array
      const channels = state.channels.map((c) =>
        c._id === channelId
          ? { ...c, lastMessageAt: timestamp, lastMessagePreview: preview }
          : c
      )

      // Only bump unread count when the channel is NOT the one currently open.
      // If it IS active, setActiveChannel already cleared the count.
      const unreads = isActive
        ? state.unreads
        : { ...state.unreads, [channelId]: (state.unreads[channelId] || 0) + 1 }

      return { channels, unreads }
    })
  },

  updateMembersForChannel: (channelId, members) => {
    set((state) => ({
      membersByChannel: {
        ...state.membersByChannel,
        [channelId]: members,
      },
    }))
  },

  getActiveChannel: () => {
    const { channels, activeChannelId } = get()
    return channels.find((c) => c._id === activeChannelId) || null
  },

  getChannelsByType: (type) => {
    return get().channels.filter((c) => c.type === type)
  },

  createChannel: async (data) => {
    const { data: res } = await channelAPI.create(data)
    set((state) => ({ channels: [...state.channels, res.data.channel] }))
    return res.data.channel
  },

  createDM: async (targetUserId) => {
    const target = targetUserId?.toString?.() || String(targetUserId)
    // Deduplication guard: check if DM already exists locally
    // dmParticipants stores ChatUser _id values consistently
    const existing = get().channels.find(
      (c) => {
        if (c.type !== 'dm') return false
        const participants = (c.dmParticipants || []).map((p) => p?.toString?.() || String(p))
        const recipient = c.dmRecipientId?.toString?.() || (c.dmRecipientId ? String(c.dmRecipientId) : null)
        return participants.includes(target) || recipient === target
      }
    )
    if (existing) {
      get().setActiveChannel(existing._id)
      return existing
    }

    try {
      const { data: res } = await channelAPI.createDM(targetUserId)
      const channel = res.data.channel
      set((state) => {
        if (state.channels.some((c) => c._id === channel._id)) return state
        return { channels: [...state.channels, channel] }
      })
      get().setActiveChannel(channel._id)
      return channel
    } catch (error) {
      // Handle USER_NOT_IN_WORKSPACE error with user-friendly message
      const errorCode = error.response?.data?.error?.code
      const errorMsg = error.response?.data?.error?.message
      if (errorCode === 'USER_NOT_IN_WORKSPACE') {
        toast.error(errorMsg || 'This user has not joined Chat yet.')
      } else {
        toast.error(errorMsg || 'Failed to start conversation')
      }
      throw error
    }
  },

  // ─── Channel Management ─────────────────────────────────────────────
  editChannel: async (channelId, data) => {
    try {
      const { data: res } = await channelAPI.update(channelId, data)
      const updated = res.data.channel
      set((state) => ({
        channels: state.channels.map((c) =>
          c._id === channelId ? { ...c, ...updated } : c,
        ),
      }))
      toast.success('Channel updated')
      return updated
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update channel')
      throw error
    }
  },

  archiveChannel: async (channelId) => {
    try {
      await channelAPI.archive(channelId)
      set((state) => ({
        channels: state.channels.filter((c) => c._id !== channelId),
        activeChannelId: state.activeChannelId === channelId ? null : state.activeChannelId,
      }))
      toast.success('Channel archived')
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to archive channel')
      throw error
    }
  },

  addMember: async (channelId, userId) => {
    try {
      await channelAPI.addMember(channelId, userId)
      // Refresh members list
      get().fetchMembers(channelId)
      toast.success('Member added')
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add member')
      throw error
    }
  },

  removeMember: async (channelId, userId) => {
    try {
      await channelAPI.removeMember(channelId, userId)
      get().fetchMembers(channelId)
      toast.success('Member removed')
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to remove member')
      throw error
    }
  },

  leaveChannel: async (channelId) => {
    try {
      await channelAPI.leave(channelId)
      set((state) => ({
        channels: state.channels.filter((c) => c._id !== channelId),
        activeChannelId: state.activeChannelId === channelId ? null : state.activeChannelId,
      }))
      toast.success('Left channel')
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to leave channel')
      throw error
    }
  },

  // ─── Unread with lastReadMessageId ──────────────────────────────────
  lastReadByChannel: {},
}),
{
  name: 'flowtask-channel-storage',
  partialize: (state) => ({ activeChannelId: state.activeChannelId }),
}
)
)
