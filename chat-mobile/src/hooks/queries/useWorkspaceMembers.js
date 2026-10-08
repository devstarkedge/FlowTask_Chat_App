import { useQuery } from '@tanstack/react-query';
import { workspaceAPI } from '../../services/api';
import { queryKeys } from '../../queries/queryKeys';

export const useWorkspaceMembers = (workspaceId) => {
  return useQuery({
    queryKey: queryKeys.workspaceMembers(workspaceId),
    queryFn: async ({ signal }) => {
      if (!workspaceId) return [];
      const { data } = await workspaceAPI.getMembers(workspaceId, undefined, { signal, headers: { 'X-Workspace-Id': workspaceId } });
      const members = data?.data?.members ?? data?.data ?? [];
      if (!Array.isArray(members)) throw new Error('Unable to load workspace members');
      return members;
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnMount: 'always',
  });
};
