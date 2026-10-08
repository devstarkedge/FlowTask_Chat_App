import { useQuery } from '@tanstack/react-query';
import { workspaceAPI } from '../../services/api';
import { queryKeys } from '../../queries/queryKeys';

const requests = {
  billing: workspaceAPI.getBilling,
  security: workspaceAPI.getSecuritySettings,
  notifications: workspaceAPI.getNotificationSettings,
  integrations: workspaceAPI.getIntegrationSettings,
};

export function useWorkspaceDetails(workspaceId) {
  return useQuery({
    queryKey: queryKeys.workspaceDetails(workspaceId),
    queryFn: async ({ signal }) => {
      const { data } = await workspaceAPI.get(workspaceId, { signal, headers: { 'X-Workspace-Id': workspaceId } });
      const workspace = data?.data;
      if (!workspace || String(workspace._id) !== String(workspaceId)) throw new Error('Unable to load workspace details');
      return workspace;
    },
    enabled: !!workspaceId,
    refetchOnMount: 'always',
    retry: 1,
  });
}

export function useWorkspaceSetting(workspaceId, section, enabled) {
  return useQuery({
    queryKey: ['workspaceSettings', workspaceId, section],
    queryFn: async ({ signal }) => {
      const { data } = await requests[section](workspaceId, { signal, headers: { 'X-Workspace-Id': workspaceId } });
      return data?.data ?? null;
    },
    enabled: !!workspaceId && !!enabled,
    retry: 1,
    refetchOnMount: 'always',
  });
}
