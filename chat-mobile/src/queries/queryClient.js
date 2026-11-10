import { shouldRetryChannelQuery } from '../utils/channelAccess';
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => shouldRetryChannelQuery(failureCount, error, 2),
      refetchOnWindowFocus: true,
      staleTime: 5 * 60 * 1000,
    },
  },
});
