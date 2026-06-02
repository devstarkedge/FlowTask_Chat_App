import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// In Expo/React Native, we use the local machine IP for development
// Preference: 1. Environment variable 2. Hardcoded fallback
const BASE_URL = Constants.expoConfig?.extra?.apiUrl || 'http://172.16.16.33:3200/api/chat';

console.log('[API] Initializing with BASE_URL:', BASE_URL);

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor for outgoing requests
api.interceptors.request.use(async (config) => {
  try {
    const token = await AsyncStorage.getItem('chat_access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    const workspaceId = await AsyncStorage.getItem('active_workspace_id');
    if (workspaceId) {
      config.headers['X-Workspace-Id'] = workspaceId;
    }

    const flowtaskToken = await AsyncStorage.getItem('flowtask_token');
    if (flowtaskToken) {
      config.headers['X-FlowTask-Token'] = flowtaskToken;
    }
  } catch (err) {
    console.error('[API Request Error]', err);
  }
  return config;
});

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
  inviteByEmail: (workspaceId, email, role) => api.post(`/workspaces/${workspaceId}/invite-email`, { email, role }),
  leave: (workspaceId) => api.post(`/workspaces/${workspaceId}/leave`),
};

// Channel API
export const channelAPI = {
  list: () => api.get('/channels'),
};

// Thread API
export const threadAPI = {
  getMyThreads: (params) => api.get('/threads/my', { params }),
  getThread: (id) => api.get(`/threads/${id}`),
  getReplies: (id, params) => api.get(`/threads/${id}/replies`, { params }),
  resolve: (id) => api.post(`/threads/${id}/resolve`),
  unresolve: (id) => api.post(`/threads/${id}/unresolve`),
};

// Later (Saved Messages) API
export const laterAPI = {
  list: (status) => api.get('/messages/saved', { params: { status } }),
  toggle: (messageId) => api.post(`/messages/save/${messageId}`),
  updateStatus: (messageId, status) => api.patch(`/messages/saved/${messageId}/status`, { status }),
  updateReminder: (messageId, reminderData) => api.patch(`/messages/saved/${messageId}/reminder`, reminderData),
  delete: (messageId) => api.delete(`/messages/saved/${messageId}`),
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

// Files API — reuse backend endpoints used by web client
export const fileAPI = {
  listWorkspace: (params) => api.get('/messages/files', { params }),
  listByChannel: (channelId, params) => api.get(`/channels/${channelId}/files`, { params }),
  deleteFromChannel: (channelId, fileId) => api.delete(`/channels/${channelId}/files/${fileId}`),
};

// Search API (global workspace search)
export const searchAPI = {
  search: ({ q = '', scope = null, limit = null, cursor = null, signal = undefined } = {}) =>
    api.get('/search', { params: { q, scope, limit, cursor }, signal }),
  global: (q, options = {}) => searchAPI.search({ q, ...options }),
};

export default api;
