import { useQuery } from '@tanstack/react-query';
import { workspaceAPI } from '../../services/api';
import { queryKeys } from '../../queries/queryKeys';

export const fetchWorkspacesFn = async () => {
  const { data } = await workspaceAPI.mine();
  return data.data?.workspaces || [];
};

export const useWorkspaces = () => {
  return useQuery({
    queryKey: queryKeys.workspaces,
    queryFn: fetchWorkspacesFn,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });
};
