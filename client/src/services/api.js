import axios from 'axios'
import { useAuthStore } from '../stores/authStore'

const api = axios.create({
  baseURL: '/api/chat',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle auth errors globally
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
    }
    return Promise.reject(error)
  },
)

// ─── Auth ────────────────────────────────────────────────────────────────
export const authAPI = {
  sync: () => api.post('/auth/sync'),
  me: () => api.get('/auth/me'),
  updatePreferences: (prefs) => api.put('/auth/preferences', prefs),
}

// ─── Channels ────────────────────────────────────────────────────────────
export const channelAPI = {
  list: () => api.get('/channels'),
  get: (id) => api.get(`/channels/${id}`),
  getBySlug: (slug) => api.get(`/channels/slug/${slug}`),
  create: (data) => api.post('/channels', data),
  update: (id, data) => api.put(`/channels/${id}`, data),
  archive: (id) => api.post(`/channels/${id}/archive`),
  createDM: (targetUserId) => api.post('/channels/dm', { targetUserId }),
  addMember: (id, userId) => api.post(`/channels/${id}/members`, { userId }),
  removeMember: (id, userId) => api.delete(`/channels/${id}/members/${userId}`),
  leave: (id) => api.post(`/channels/${id}/leave`),
  search: (q) => api.get('/channels/search', { params: { q } }),
  getMembers: (id) => api.get(`/channels/${id}/members`),
}

// ─── Messages ────────────────────────────────────────────────────────────
export const messageAPI = {
  list: (channelId, params) => api.get(`/channels/${channelId}/messages`, { params }),
  send: (channelId, data) => api.post(`/channels/${channelId}/messages`, data),
  get: (id) => api.get(`/messages/${id}`),
  edit: (id, content) => api.put(`/messages/${id}`, { content }),
  delete: (id) => api.delete(`/messages/${id}`),
  addReaction: (id, emoji) => api.post(`/messages/${id}/reactions`, { emoji }),
  removeReaction: (id, emoji) => api.delete(`/messages/${id}/reactions/${emoji}`),
  pin: (id) => api.post(`/messages/${id}/pin`),
  unpin: (id) => api.delete(`/messages/${id}/pin`),
  getPinned: (channelId) => api.get(`/channels/${channelId}/pins`),
  search: (q, channelId) => api.get('/messages/search', { params: { q, channelId } }),
  uploadFiles: (channelId, formData) => api.post(`/channels/${channelId}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  }),
}

// ─── Threads ─────────────────────────────────────────────────────────────
export const threadAPI = {
  create: (data) => api.post('/threads', data),
  get: (id) => api.get(`/threads/${id}`),
  replies: (id, params) => api.get(`/threads/${id}/replies`, { params }),
  byTask: (taskId) => api.get(`/threads/task/${taskId}`),
  channelThreads: (channelId) => api.get(`/channels/${channelId}/threads`),
  myThreads: () => api.get('/threads/my'),
  lock: (id) => api.post(`/threads/${id}/lock`),
  resolve: (id) => api.post(`/threads/${id}/resolve`),
  updateTitle: (id, title) => api.put(`/threads/${id}/title`, { title }),
}

// ─── Read Receipts ───────────────────────────────────────────────────────
export const readReceiptAPI = {
  getUnread: () => api.get('/unread'),
  markRead: (channelId, lastReadMessageId) =>
    api.post(`/channels/${channelId}/read`, { lastReadMessageId }),
}

// ─── Bot ─────────────────────────────────────────────────────────────────
export const botAPI = {
  command: (command, channelId) => api.post('/bot/command', { command, channelId }),
}

export default api
