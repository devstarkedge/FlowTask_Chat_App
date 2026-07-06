import axios from 'axios';
import storage from './storage';
import { secureGet, secureSet, secureMultiRemove } from '../utils/secureStorage';
import ENV from '../config/environment';
import logger from '../utils/logger';

// Use ENV (which already resolves app.json extra + .env + production fallback)
const BASE_URL = ENV.API_BASE_URL;

logger.info('[API] Active BASE_URL:', BASE_URL);

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// In-memory token cache to avoid async AsyncStorage reads on every request
let cachedToken = null;
let cachedWorkspaceId = null;
let cachedFlowtaskToken = null;

/**
 * Pre-load tokens into memory cache. Called once during auth init.
 */
export const primeApiCache = async () => {
  try {
    cachedToken = await secureGet('chat_access_token');
    cachedWorkspaceId = await storage.getItem('active_workspace_id');
    cachedFlowtaskToken = await secureGet('flowtask_token');
  } catch {
    // Silently fail — interceptor will fall back to AsyncStorage
  }
};

/**
 * Update cached token after login/refresh.
 */
export const setCachedToken = (token) => {
  cachedToken = token;
};

/**
 * Update cached workspace ID after workspace switch.
 */
export const setCachedWorkspaceId = (workspaceId) => {
  cachedWorkspaceId = workspaceId;
};

/**
 * Clear all cached values on logout.
 */
export const clearApiCache = () => {
  cachedToken = null;
  cachedWorkspaceId = null;
  cachedFlowtaskToken = null;
};

// Synchronous request interceptor — uses cached values
api.interceptors.request.use((config) => {
  if (cachedToken) {
    config.headers.Authorization = `Bearer ${cachedToken}`;
  }
  if (cachedWorkspaceId) {
    config.headers['X-Workspace-Id'] = cachedWorkspaceId;
  }
  if (cachedFlowtaskToken) {
    config.headers['X-FlowTask-Token'] = cachedFlowtaskToken;
  }
  return config;
});

// Refresh lock — prevent concurrent refresh requests (server rotates tokens)
let refreshPromise = null;

const performRefresh = async () => {
  const refreshToken = await secureGet('chat_refresh_token');
  if (!refreshToken) throw new Error('No refresh token');

  const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
  const newAccessToken = data.data?.accessToken;
  const newRefreshToken = data.data?.refreshToken;

  if (!newAccessToken) throw new Error('No access token in refresh response');

  // Update cache and storage
  cachedToken = newAccessToken;
  await secureSet('chat_access_token', newAccessToken);
  if (newRefreshToken) {
    await secureSet('chat_refresh_token', newRefreshToken);
  }

  return newAccessToken;
};

// Response interceptor — handle 401 and token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and we haven't already retried, attempt token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Use shared promise so concurrent 401s share a single refresh
      if (!refreshPromise) {
        refreshPromise = performRefresh().finally(() => {
          refreshPromise = null;
        });
      }

      try {
        const newToken = await refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed — clear tokens, user will be redirected to login
        clearApiCache();
        await secureMultiRemove([
          'chat_access_token',
          'chat_refresh_token',
        ]);
        await storage.removeItem('chat_user');
        try {
          const { useAuthStore } = require('../stores/authStore');
          useAuthStore.getState().logout();
        } catch (storeError) {
          logger.error('[API] Failed to trigger store logout:', storeError);
        }
      }
    }

    return Promise.reject(error);
  }
);

// Auth API endpoints
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  loginFlowTask: (token) => api.post('/auth/login/flowtask', { token }),
  me: () => api.get('/auth/me'),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
  refresh: (refreshToken) => api.post('/auth/refresh', { refreshToken }),
};

// Workspace API
export const workspaceAPI = {
  mine: () => api.get('/workspaces/mine'),
  create: (data) => api.post('/workspaces', data),
  joinByInviteCode: (inviteCode) => api.post('/workspaces/join', { inviteCode }),
  inviteByEmail: (workspaceId, payload) =>
    api.post(`/workspaces/${workspaceId}/invite-email`, payload, { timeout: 45000 }),
  leave: (workspaceId) => api.post(`/workspaces/${workspaceId}/leave`),

  // ── Invite management ──
  getAllInvites: (workspaceId, params = {}) =>
    api.get(`/workspaces/${workspaceId}/invites`, { params }),
  getPendingInvites: (workspaceId) =>
    api.get(`/workspaces/${workspaceId}/invites/pending`),
  resendInvite: (workspaceId, inviteId) =>
    api.post(`/workspaces/${workspaceId}/invites/${inviteId}/resend`),
  revokeInvite: (workspaceId, inviteId) =>
    api.delete(`/workspaces/${workspaceId}/invites/${inviteId}`),
  acceptEmailInvite: (token) =>
    api.post('/workspaces/accept-invite', { token }),
  getInviteInfo: (token) =>
    api.get(`/workspaces/invite-info/${token}`),
};

// Channel API
export const channelAPI = {
  list: () => api.get('/channels'),
  create: (data) => api.post('/channels', data),
  createDM: (userId) => api.post('/channels/dm', { targetUserId: userId }),
  archive: (id) => api.post(`/channels/${id}/archive`),
  leave: (id) => api.post(`/channels/${id}/leave`),
  pin: (id) => api.put(`/channels/${id}/pin`),
  star: (id) => api.put(`/channels/${id}/star`),
  addMember: (id, userId) => api.post(`/channels/${id}/members`, { userId }),
  removeMember: (id, userId) => api.delete(`/channels/${id}/members/${userId}`),
  search: (q) => api.get('/channels/search', { params: { q } }),
  get: (id) => api.get(`/channels/${id}`),
};

// Thread API
export const threadAPI = {
  getMyThreads: (params) => api.get('/threads/my', { params }),
  getThread: (id) => api.get(`/threads/${id}`),
  getReplies: (id, params) => api.get(`/threads/${id}/replies`, { params }),
  resolve: (id) => api.post(`/threads/${id}/resolve`),
  unresolve: (id) => api.post(`/threads/${id}/unresolve`),
};

// Later (Saved Messages) API — endpoints match server routes: /messages/:id/save/*
export const laterAPI = {
  list: (status) => api.get('/messages/saved', { params: { status } }),
  toggle: (messageId) => api.post(`/messages/${messageId}/save`),
  updateStatus: (messageId, status) => api.patch(`/messages/${messageId}/save/status`, { status }),
  updateReminder: (messageId, reminderData) => api.patch(`/messages/${messageId}/save/reminder`, reminderData),
  delete: (messageId) => api.delete(`/messages/${messageId}/save`),
};

// Scheduled Messages API
export const scheduledAPI = {
  list: () => api.get('/messages/scheduled'),
  create: (data) => api.post('/messages/schedule', data),
  cancel: (id) => api.delete(`/messages/scheduled/${id}`),
  update: (id, data) => api.patch(`/messages/scheduled/${id}`, data),
};

// Messages API (partial) — add helper for proxying file assets
export const messageAPI = {
  getFileProxyUrl: (assetId) => `${api.defaults.baseURL}/messages/files/${encodeURIComponent(assetId)}/proxy`,
};

// Reactions API
export const reactionAPI = {
  add: (messageId, emoji) => api.post(`/messages/${messageId}/reactions`, { emoji }),
  remove: (messageId, emoji) => api.delete(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`),
};

// Files API — reuse backend endpoints used by web client
export const fileAPI = {
  listWorkspace: (params) => api.get('/messages/files', { params }),
  listByChannel: (channelId, params) => api.get(`/channels/${channelId}/files`, { params }),
  deleteFromChannel: (channelId, fileId) => api.delete(`/channels/${channelId}/files/${fileId}`),
  uploadFiles: (channelId, formData, onProgress) =>
    api.post(`/channels/${channelId}/upload`, formData, {
      timeout: 60000,
      onUploadProgress: onProgress,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }),
};

// Users API — presence and custom status
export const usersAPI = {
  setPresence: (status) => api.put('/users/presence', { status }),
  setCustomStatus: (data) => api.put('/users/status', data),
  getChannelMembers: (channelId) => api.get(`/channels/${channelId}/members`),
  getDMContacts: (search) => api.get('/users/dm-contacts', { params: { search } }),
};

// Read Receipts API
export const readReceiptAPI = {
  getUnread: () => api.get("/unread"),
  markRead: (channelId, lastReadMessageId = null) =>
    api.post(`/channels/${channelId}/read`, { lastReadMessageId }),
};

// Pinned messages API
export const pinsAPI = {
  list: (channelId) => api.get(`/channels/${channelId}/pins`),
  pin: (messageId) => api.post(`/messages/${messageId}/pin`),
  unpin: (messageId) => api.delete(`/messages/${messageId}/pin`),
};

// Push Notification API — register/remove device push tokens
export const pushAPI = {
  registerToken: (token, deviceId, platform = 'mobile') =>
    api.post('/push/fcm-token', { token, deviceId, platform }),
  removeToken: (token) =>
    api.delete('/push/fcm-token', { data: { token } }),
};

// Search API (global workspace search)
export const searchAPI = {
  search: ({ q = '', scope = null, limit = null, cursor = null, signal = undefined } = {}) =>
    api.get('/search', { params: { q, scope, limit, cursor }, signal }),
  global: (q, options = {}) => searchAPI.search({ q, ...options }),
};

// Directories API — browse workspace people, channels, groups
export const directoriesAPI = {
  getUsers: (params) => api.get('/directories/users', { params }),
  getChannels: (params) => api.get('/directories/channels', { params }),
  getGroups: () => api.get('/directories/groups'),
  getExternal: () => api.get('/directories/external'),
  getInvitations: () => api.get('/directories/invitations'),
};

// Notification Preferences API
export const notificationPrefAPI = {
  get: () => api.get('/notifications/preferences'),
  update: (data) => api.put('/notifications/preferences', data),
  pause: (data) => api.put('/notifications/preferences/pause', data),
  resume: () => api.post('/notifications/preferences/resume'),
  updateKeywords: (keywords) => api.put('/notifications/preferences/keywords', { keywords }),
  updateVIP: (userIds) => api.put('/notifications/preferences/vip', { userIds }),
  updateChannel: (channelId, data) => api.put(`/notifications/preferences/channel/${channelId}`, data),
  removeChannel: (channelId) => api.delete(`/notifications/preferences/channel/${channelId}`),
};

// ─── Canvas API ───────────────────────────────────────────────────────────────
export const canvasAPI = {
  getTemplates: () => api.get(`/canvas/templates`),
  getById: (canvasId) => api.get(`/canvas/by-id/${canvasId}`),
  getAllForChannel: (channelId) => api.get(`/canvas/channel/all/${channelId}`),
  getMy: () => api.get(`/canvas/my/all`),
  create: (channelId, data) => api.post(`/canvas/${channelId}`, data),
  update: (canvasId, data) => api.put(`/canvas/update/${canvasId}`, data),
  delete: (canvasId) => api.delete(`/canvas/${canvasId}`),
  duplicate: (canvasId) => api.post(`/canvas/duplicate/${canvasId}`),
  getHistory: (canvasId) => api.get(`/canvas/history/${canvasId}`),
  restoreVersion: (canvasId, historyId) =>
    api.post(`/canvas/history/restore/${canvasId}/${historyId}`),
  toggleSaveForLater: (canvasId) => api.post(`/canvas/save-later/${canvasId}`),
  updateSavedStatus: (canvasId, status) =>
    api.patch(`/canvas/save-later/${canvasId}/status`, { status }),
};

// ─── Canvas Comment API ────────────────────────────────────────────────────────
export const canvasCommentAPI = {
  getForCanvas: (canvasId) => api.get(`/canvas-comments/${canvasId}`),
  create: (canvasId, data) => api.post(`/canvas-comments/${canvasId}`, data),
  reply: (commentId, content) =>
    api.post(`/canvas-comments/${commentId}/reply`, { content }),
  resolve: (commentId) => api.patch(`/canvas-comments/${commentId}/resolve`),
};

export default api;

