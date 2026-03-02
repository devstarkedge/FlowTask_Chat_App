import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { channelAPI, readReceiptAPI } from '../services/api'

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

  fetchChannels: async () => {
    set({ isLoading: true })
    try {
      const { data } = await channelAPI.list()
      set({ channels: data.data.channels, isLoading: false })
      get().fetchUnreads()
    } catch (error) {
      set({ isLoading: false })
      console.error('Failed to fetch channels:', error)
    }
  },

  fetchUnreads: async () => {
    try {
      const { data } = await readReceiptAPI.getUnread()
      const unreads = {}
      for (const item of data.data.unreads) {
        unreads[item.channelId || item._id] = item.unreadCount || 0
      }
      set({ unreads })
    } catch (error) {
      console.error('Failed to fetch unreads:', error)
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
      console.error('Failed to fetch members:', error)
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
    const existing = get().channels.find(
      (c) => c.type === 'dm' && c.dmParticipants?.includes(targetUserId)
    )
    if (existing) {
      get().setActiveChannel(existing._id)
      return existing
    }

    const { data: res } = await channelAPI.createDM(targetUserId)
    const channel = res.data.channel
    set((state) => {
      if (state.channels.some((c) => c._id === channel._id)) return state
      return { channels: [...state.channels, channel] }
    })
    get().setActiveChannel(channel._id)
    return channel
  },
}),
{
  name: 'flowtask-channel-storage',
  partialize: (state) => ({ activeChannelId: state.activeChannelId }),
}
)
)
