import { useQuery } from '@tanstack/react-query';
import { workspaceAPI } from '../../services/api';
import { queryKeys } from '../../queries/queryKeys';

export const useWorkspaceMembers = (workspaceId) => {
  return useQuery({
    queryKey: queryKeys.workspaceMembers(workspaceId),
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data } = await workspaceAPI.getMembers(workspaceId);
      return data?.data?.members || data?.data || [];
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
};
