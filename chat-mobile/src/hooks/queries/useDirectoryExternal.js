import { useQuery } from '@tanstack/react-query';
import { directoriesAPI } from '../../services/api';
import { queryKeys } from '../../queries/queryKeys';

export const useDirectoryExternal = (workspaceId, params = {}) => {
  return useQuery({
    queryKey: ['directories', 'external', workspaceId, params],
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data } = await directoriesAPI.getExternal({ workspaceId, ...params });
      return data?.data?.users || data?.data || [];
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  });
};
