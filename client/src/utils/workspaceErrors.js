export function workspaceFetchError(error) {
  if (error.response) return error.response.data?.error?.message || 'Failed to fetch workspaces';
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return 'The backend took too long to respond. Check that the server is running, then retry.';
  }
  return 'Cannot reach the backend. Check that the server is running and reachable, then retry.';
}
