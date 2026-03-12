import { create } from 'zustand'
import api from '../services/api'
import logger from '../utils/logger'

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  hasMore: false,
  cursor: null,

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
      const items = data.data?.notifications || []
      const hasMore = data.data?.hasMore ?? false
      const nextCursor = data.data?.nextCursor || null

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
      set({ unreadCount: data.data?.count || 0 })
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
    set((state) => {
      // Deduplicate
      if (state.notifications.some((n) => n._id === notification._id)) return state
      return {
        notifications: [notification, ...state.notifications],
        unreadCount: state.unreadCount + 1,
      }
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
    })
  },
}))
