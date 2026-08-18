import { useQuery } from '@tanstack/react-query';
import { channelAPI } from '../../services/api';
import { queryKeys } from '../../queries/queryKeys';

export const fetchChannelsFn = async () => {
  const { data } = await channelAPI.list();
  return data.data?.channels || [];
};

export const useChannels = (workspaceId) => {
  return useQuery({
    queryKey: queryKeys.channels(workspaceId),
    queryFn: fetchChannelsFn,
    staleTime: 5 * 60 * 1000,
    enabled: !!workspaceId,
  });
};
