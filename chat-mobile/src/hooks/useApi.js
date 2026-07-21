import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import logger from '../utils/logger';

/**
 * Reusable hook for fetching data (GET requests)
 * @param {Array} queryKey - Unique key for the query, e.g., ['channels', workspaceId]
 * @param {Function} fetchFn - API function that returns a Promise resolving to data
 * @param {Object} options - React Query options (e.g., enabled, staleTime)
 */
export const useApiQuery = (queryKey, fetchFn, options = {}) => {
  return useQuery({
    queryKey,
    queryFn: async () => {
      try {
        const response = await fetchFn();
        // Assume standard API response format `{ data: { ... } }` or just return `response.data`
        return response.data;
      } catch (error) {
        logger.error(`[useApiQuery] Error in query ${queryKey}:`, error);
        throw error;
      }
    },
    ...options,
  });
};

/**
 * Reusable hook for mutating data (POST, PUT, DELETE requests)
 * @param {Function} mutationFn - API function that performs the mutation
 * @param {Object} options - React Query options (e.g., onSuccess, onError)
 */
export const useApiMutation = (mutationFn, options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables) => {
      try {
        const response = await mutationFn(variables);
        return response.data;
      } catch (error) {
        logger.error('[useApiMutation] Error:', error);
        throw error;
      }
    },
    ...options,
    onSuccess: (data, variables, context) => {
      // Optional: automatically invalidate queries if specified in options
      if (options.invalidateKeys) {
        options.invalidateKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }
      if (options.onSuccess) {
        options.onSuccess(data, variables, context);
      }
    },
  });
};
