import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  deleteApi: vi.fn(),
  addMemberApi: vi.fn(),
  removeMemberApi: vi.fn(),
  fetchMembersApi: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('./api', () => ({
  channelAPI: {
    delete: hoisted.deleteApi,
    addMember: hoisted.addMemberApi,
    removeMember: hoisted.removeMemberApi,
    getMembers: hoisted.fetchMembersApi,
  },
  readReceiptAPI: {},
  categoryAPI: {},
  messageAPI: {},
  threadAPI: {},
  botAPI: {},
  savedMessageAPI: {},
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: hoisted.toastSuccess,
    error: hoisted.toastError,
    promise: vi.fn(),
  },
}));

vi.mock('./socket', () => ({ getSocket: () => null }));
vi.mock('../stores/authStore', () => ({ useAuthStore: { getState: () => ({ user: { _id: 'u-1' } }) } }));
vi.mock('../stores/workspaceStore', () => ({ useWorkspaceStore: { getState: () => ({ activeWorkspaceId: 'ws-1' }) } }));

import { useChannelStore } from '../stores/channelStore';
import { useChatStore } from '../stores/chatStore';
import { isChatAppChannel, isFlowTaskSyncedChannel } from '../utils/channelOrigin';

describe('Client Custom Channel Management', () => {
  const customChannel = {
    _id: 'ch-custom',
    name: 'custom-dev',
    type: 'private',
    visibility: 'private',
    systemManaged: false,
    flowTaskRef: null,
  };
  const flowTaskChannel = {
    _id: 'ch-flowtask',
    name: 'flowtask-board',
    type: 'project',
    systemManaged: true,
    flowTaskRef: { entityType: 'board', entityId: 'board-1' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    useChannelStore.setState({
      channels: [customChannel, flowTaskChannel],
      activeChannelId: customChannel._id,
      showInfoPanel: true,
      membersByChannel: {
        [customChannel._id]: [{ _id: 'u-1' }, { _id: 'u-2' }],
      },
      unreads: { [customChannel._id]: 1 },
      lastReadByChannel: {},
    });
  });

  describe('channel origin checks', () => {
    it('accurately distinguishes custom channels from FlowTask-managed ones', () => {
      expect(isChatAppChannel(customChannel)).toBe(true);
      expect(isFlowTaskSyncedChannel(customChannel)).toBe(false);

      expect(isChatAppChannel(flowTaskChannel)).toBe(false);
      expect(isFlowTaskSyncedChannel(flowTaskChannel)).toBe(true);
    });
  });

  describe('deleteChannel store action', () => {
    it('deletes custom channel, removes it from store, closes active thread, and toasts success', async () => {
      hoisted.deleteApi.mockResolvedValue({ data: { success: true } });
      useChatStore.getState().openThread({ rootMessageId: 'msg-1', channelId: customChannel._id });

      await useChannelStore.getState().deleteChannel(customChannel._id);

      expect(hoisted.deleteApi).toHaveBeenCalledWith(customChannel._id);
      const state = useChannelStore.getState();
      expect(state.channels.find((c) => c._id === customChannel._id)).toBeUndefined();
      expect(state.activeChannelId).toBeNull();
      expect(state.showInfoPanel).toBe(false);
      expect(useChatStore.getState().activeThread).toBeNull();
      expect(hoisted.toastSuccess).toHaveBeenCalledWith('Channel deleted');
    });

    it('handles delete failure gracefully and surfaces server error message', async () => {
      hoisted.deleteApi.mockRejectedValue({
        response: { data: { error: { message: 'Only custom workspace channels can be deleted.' } } },
      });

      await expect(
        useChannelStore.getState().deleteChannel(customChannel._id),
      ).rejects.toBeDefined();

      expect(hoisted.toastError).toHaveBeenCalledWith('Only custom workspace channels can be deleted.');
      expect(useChannelStore.getState().channels).toHaveLength(2);
    });
  });

  describe('addMember and removeMember store actions', () => {
    it('invokes addMember API, fetches fresh member list, and shows toast', async () => {
      hoisted.addMemberApi.mockResolvedValue({ data: { success: true } });
      hoisted.fetchMembersApi.mockResolvedValue({ data: { data: { members: [{ _id: 'u-1' }, { _id: 'u-2' }, { _id: 'u-3' }] } } });

      await useChannelStore.getState().addMember(customChannel._id, 'u-3');

      expect(hoisted.addMemberApi).toHaveBeenCalledWith(customChannel._id, 'u-3');
      expect(hoisted.fetchMembersApi).toHaveBeenCalledWith(customChannel._id);
      expect(hoisted.toastSuccess).toHaveBeenCalledWith('Member added');
    });

    it('invokes removeMember API, fetches fresh member list, and shows toast', async () => {
      hoisted.removeMemberApi.mockResolvedValue({ data: { success: true } });
      hoisted.fetchMembersApi.mockResolvedValue({ data: { data: { members: [{ _id: 'u-1' }] } } });

      await useChannelStore.getState().removeMember(customChannel._id, 'u-2');

      expect(hoisted.removeMemberApi).toHaveBeenCalledWith(customChannel._id, 'u-2');
      expect(hoisted.fetchMembersApi).toHaveBeenCalledWith(customChannel._id);
      expect(hoisted.toastSuccess).toHaveBeenCalledWith('Member removed');
    });
  });
});
