import { useQuery } from '@tanstack/react-query';
import { directoriesAPI } from '../../services/api';
import { queryKeys } from '../../queries/queryKeys';

export const useDirectoryChannels = (workspaceId, params = {}) => {
  return useQuery({
    queryKey: ['directories', 'channels', workspaceId, params],
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data } = await directoriesAPI.getChannels({ workspaceId, ...params });
      return data?.data?.channels || data?.data || [];
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  });
};
