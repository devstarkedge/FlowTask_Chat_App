import { useQuery } from '@tanstack/react-query';
import { directoriesAPI } from '../../services/api';
import { queryKeys } from '../../queries/queryKeys';

export const useDirectoryUsers = (workspaceId, params = {}) => {
  return useQuery({
    queryKey: ['directories', 'users', workspaceId, params],
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data } = await directoriesAPI.getUsers({ workspaceId, ...params });
      return data?.data?.users || data?.data || [];
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  });
};
