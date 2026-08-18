import { useQuery } from '@tanstack/react-query';
import { usersAPI } from '../../services/api';
import { queryKeys } from '../../queries/queryKeys';

export const useChannelMembers = (channelId) => {
  return useQuery({
    queryKey: queryKeys.channelMembers(channelId),
    queryFn: async () => {
      if (!channelId) return [];
      const { data } = await usersAPI.getChannelMembers(channelId);
      return data?.data?.members || data?.data || [];
    },
    enabled: !!channelId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
};
