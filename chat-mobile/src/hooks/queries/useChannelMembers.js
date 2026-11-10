import { useQuery } from '@tanstack/react-query';
import { usersAPI } from '../../services/api';
import { queryKeys } from '../../queries/queryKeys';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { shouldRetryChannelQuery } from '../../utils/channelAccess';

export const useChannelMembers = (channelId, options = {}) => {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const enabledOverride = options.enabled !== undefined ? Boolean(options.enabled) : true;

  return useQuery({
    queryKey: queryKeys.channelMembers(channelId),
    queryFn: async ({ signal }) => {
      if (!channelId || !activeWorkspaceId) return [];
      const { data } = await usersAPI.getChannelMembers(channelId, {
        signal,
        headers: { 'X-Workspace-Id': activeWorkspaceId },
      });
      const members = data?.data?.members || data?.data || [];
      return Array.isArray(members) ? members : [];
    },
    enabled: Boolean(channelId && activeWorkspaceId) && enabledOverride,
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => shouldRetryChannelQuery(failureCount, error, 1),
    refetchOnMount: 'always',
  });
};
