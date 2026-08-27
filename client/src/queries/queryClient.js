import { QueryClient } from '@tanstack/react-query';

// Shared singleton QueryClient for the web client. Extracted so that the
// socket event handlers (and any non-React module) can invalidate cached
// queries, e.g. reaction-details when reactions are added/removed in real
// time. Mirrors the structure used by the mobile client.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
