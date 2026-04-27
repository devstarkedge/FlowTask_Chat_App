import { create } from 'zustand'
import api from '../services/api'
import { notificationAPI } from '../services/api'
import logger from '../utils/logger'
import { normalizeNotification } from '../utils/notificationFormat'

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  hasMore: false,
  cursor: null,

  // ─── Notification Preferences ──────────────────────────────────────
  preferences: null,
  preferencesLoading: false,

  // ─── Pause state ───────────────────────────────────────────────────
  isPaused: false,
  pauseResumeAt: null,

  // ─── Active filter for notification panel ──────────────────────────
  activeFilter: 'all', // 'all' | 'dms' | 'mentions' | 'threads'

  // ─── Fetch notifications (paginated) ─────────────────────────────────
  fetchNotifications: async (reset = false) => {
    const { isLoading, cursor } = get()
    if (isLoading) return
    if (!reset && cursor === null && get().notifications.length > 0) return

    set({ isLoading: true })
    try {
      const params = { limit: 30 }
      if (!reset && cursor) params.cursor = cursor

      const { data } = await api.get('/notifications', { params })
      const payload = data?.data || data || {}
      const items = payload.notifications || []
      const hasMore = payload.hasMore ?? false
      const nextCursor = payload.nextCursor || null

      set((state) => ({
        notifications: reset ? items : [...state.notifications, ...items],
        hasMore,
        cursor: nextCursor,
        isLoading: false,
      }))
    } catch (error) {
      set({ isLoading: false })
      logger.error('Failed to fetch notifications:', error)
    }
  },

  // ─── Fetch unread count ──────────────────────────────────────────────
  fetchUnreadCount: async () => {
    try {
      const { data } = await api.get('/notifications/unread-count')
      const payload = data?.data || data || {}
      set({ unreadCount: payload.count || 0 })
    } catch (error) {
      logger.error('Failed to fetch unread count:', error)
    }
  },

  // ─── Mark single notification as read ────────────────────────────────
  markAsRead: async (notificationId) => {
    try {
      await api.post(`/notifications/${notificationId}/read`)
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n._id === notificationId ? { ...n, isRead: true, readAt: new Date().toISOString() } : n,
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }))
    } catch (error) {
      logger.error('Failed to mark notification as read:', error)
    }
  },

  // ─── Mark all as read ────────────────────────────────────────────────
  markAllAsRead: async () => {
    try {
      await api.post('/notifications/read-all')
      set((state) => ({
        notifications: state.notifications.map((n) => ({
          ...n,
          isRead: true,
          readAt: n.readAt || new Date().toISOString(),
        })),
        unreadCount: 0,
      }))
    } catch (error) {
      logger.error('Failed to mark all notifications as read:', error)
    }
  },

  // ─── Add notification from socket (real-time) ────────────────────────
  addNotification: (notification) => {
    const normalized = normalizeNotification(notification)
    if (!normalized) return

    set((state) => {
      // Deduplicate
      if (state.notifications.some((n) => n._id === normalized._id)) return state
      return {
        notifications: [normalized, ...state.notifications],
        unreadCount: state.unreadCount + 1,
      }
    })
  },

  // ─── Dismiss notification (multi-device sync) ────────────────────────
  dismissNotification: (notificationId) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n._id !== notificationId),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }))
  },

  // ─── Sync read state from another device ─────────────────────────────
  syncReadState: ({ notificationId, channelId }) => {
    set((state) => {
      let unreadDelta = 0
      const updated = state.notifications.map((n) => {
        const shouldMark = (notificationId && n._id === notificationId)
          || (channelId && n.channelId === channelId && !n.isRead)
        if (shouldMark && !n.isRead) {
          unreadDelta++
          return { ...n, isRead: true, readAt: new Date().toISOString() }
        }
        return n
      })
      return {
        notifications: updated,
        unreadCount: Math.max(0, state.unreadCount - unreadDelta),
      }
    })
  },

  // ─── Set active filter ───────────────────────────────────────────────
  setActiveFilter: (filter) => set({ activeFilter: filter }),

  // ─── Get filtered notifications ──────────────────────────────────────
  getFilteredNotifications: () => {
    const { notifications, activeFilter } = get()
    if (activeFilter === 'all') return notifications
    if (activeFilter === 'dms') return notifications.filter((n) => n.type === 'dm' || n.category === 'dm')
    if (activeFilter === 'mentions') return notifications.filter((n) => n.type === 'mention' || n.category === 'mention' || n.type === 'keyword_match')
    if (activeFilter === 'threads') return notifications.filter((n) => n.type === 'thread_reply' || n.category === 'thread_reply')
    return notifications
  },

  // ─── Fetch notification preferences ──────────────────────────────────
  fetchPreferences: async () => {
    set({ preferencesLoading: true })
    try {
      const { data } = await notificationAPI.getPreferences()
      const prefs = data?.data || data || {}
      set({
        preferences: prefs,
        preferencesLoading: false,
        isPaused: prefs.pause?.active || false,
        pauseResumeAt: prefs.pause?.resumeAt || null,
      })
    } catch (error) {
      set({ preferencesLoading: false })
      logger.error('Failed to fetch notification preferences:', error)
    }
  },

  // ─── Update global preferences ───────────────────────────────────────
  updatePreferences: async (updates) => {
    try {
      const { data } = await notificationAPI.updatePreferences(updates)
      const prefs = data?.data || data || {}
      set({
        preferences: prefs,
        isPaused: prefs.pause?.active || false,
        pauseResumeAt: prefs.pause?.resumeAt || null,
      })
      return true
    } catch (error) {
      logger.error('Failed to update notification preferences:', error)
      return false
    }
  },

  // ─── Update per-channel preference ───────────────────────────────────
  updateChannelPreference: async (channelId, pref) => {
    try {
      const { data } = await notificationAPI.updateChannelPreference(channelId, pref)
      set({ preferences: data?.data || data || get().preferences })
      return true
    } catch (error) {
      logger.error('Failed to update channel preference:', error)
      return false
    }
  },

  // ─── Pause notifications ─────────────────────────────────────────────
  pauseNotifications: async (duration) => {
    try {
      const { data } = await notificationAPI.pauseNotifications({ duration })
      const prefs = data?.data || data || {}
      set({
        preferences: prefs,
        isPaused: true,
        pauseResumeAt: prefs.pause?.resumeAt || null,
      })
      return true
    } catch (error) {
      logger.error('Failed to pause notifications:', error)
      return false
    }
  },

  // ─── Resume notifications ────────────────────────────────────────────
  resumeNotifications: async () => {
    try {
      const { data } = await notificationAPI.resumeNotifications()
      const prefs = data?.data || data || {}
      set({
        preferences: prefs,
        isPaused: false,
        pauseResumeAt: null,
      })
      return true
    } catch (error) {
      logger.error('Failed to resume notifications:', error)
      return false
    }
  },

  // ─── Update keywords ─────────────────────────────────────────────────
  updateKeywords: async (keywords) => {
    try {
      const { data } = await notificationAPI.updateKeywords(keywords)
      set({ preferences: data?.data || data || get().preferences })
      return true
    } catch (error) {
      logger.error('Failed to update keywords:', error)
      return false
    }
  },

  // ─── Apply preferences from socket sync ──────────────────────────────
  applyPreferences: (prefs) => {
    set({
      preferences: prefs,
      isPaused: prefs.pause?.active || false,
      pauseResumeAt: prefs.pause?.resumeAt || null,
    })
  },

  // ─── Clear all state (for workspace switching/logout) ────────────────
  clearNotifications: () => {
    set({
      notifications: [],
      unreadCount: 0,
      isLoading: false,
      hasMore: false,
      cursor: null,
      preferences: null,
      preferencesLoading: false,
      isPaused: false,
      pauseResumeAt: null,
      activeFilter: 'all',
    })
  },
}))
