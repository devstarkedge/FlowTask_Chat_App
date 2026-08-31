import api from './api';

// ─── Simple In-Memory TTL Cache ────────────────────────────────────────────
const CACHE_TTL = 60_000; // 60 seconds
const cache = new Map();

function cacheKey(prefix, params) {
  return prefix + ':' + JSON.stringify(params || {});
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

function invalidatePrefix(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix + ':')) cache.delete(key);
  }
}

async function cachedGet(prefix, url, params) {
  const key = cacheKey(prefix, params);
  const hit = getCached(key);
  if (hit) return hit;
  const result = await api.get(url, { params });
  setCache(key, result);
  return result;
}

export const directoriesAPI = {
  // People tab (cached)
  getUsers: (params) => cachedGet('users', '/directories/users', params),

  // Channels tab (cached)
  getChannels: (params) => cachedGet('channels', '/directories/channels', params),

  // User Groups tab (cached)
  getGroups: (params) => cachedGet('groups', '/directories/groups', params),
  getGroupById: (id) => api.get(`/directories/groups/${id}`),
  createGroup: (data) => { invalidatePrefix('groups'); return api.post('/directories/groups', data); },
  updateGroup: (id, data) => { invalidatePrefix('groups'); return api.put(`/directories/groups/${id}`, data); },
  deleteGroup: (id) => { invalidatePrefix('groups'); return api.delete(`/directories/groups/${id}`); },

  // External tab (cached)
  getExternalUsers: (params) => cachedGet('external', '/directories/external', params),
  removeExternalUser: (workspaceId, userId) => {
    invalidatePrefix('external');
    return api.delete(`/workspaces/${workspaceId}/members/${userId}`);
  },

  // Invitations tab
  getInvitations: () => api.get('/directories/invitations'),
  inviteUser: (workspaceId, data) =>
    api.post(`/workspaces/${workspaceId}/invite-email`, data),
  resendInvitation: (workspaceId, data) =>
    api.post(`/workspaces/${workspaceId}/invite-email`, data),
  cancelInvitation: (workspaceId, inviteId) =>
    api.delete(`/workspaces/${workspaceId}/invites/${inviteId}`),

  // Channel actions (invalidate channels cache)
  joinChannel: (channelId) => { invalidatePrefix('channels'); return api.post(`/channels/${channelId}/members`, { role: 'member' }); },
  leaveChannel: (channelId) => { invalidatePrefix('channels'); return api.post(`/channels/${channelId}/leave`); },

  // Manual cache invalidation
  invalidateCache: (prefix) => prefix ? invalidatePrefix(prefix) : cache.clear(),
};
