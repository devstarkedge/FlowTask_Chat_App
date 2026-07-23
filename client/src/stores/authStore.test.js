import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loginFlowTask: vi.fn(),
  channelSetState: vi.fn(),
  fetchWorkspaces: vi.fn(),
}));

vi.mock('../services/api', () => ({
  authAPI: {
    loginFlowTask: mocks.loginFlowTask,
    channelSyncStatus: vi.fn(),
    logout: vi.fn(),
  },
  userAPI: {},
}));
vi.mock('./channelStore', () => ({
  useChannelStore: {
    setState: mocks.channelSetState,
    getState: () => ({}),
  },
}));
vi.mock('./workspaceStore', () => ({
  useWorkspaceStore: {
    getState: () => ({
      fetchWorkspaces: mocks.fetchWorkspaces,
      clearWorkspaceState: vi.fn(),
    }),
  },
}));
vi.mock('../services/socket', () => ({
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  emitPresenceUpdate: vi.fn(),
}));
vi.mock('../utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { useAuthStore } = await import('./authStore');

describe('FlowTask client login single flight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.fetchWorkspaces.mockResolvedValue([]);
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
      isLoading: false,
      error: null,
      channelSync: null,
    });
  });

  it('shares one request across repeated submissions and clears loading', async () => {
    let resolveRequest;
    mocks.loginFlowTask.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const first = useAuthStore.getState().loginFlowTask('flowtask-token');
    const second = useAuthStore.getState().loginFlowTask('flowtask-token');
    expect(second).toBe(first);
    expect(mocks.loginFlowTask).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().isLoading).toBe(true);

    resolveRequest({
      data: {
        data: {
          user: { _id: 'user-1' },
          accessToken: 'access',
          refreshToken: 'refresh',
          flowTaskToken: 'flowtask-token',
          channels: [],
          channelSync: { jobId: 'job-1', status: 'pending' },
        },
      },
    });
    await first;

    expect(useAuthStore.getState().user._id).toBe('user-1');
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().channelSync.status).toBe('pending');
  });

  it('always clears Authenticating state after a failure', async () => {
    mocks.loginFlowTask.mockRejectedValue(new Error('network down'));
    await expect(useAuthStore.getState().loginFlowTask('flowtask-token')).rejects.toThrow('network down');
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().error).toContain('could not reach the server');
  });

  it('ignores duplicate or out-of-order sync progress after newer state', () => {
    useAuthStore.getState().setChannelSync({
      jobId: 'job-1',
      workspaceId: 'workspace-1',
      status: 'running',
      totalBoards: 82,
      completedBoards: 10,
      failedBoards: 1,
      processedBoards: 11,
    });
    useAuthStore.getState().setChannelSync({
      jobId: 'job-1',
      workspaceId: 'workspace-1',
      status: 'running',
      totalBoards: 82,
      completedBoards: 4,
      failedBoards: 0,
      processedBoards: 4,
    });
    expect(useAuthStore.getState().channelSync.completedBoards).toBe(10);

    useAuthStore.getState().setChannelSync({
      jobId: 'job-1',
      workspaceId: 'workspace-1',
      status: 'completed',
      totalBoards: 82,
      completedBoards: 82,
      failedBoards: 0,
      processedBoards: 82,
    });
    useAuthStore.getState().setChannelSync({
      jobId: 'job-1',
      workspaceId: 'workspace-1',
      status: 'running',
      totalBoards: 82,
      completedBoards: 81,
      failedBoards: 0,
      processedBoards: 81,
    });
    expect(useAuthStore.getState().channelSync.status).toBe('completed');
  });
});
