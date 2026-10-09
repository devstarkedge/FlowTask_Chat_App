import { useAuthStore } from '../stores/authStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { queryClient } from '../queries/queryClient';

// Update only identity objects, never message text, IDs or workspace roles.
export function projectProfile(value, userId, updates) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => projectProfile(item, userId, updates));
  const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, projectProfile(item, userId, updates)]));
  if (String(value._id || value.id || '') === String(userId)) {
    const oldVersion = Date.parse(value.flowTaskProfileUpdatedAt);
    const newVersion = Date.parse(updates.flowTaskProfileUpdatedAt);
    if (!Number.isFinite(oldVersion) || (Number.isFinite(newVersion) && newVersion >= oldVersion)) {
      Object.assign(result, updates);
    }
  }
  return result;
}

export function handleUserProfileUpdated(event) {
  if (!event?.userId || String(event.workspaceId) !== String(useWorkspaceStore.getState().activeWorkspaceId)) return;
  const updates = {};
  for (const key of ['name', 'avatar', 'email']) {
    if (Object.hasOwn(event.updates || {}, key)) updates[key] = event.updates[key];
  }
  if (event.profileUpdatedAt) updates.flowTaskProfileUpdatedAt = event.profileUpdatedAt;
  const auth = useAuthStore.getState();
  if (String(auth.user?._id) === String(event.userId)) {
    const projected = projectProfile(auth.user, event.userId, updates);
    auth.updateUser(projected);
  }
  refreshProfileCaches(event.userId, updates);
}

export function refreshProfileCaches(userId, updates) {
  // These queries contain populated user objects used by members and avatars.
  for (const key of ['workspaceMembers', 'channelMembers', 'channels', 'messages', 'threadReplies', 'pinnedMessages', 'directories', 'notifications']) {
    queryClient.setQueriesData({ queryKey: [key] }, data => projectProfile(data, userId, updates));
  }
}
