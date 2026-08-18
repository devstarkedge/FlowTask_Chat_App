import { useQuery } from '@tanstack/react-query';
import { channelAPI } from '../../services/api';
import { queryKeys } from '../../queries/queryKeys';
import { useChannelStore } from '../../stores/channelStore';

export const fetchChannelsFn = async () => {
  const { data } = await channelAPI.list();
  const channels = data.data?.channels || [];
  // Reconcile the per-user star/pin lists from the server's channel list so
  // stars made on other devices/platforms appear after refreshing or reopening.
  useChannelStore.getState().syncStarredFromChannels(channels);
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
