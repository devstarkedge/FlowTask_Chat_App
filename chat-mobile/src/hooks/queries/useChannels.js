import { useQuery } from '@tanstack/react-query';
import { channelAPI, resolveWorkspaceId, getWorkspaceContextVersion } from '../../services/api';
import { queryKeys } from '../../queries/queryKeys';
import { useChannelStore } from '../../stores/channelStore';

export const fetchChannelsFn = async ({ queryKey, signal } = {}) => {
  const workspaceId = queryKey?.[1] || resolveWorkspaceId();
  const contextVersion = getWorkspaceContextVersion();
  const { data } = await channelAPI.list({ signal, headers: { 'X-Workspace-Id': workspaceId } });
  const channels = data.data?.channels || [];
  // Reconcile the per-user star/pin lists from the server's channel list so
  // stars made on other devices/platforms appear after refreshing or reopening.
  if (resolveWorkspaceId() === workspaceId && getWorkspaceContextVersion() === contextVersion) {
    useChannelStore.getState().syncStarredFromChannels(channels);
  }
  return channels;
};

export const useChannels = (workspaceId) => {
  return useQuery({
    queryKey: queryKeys.channels(workspaceId),
    queryFn: fetchChannelsFn,
    staleTime: 5 * 60 * 1000,
    enabled: !!workspaceId,
  });
};
