import { create } from 'zustand';
import api from '../services/api';
import logger from '../utils/logger';

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  hasMore: false,
  cursor: null,
  activeFilter: 'all', // all | dms | mentions | threads
  _lastFetchAt: 0,

  fetchNotifications: async (cursor = null) => {
    // Cooldown: prevent re-fetch within 3 seconds to avoid loops
    const now = Date.now();
    if (!cursor && now - get()._lastFetchAt < 3000) return;

    set({ isLoading: true, error: null, _lastFetchAt: now });
    try {
      const params = { limit: 30 };
      if (cursor) params.cursor = cursor;
      const currentFilter = get().activeFilter;
      if (currentFilter && currentFilter !== 'all') {
        params.filter = currentFilter;
      }
      const { data } = await api.get('/notifications', { params });

      // Server returns { success, notifications, hasMore, nextCursor } at top level
      // but some endpoints may wrap in data.data — handle both
      const payload = data?.data || data || {};
      const items = payload.notifications || payload.items || [];
      const hasMore = payload.hasMore ?? false;
      const nextCursor = payload.nextCursor || payload.cursor || null;

      set((state) => {
        // Normalize read/isRead fields from API
        const normalized = items.map(n => ({
          ...n,
          read: n.isRead !== undefined ? n.isRead : (n.read || false),
          isRead: n.isRead !== undefined ? n.isRead : (n.read || false),
        }));
        const merged = cursor
          ? [...state.notifications, ...normalized]
          : normalized;
        // Dedup by _id
        const unique = Array.from(new Map(merged.map(n => [n._id, n])).values());
        return { notifications: unique, hasMore, cursor: nextCursor, isLoading: false, error: null };
      });
    } catch (error) {
      logger.error('Failed to fetch notifications:', error?.response?.data?.error?.message || error.message);
      set({ isLoading: false, error: error.message || 'Failed to load activity' });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const { data } = await api.get('/notifications/unread-count');
      const payload = data?.data || data || {};
      set({ unreadCount: payload.count || 0 });
    } catch (error) {
      logger.error('Failed to fetch unread count:', error?.response?.data?.error?.message || error.message);
    }
  },

  markAsRead: async (notificationId) => {
    try {
      await api.post(`/notifications/${notificationId}/read`);
      set((state) => ({
        notifications: state.notifications.map(n =>
          n._id === notificationId ? { ...n, read: true, isRead: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    } catch (error) {
      logger.error('Failed to mark notification as read:', error);
    }
  },

  markAllAsRead: async () => {
    try {
      await api.post('/notifications/read-all');
      set((state) => ({
        notifications: state.notifications.map(n => ({ ...n, read: true, isRead: true })),
        unreadCount: 0,
      }));
    } catch (error) {
      logger.error('Failed to mark all as read:', error);
    }
  },

  addNotification: (notification) => {
    set((state) => {
      if (state.notifications.some(n => n._id === notification._id)) return state;
      // Server may send `isRead` or `read` — normalize
      const isRead = notification.isRead || notification.read || false;
      return {
        notifications: [{ ...notification, read: isRead, isRead }, ...state.notifications],
        unreadCount: state.unreadCount + (isRead ? 0 : 1),
      };
    });
  },

  setUnreadCount: (count) => set({ unreadCount: count }),

  setFilter: (filter) => set({ activeFilter: filter, notifications: [], cursor: null, hasMore: false, _lastFetchAt: 0 }),

  getFilteredNotifications: () => {
    const { notifications, activeFilter } = get();
    if (activeFilter === 'all') return notifications;
    return notifications.filter(n => {
      const type = n.type || n.notificationType || '';
      if (activeFilter === 'mentions') return type.includes('mention');
      if (activeFilter === 'reactions') return type.includes('reaction');
      if (activeFilter === 'threads') return type.includes('thread');
      if (activeFilter === 'dms') return type.includes('dm') || type.includes('direct');
      return true;
    });
  },

  clearNotifications: () => set({ notifications: [], unreadCount: 0, cursor: null, hasMore: false }),
}));
