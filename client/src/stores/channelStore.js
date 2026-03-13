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
      for (const item of data.data.unreads) {
        const cid = item.channelId || item._id
        unreads[cid] = item.unreadCount || 0
        if (item.lastReadMessageId) {
          lastReadByChannel[cid] = item.lastReadMessageId
        }
      }
      set({ unreads, lastReadByChannel })
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
    // Deduplication guard: check if DM already exists locally
    // dmParticipants stores ChatUser _id values consistently
    const existing = get().channels.find(
      (c) => c.type === 'dm' && c.dmParticipants?.includes(targetUserId)
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
