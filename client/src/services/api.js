import axios from 'axios'
import { useAuthStore } from '../stores/authStore'
import { useWorkspaceStore } from '../stores/workspaceStore'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/chat',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT + Workspace header to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  const workspaceId = useWorkspaceStore.getState().activeWorkspaceId
  if (workspaceId) {
    config.headers['X-Workspace-Id'] = workspaceId
  }
  return config
})

// Handle auth errors globally — try refresh before logging out
let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach((p) => {
    if (error) p.reject(error)
    else p.resolve(token)
  })
  failedQueue = []
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = useAuthStore.getState().refreshToken
      if (!refreshToken) {
        useAuthStore.getState().logout()
        return Promise.reject(error)
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return api(originalRequest)
        }).catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const { data } = await axios.post(
          `${api.defaults.baseURL}/auth/refresh`,
          { refreshToken },
          { headers: { 'Content-Type': 'application/json' } },
        )

        const { accessToken: newAccess, refreshToken: newRefresh } = data.data
        useAuthStore.getState().setTokens(newAccess, newRefresh)

        originalRequest.headers.Authorization = `Bearer ${newAccess}`
        processQueue(null, newAccess)
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        useAuthStore.getState().logout()
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)

// ─── Auth ────────────────────────────────────────────────────────────────
export const authAPI = {
  // Native auth
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),

  // FlowTask SSO
  loginFlowTask: (token) => api.post('/auth/login/flowtask', { token }),
  sync: () => api.post('/auth/sync'),

  // Token management
  refresh: (refreshToken) => api.post('/auth/refresh', { refreshToken }),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),

  // Email verification
  resendVerification: (email) => api.post('/auth/resend-verification', { email }),

  // Password reset
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (data) => api.post('/auth/reset-password', data),

  // Profile
  me: () => api.get('/auth/me'),
  updatePreferences: (prefs) => api.put('/auth/preferences', prefs),
  searchUsers: (q) => api.get('/auth/users/search', { params: { q } }),
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
  // Mark DM messages as seen (REST fallback when socket unavailable)
  markDMSeen: (channelId) => api.post(`/channels/${channelId}/seen`),
  uploadFiles: (channelId, formData, onUploadProgress) => api.post(`/channels/${channelId}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
    onUploadProgress,
  }),
  // Direct Cloudinary upload support
  getUploadSignature: (channelId) => api.post(`/channels/${channelId}/upload/sign`),
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

// ─── Users ───────────────────────────────────────────────────────────────
export const userAPI = {
  getProfile: (id) => api.get(`/users/${id}`),
  search: (q) => api.get('/users/search', { params: { q } }),
  getOnline: () => api.get('/users/online'),
  setCustomStatus: (status) => api.put('/users/status', status),
  clearCustomStatus: () => api.delete('/users/status'),
  setPresence: (status) => api.put('/users/presence', { status }),  // DM contacts: merged FlowTask + ChatApp users with availability badges
  getDMContacts: (search) => api.get('/users/dm-contacts', { params: { search } }),}

// ─── Notifications ───────────────────────────────────────────────────────
export const notificationAPI = {
  list: (params) => api.get('/notifications', { params }),
  markAsRead: (id) => api.post(`/notifications/${id}/read`),
  markAllAsRead: () => api.post('/notifications/read-all'),
  getUnreadCount: () => api.get('/notifications/unread-count'),
}

// ─── Workspaces ──────────────────────────────────────────────────────────
export const workspaceAPI = {
  mine: () => api.get('/workspaces/mine'),
  create: (data) => api.post('/workspaces', data),
  get: (id) => api.get(`/workspaces/${id}`),
  getBySlug: (slug) => api.get(`/workspaces/slug/${slug}`),
  update: (id, data) => api.patch(`/workspaces/${id}`, data),
  delete: (id) => api.delete(`/workspaces/${id}`),
  getMembers: (id) => api.get(`/workspaces/${id}/members`),
  inviteMember: (id, data) => api.post(`/workspaces/${id}/members`, data),
  removeMember: (id, userId) => api.delete(`/workspaces/${id}/members/${userId}`),
  updateMemberRole: (id, userId, data) => api.patch(`/workspaces/${id}/members/${userId}`, data),
  leaveWorkspace: (id) => api.post(`/workspaces/${id}/leave`),
  joinByInviteCode: (inviteCode) => api.post('/workspaces/join', { inviteCode }),
  regenerateInviteCode: (id) => api.post(`/workspaces/${id}/invite-code`),
  // Email invites
  inviteByEmail: (id, data) => api.post(`/workspaces/${id}/invite-email`, data),
  getPendingInvites: (id) => api.get(`/workspaces/${id}/invites`),
  revokeInvite: (id, inviteId) => api.delete(`/workspaces/${id}/invites/${inviteId}`),
  acceptEmailInvite: (token) => api.post('/workspaces/accept-invite', { token }),
}

// ─── Saved Messages ──────────────────────────────────────────────────────
export const savedMessageAPI = {
  list: () => api.get('/messages/saved'),
  toggle: (messageId) => api.post(`/messages/${messageId}/save`),
}

// ─── Scheduled Messages ──────────────────────────────────────────────────
export const scheduledMessageAPI = {
  list: () => api.get('/messages/scheduled'),
  create: (channelId, data) => api.post(`/channels/${channelId}/scheduled-messages`, data),
  cancel: (id) => api.delete(`/messages/scheduled/${id}`),
}

// ─── Admin ───────────────────────────────────────────────────────────────
export const adminAPI = {
  getAnalytics: () => api.get('/admin/analytics'),
  listUsers: (params) => api.get('/admin/users', { params }),
  changeUserRole: (userId, role) => api.patch(`/admin/users/${userId}/role`, { role }),
  deactivateUser: (userId) => api.post(`/admin/users/${userId}/deactivate`),
  activateUser: (userId) => api.post(`/admin/users/${userId}/activate`),
  listChannels: (params) => api.get('/admin/channels', { params }),
  archiveChannel: (channelId) => api.post(`/admin/channels/${channelId}/archive`),
  unarchiveChannel: (channelId) => api.post(`/admin/channels/${channelId}/unarchive`),
  deleteChannel: (channelId) => api.delete(`/admin/channels/${channelId}`),
  getSettings: () => api.get('/admin/settings'),
  updateSettings: (settings) => api.patch('/admin/settings', settings),
}

// ─── Organizations ───────────────────────────────────────────────────────
export const organizationAPI = {
  list: () => api.get('/organizations'),
  create: (data) => api.post('/organizations', data),
  get: (id) => api.get(`/organizations/${id}`),
  update: (id, data) => api.put(`/organizations/${id}`, data),
  getWorkspaces: (id) => api.get(`/organizations/${id}/workspaces`),
  getMembers: (id) => api.get(`/organizations/${id}/members`),
  addMember: (id, data) => api.post(`/organizations/${id}/members`, data),
  removeMember: (id, userId) => api.delete(`/organizations/${id}/members/${userId}`),
}

export default api
