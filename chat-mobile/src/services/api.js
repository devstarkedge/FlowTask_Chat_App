import { Platform } from 'react-native';
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
  cachedWorkspaceId = workspaceId || null;
};

/**
 * Resolve workspace ID for API headers.
 * Prefer in-memory cache; fall back to workspace store so requests still work
 * when persist rehydrated activeWorkspaceId but cache was never primed.
 */
export const resolveWorkspaceId = () => {
  if (cachedWorkspaceId) return cachedWorkspaceId;
  try {
    const { useWorkspaceStore } = require('../stores/workspaceStore');
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId;
    if (workspaceId) {
      cachedWorkspaceId = workspaceId;
      return workspaceId;
    }
  } catch {
    // Store may not be ready yet during very early boot
  }
  return null;
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
  const workspaceId = resolveWorkspaceId();
  if (workspaceId) {
    config.headers['X-Workspace-Id'] = workspaceId;
  }
  if (cachedFlowtaskToken) {
    config.headers['X-FlowTask-Token'] = cachedFlowtaskToken;
  }

  // ── FormData detection ───────────────────────────────────────────────────
  // React Native’s native XHR auto‑generates the multipart boundary.
  // In React Native (Hermes / Android), config.data is a polyfilled FormData
  // where (config.data instanceof FormData) may evaluate to false. We check _parts
  // to ensure Content-Type is always deleted so RN's XHR module sets boundary.
  const isFormData =
    config.data &&
    (config.data instanceof FormData ||
      Object.prototype.toString.call(config.data) === '[object FormData]' ||
      typeof config.data._parts !== 'undefined');

  if (isFormData) {
    if (config.headers) {
      if (typeof config.headers.delete === 'function') {
        config.headers.delete('Content-Type');
        config.headers.delete('content-type');
      } else {
        delete config.headers['Content-Type'];
        delete config.headers['content-type'];
      }
      if (config.headers.common) {
        if (typeof config.headers.common.delete === 'function') {
          config.headers.common.delete('Content-Type');
          config.headers.common.delete('content-type');
        } else {
          delete config.headers.common['Content-Type'];
          delete config.headers.common['content-type'];
        }
      }
      if (config.headers.post) {
        if (typeof config.headers.post.delete === 'function') {
          config.headers.post.delete('Content-Type');
          config.headers.post.delete('content-type');
        } else {
          delete config.headers.post['Content-Type'];
          delete config.headers.post['content-type'];
        }
      }
    }
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

// Response interceptor — handle 401 and token refresh, and auto-sync presence
api.interceptors.response.use(
  (response) => {
    // Auto-sync any presence data found in the response payload to the global store
    setTimeout(() => {
      try {
        const { useWorkspaceStore } = require('../stores/workspaceStore');
        const updates = {};
        let updated = false;

        const scan = (obj, depth = 0) => {
          if (depth > 10) return; // Prevent infinite recursion
          if (!obj || typeof obj !== 'object') return;
          if (Array.isArray(obj)) {
            obj.forEach(item => scan(item, depth + 1));
          } else {
            const getIdStr = (id) => typeof id === 'object' ? id?._id?.toString?.() || id?.id?.toString?.() : id?.toString?.();
            const oId = getIdStr(obj._id);
            if (oId && obj.onlineStatus) {
              updates[oId] = obj.onlineStatus;
              updated = true;
            }
            if (obj.userId && typeof obj.userId === 'object' && obj.userId.onlineStatus) {
              const uId = getIdStr(obj.userId);
              if (uId) {
                updates[uId] = obj.userId.onlineStatus;
                updated = true;
              }
            }
            if (obj.dmRecipientId && obj.onlineStatus) {
              const dmId = getIdStr(obj.dmRecipientId);
              if (dmId) {
                updates[dmId] = obj.onlineStatus;
                updated = true;
              }
            }
            Object.values(obj).forEach(val => scan(val, depth + 1));
          }
        };

        scan(response.data);

        if (updated) {
          useWorkspaceStore.getState().updatePresenceBatch(updates);
        }
      } catch (e) {
        // Silently ignore scanner errors to prevent breaking app flow
      }
    }, 0);

    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const isLoginRoute = originalRequest.url?.includes('/auth/login');

    // If 401 and we haven't already retried, attempt token refresh (skip for login routes)
    if (error.response?.status === 401 && !originalRequest._retry && !isLoginRoute) {
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

    // Handle Workspace Not Found or Membership Revoked
    if (
      (error.response?.status === 404 && error.response?.data?.message?.includes('Workspace not found')) ||
      (error.response?.status === 403 && error.response?.data?.message?.includes('Workspace membership required'))
    ) {
      if (!originalRequest._workspaceRetry) {
        originalRequest._workspaceRetry = true;
        const invalidWorkspaceId = originalRequest.headers['X-Workspace-Id'];
        if (invalidWorkspaceId) {
          try {
            const { useWorkspaceStore } = require('../stores/workspaceStore');
            logger.warn(`[API] Invalid workspace detected (${invalidWorkspaceId}), attempting recovery...`);
            // Trigger cleanup which will switch to another workspace or clear state
            useWorkspaceStore.getState().afterWorkspaceRemoved(invalidWorkspaceId);
          } catch (storeError) {
            logger.error('[API] Failed to trigger workspace recovery:', storeError);
          }
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
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
};

// Workspace API
export const workspaceAPI = {
  mine: () => api.get('/workspaces/mine'),
  create: (data) => api.post('/workspaces', data),
  get: (id) => api.get(`/workspaces/${id}`),
  update: (id, data) => api.patch(`/workspaces/${id}`, data),
  delete: (id) => api.delete(`/workspaces/${id}`),
  joinByInviteCode: (inviteCode) => api.post('/workspaces/join', { inviteCode }),
  inviteByEmail: (workspaceId, payload) =>
    api.post(`/workspaces/${workspaceId}/invite-email`, payload, { timeout: 45000 }),
  leave: (workspaceId) => api.post(`/workspaces/${workspaceId}/leave`),
  getMembers: (id, params) => api.get(`/workspaces/${id}/members`, { params }),
  updateMemberRole: (workspaceId, memberId, role) =>
    api.patch(`/workspaces/${workspaceId}/members/${memberId}`, { role }),
  removeMember: (workspaceId, memberId) =>
    api.delete(`/workspaces/${workspaceId}/members/${memberId}`),

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
  regenerateInviteCode: (workspaceId) =>
    api.post(`/workspaces/${workspaceId}/invite-code/regenerate`, {}),

  // ── Settings ──
  updateDomainRestrictions: (workspaceId, payload) =>
    api.patch(`/workspaces/${workspaceId}/settings/domain-restrictions`, payload),
  updateGuestSettings: (workspaceId, payload) =>
    api.patch(`/workspaces/${workspaceId}/settings/guest-settings`, payload),
  getSecuritySettings: (workspaceId) =>
    api.get(`/workspaces/${workspaceId}/settings/security`),
  updateSecuritySettings: (workspaceId, payload) =>
    api.patch(`/workspaces/${workspaceId}/settings/security`, payload),
  getNotificationSettings: (workspaceId) =>
    api.get(`/workspaces/${workspaceId}/settings/notifications`),
  updateNotificationSettings: (workspaceId, payload) =>
    api.patch(`/workspaces/${workspaceId}/settings/notifications`, payload),
  getIntegrationSettings: (workspaceId) =>
    api.get(`/workspaces/${workspaceId}/settings/integrations`),
  updateIntegrationSettings: (workspaceId, payload) =>
    api.patch(`/workspaces/${workspaceId}/settings/integrations`, payload),
  getBilling: (workspaceId) =>
    api.get(`/workspaces/${workspaceId}/billing`),
  upgradePlan: (workspaceId, plan) =>
    api.post(`/workspaces/${workspaceId}/upgrade-plan`, { plan }),
  getActiveSessions: (workspaceId) =>
    api.get(`/workspaces/${workspaceId}/sessions`),
  logoutAllSessions: (workspaceId) =>
    api.post(`/workspaces/${workspaceId}/sessions/logout-all`),
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
  update: (id, data) => api.put(`/channels/${id}`, data),
};

// Thread API
export const threadAPI = {
  getMyThreads: (params) => api.get('/threads/my', { params }),
  getThread: (id) => api.get(`/threads/${id}`),
  getReplies: (id, params) => api.get(`/threads/${id}/replies`, { params }),
  resolve: (id) => api.post(`/threads/${id}/resolve`),
  unresolve: (id) => api.post(`/threads/${id}/unresolve`),
  mute: (id) => api.post(`/threads/${id}/mute`),
  unmute: (id) => api.post(`/threads/${id}/unmute`),
};

// Later (Saved Messages) API — endpoints match server routes: /messages/:id/save/*
export const laterAPI = {
  list: (status) => api.get('/messages/saved', { params: { status } }),
  toggle: (messageId, data) => api.post(`/messages/${messageId}/save`, data),
  updateStatus: (messageId, status) => api.patch(`/messages/${messageId}/save/status`, { status }),
  updateReminder: (messageId, data) => api.patch(`/messages/${messageId}/save/reminder`, data),
  snoozeReminder: (messageId, minutes) => api.patch(`/messages/${messageId}/save/reminder/snooze`, { minutes }),
  createStandaloneReminder: (data, headers) => api.post('/messages/reminders/standalone', data, headers),
  deleteReminder: (id) => api.delete(`/messages/reminders/${id}`),
};

// Scheduled Messages API
export const scheduledAPI = {
  list: () => api.get('/messages/scheduled'),
  create: (channelId, data) => api.post(`/channels/${channelId}/scheduled-messages`, data),
  cancel: (id) => api.delete(`/messages/scheduled/${id}`),
  reschedule: (id, scheduledAt) => api.patch(`/messages/reschedule/${id}`, { scheduledAt }),
  update: (id, data) => api.patch(`/messages/scheduled/${id}`, data),
  sendNow: (id) => api.post(`/messages/send-now/${id}`),
};

// Messages API (partial) — add helper for proxying file assets
export const messageAPI = {
  get: (messageId) => api.get(`/messages/${messageId}`),
  getInfo: (messageId, channelId) => api.get(`/messages/${messageId}/info`, { params: { channelId } }),
  getFileProxyUrl: (assetId) => `${api.defaults.baseURL}/messages/files/${encodeURIComponent(assetId)}/proxy`,
  forward: (messageId, data) => api.post(`/messages/${messageId}/forward`, data),
  forwardToNewGroup: (messageId, data) => api.post(`/messages/${messageId}/forward-group`, data),
  markUnread: (channelId, messageId) => api.post(`/channels/${channelId}/messages/${messageId}/mark-unread`),
  search: (params) => api.get('/messages/search', { params }),
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
  uploadFiles: async (channelId, formData, onProgress, isSync = false) => {
    const isGlobalUpload = !channelId || channelId === 'messages' || channelId === '000000000000000000000000';
    const uploadUrl = isGlobalUpload 
      ? `${BASE_URL}/messages/upload${isSync ? '?sync=true' : ''}`
      : `${BASE_URL}/channels/${channelId}/upload${isSync ? '?sync=true' : ''}`;
    
    // On native platforms (especially Android), use Expo FileSystem.uploadAsync for OkHttp native multipart upload
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      try {
        const FileSystem = require('expo-file-system/legacy');
        const parts = formData?._parts || [];
        const fileParts = parts.filter(([_, val]) => val && typeof val === 'object' && val.uri);
        
        if (fileParts.length > 0) {
          const workspaceId = resolveWorkspaceId();
          const uploadHeaders = {
            ...(cachedToken ? { Authorization: `Bearer ${cachedToken}` } : {}),
            ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
          };

          const uploadedFiles = [];
          for (const [fieldName, fileObj] of fileParts) {
            let fileUri = fileObj.uri;
            if (Platform.OS === 'android' && !fileUri.startsWith('file://') && !fileUri.startsWith('content://')) {
              fileUri = `file://${fileUri}`;
            }

            const uploadOptions = {
              fieldName: fieldName || 'files',
              httpMethod: 'POST',
              uploadType: FileSystem.FileSystemUploadType.MULTIPART,
              headers: uploadHeaders,
              mimeType: fileObj.type || 'image/jpeg',
            };

            let response;
            if (onProgress) {
              const uploadTask = FileSystem.createUploadTask(
                uploadUrl,
                fileUri,
                uploadOptions,
                (data) => {
                  if (data.totalBytesExpectedToSend > 0) {
                    // Normalize to Axios-like progress event
                    onProgress({
                      loaded: data.totalBytesSent,
                      total: data.totalBytesExpectedToSend,
                      progress: data.totalBytesSent / data.totalBytesExpectedToSend,
                    });
                  }
                }
              );
              response = await uploadTask.uploadAsync();
            } else {
              response = await FileSystem.uploadAsync(uploadUrl, fileUri, uploadOptions);
            }

            if (response.status >= 200 && response.status < 300) {
              const resJson = JSON.parse(response.body);
              const files = resJson.data?.files || resJson.files || resJson.data || [];
              if (Array.isArray(files)) {
                uploadedFiles.push(...files);
              } else if (files && typeof files === 'object') {
                uploadedFiles.push(files);
              }
            } else {
              logger.warn('[fileAPI] uploadAsync non-200 status:', response.status, response.body);
            }
          }

          if (uploadedFiles.length > 0) {
            return { data: { success: true, data: { files: uploadedFiles } } };
          }
        }
      } catch (nativeUploadErr) {
        logger.warn('[fileAPI] Native uploadAsync fallback to axios:', nativeUploadErr?.message);
      }
    }

    // Standard Axios fallback
    return api.post(uploadUrl, formData, {
      timeout: 120000,
      headers: {
        'Content-Type': undefined,
      },
      onUploadProgress: onProgress,
    });
  },
};

// Users API — presence and custom status
export const usersAPI = {
  getUser: (id) => api.get(`/users/${id}`),
  setPresence: (status) => api.put('/users/presence', { status }),
  setCustomStatus: (data) => api.put('/users/status', data),
  updateUser: (id, data) => api.patch(`/users/${id}`, data),
  getChannelMembers: (channelId) => api.get(`/channels/${channelId}/members`),
  getDMContacts: (search) => api.get('/users/dm-contacts', { params: { search } }),
  pauseNotifications: (data) => api.post('/users/dnd/pause', data),
  resumeNotifications: () => api.post('/users/dnd/resume'),
};

// Read Receipts API
export const readReceiptAPI = {
  getUnread: () => api.get("/unread"),
  markRead: (channelId, lastReadMessageId = null) =>
    api.post(`/channels/${channelId}/read`, { lastReadMessageId }),
};

// Favorites (Starred) API
export const favoritesAPI = {
  list: () => api.get("/favorites"),
  add: (targetType, targetId) => api.post("/favorites", { targetType, targetId }),
  remove: (id) => api.delete(`/favorites/${id}`),
  toggle: (targetType, targetId) => api.post("/favorites/toggle", { targetType, targetId }),
  check: (targetType, targetId) => api.get("/favorites/check", { params: { targetType, targetId } }),
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
  getExternal: (params) => api.get('/directories/external', { params }),
  getInvitations: () => api.get('/directories/invitations'),
  removeExternalUser: (workspaceId, userId) =>
    api.delete(`/workspaces/${workspaceId}/members/${userId}`),
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
  getSavedCanvases: (channelId, status) =>
    api.get(channelId ? `/canvas/saved/${channelId}` : '/canvas/saved', { params: { status } }),
};

// ─── Canvas Comment API ────────────────────────────────────────────────────────
export const canvasCommentAPI = {
  getForCanvas: (canvasId) => api.get(`/canvas-comments/${canvasId}`),
  create: (canvasId, data) => api.post(`/canvas-comments/${canvasId}`, data),
  reply: (commentId, content) =>
    api.post(`/canvas-comments/${commentId}/reply`, { content }),
  resolve: (commentId) => api.patch(`/canvas-comments/${commentId}/resolve`),
};

// ─── GIFs API ─────────────────────────────────────────────────────────────────
export const gifsAPI = {
  search: (q, offset = 0, limit = 20) => api.get('/gifs/search', { params: { q, offset, limit } }),
  getTrending: (offset = 0, limit = 20) => api.get('/gifs/trending', { params: { offset, limit } }),
  getCategories: () => api.get('/gifs/categories'),
};

// ─── Categories API ──────────────────────────────────────────────────────
export const categoryAPI = {
  list: () => api.get('/categories'),
  create: (data) => api.post('/categories', data),
  update: (id, data) => api.put(`/categories/${id}`, data),
  delete: (id) => api.delete(`/categories/${id}`),
  reorder: (categoryOrders) => api.put('/categories/reorder', { categoryOrders }),
  suggestChannels: (name) => api.post('/categories/suggest-channels', { name }),
  syncDepartments: () => api.post('/categories/sync-departments'),
  getDepartments: () => api.get('/categories/departments'),
  addBulkChannels: (id, channelIds) => api.post(`/categories/${id}/bulk-channels`, { channelIds }),
  removeChannel: (id, channelId) => api.delete(`/categories/${id}/channels/${channelId}`),
  clearAll: () => api.delete('/categories'),
};

export default api;
