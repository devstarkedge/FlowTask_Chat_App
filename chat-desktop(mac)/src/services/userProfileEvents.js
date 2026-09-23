import { useUserProfileStore } from '../stores/userProfileStore';
import { useAuthStore } from '../stores/authStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useChannelStore } from '../stores/channelStore';
import { useChatStore } from '../stores/chatStore';
import { useLaterStore } from '../stores/laterStore';
import { useNotificationStore } from '../stores/notificationStore';
import { directoriesAPI } from './directoriesAPI';
import { projectUserProfiles } from '../utils/userProfiles';
import { queryClient } from '../queries/queryClient';
import { refreshCachedUserProfiles } from './messageCache';

export function handleUserProfileUpdated(event) {
  const workspaceId = useWorkspaceStore.getState().activeWorkspaceId;
  if (!event?.workspaceId || String(event.workspaceId) !== String(workspaceId)) return;
  if (!useUserProfileStore.getState().applyProfile(event)) return;
  const profiles = useUserProfileStore.getState().profilesByWorkspace[workspaceId];
  queryClient.setQueriesData({ queryKey: ['reactionDetails'] }, (data) => {
    if (data?.workspaceId && String(data.workspaceId) !== String(workspaceId)) return data;
    return projectUserProfiles(data, profiles);
  });
  for (const store of [useAuthStore, useWorkspaceStore, useChannelStore, useChatStore, useLaterStore, useNotificationStore]) {
    const state = store.getState();
    const projected = projectUserProfiles(state, profiles);
    if (projected !== state) store.setState(projected);
  }
  const typing = useChatStore.getState().typingByChannel;
  if (typing) useChatStore.setState({ typingByChannel: Object.fromEntries(Object.entries(typing).map(([channelId, users]) => [
    channelId, Object.fromEntries(Object.entries(users).map(([id, name]) => [id, profiles[id]?.name || name])),
  ])) });
  directoriesAPI.invalidateCache('users');
  directoriesAPI.invalidateCache('external');
  directoriesAPI.invalidateCache('groups');
  void refreshCachedUserProfiles(workspaceId, useChannelStore.getState().channels?.map((channel) => channel._id));
}
