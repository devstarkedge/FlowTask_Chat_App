import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findByRef: vi.fn(), create: vi.fn(), slugExists: vi.fn(), findByMember: vi.fn(),
  systemChannels: vi.fn(), publicChannels: vi.fn(), findChannels: vi.fn(),
  findWorkspace: vi.fn(), getPins: vi.fn(), latestMessages: vi.fn(),
}));
vi.mock('../modules/channels/channel.repository.js', () => ({ default: {
  findByFlowTaskRef: mocks.findByRef, create: mocks.create, slugExists: mocks.slugExists,
  findByMember: mocks.findByMember, findSystemChannels: mocks.systemChannels,
  findPublicChannels: mocks.publicChannels,
} }));
vi.mock('../modules/channels/Channel.model.js', () => ({ default: { find: mocks.findChannels } }));
vi.mock('../modules/channels/ChannelPin.model.js', () => ({ default: { getPinsForUser: mocks.getPins } }));
vi.mock('../modules/workspaces/workspace.repository.js', () => ({ default: { findById: mocks.findWorkspace } }));
vi.mock('../modules/messages/message.repository.js', () => ({ default: { getLatestMessagesForChannels: mocks.latestMessages } }));
vi.mock('../modules/users/user.repository.js', () => ({ default: {} }));
vi.mock('../modules/favorites/favorites.service.js', () => ({ default: {} }));
vi.mock('../modules/dms/directMessage.service.js', () => ({ default: {} }));
vi.mock('../modules/flowtask/flowtask.service.js', () => ({ default: {} }));
vi.mock('../sockets/socketManager.js', () => ({
  emitToChannel: vi.fn(), emitToUser: vi.fn(), emitToWorkspace: vi.fn(),
  joinChannelRoom: vi.fn(), leaveChannelRoom: vi.fn(), reconcileChannelRoomAccess: vi.fn(),
}));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import channelService from '../modules/channels/channel.service.js';

const generated = {
  _id: 'legacy', name: 'Engineering', type: 'department', visibility: 'private',
  flowTaskRef: { entityType: 'department', entityId: 'dept-1' },
};
const project = {
  _id: 'project', name: 'Release plan', type: 'project', visibility: 'private',
  flowTaskRef: { entityType: 'board', entityId: 'board-1' },
  departmentRef: { departmentId: 'dept-1', departmentName: 'Engineering' },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findByRef.mockResolvedValue(null);
  mocks.slugExists.mockResolvedValue(false);
  mocks.create.mockImplementation(async (data) => ({ _id: 'project', ...data }));
  mocks.findWorkspace.mockResolvedValue({ source: 'flowtask' });
  mocks.findChannels.mockReturnValue({ lean: async () => [] });
  mocks.findByMember.mockResolvedValue([generated, project]);
  mocks.systemChannels.mockResolvedValue([]);
  mocks.publicChannels.mockResolvedValue([]);
  mocks.getPins.mockResolvedValue([]);
  mocks.latestMessages.mockResolvedValue(new Map());
});

describe('real project channels under departments', () => {
  it('creates only a project channel and stores its name separately from its department', async () => {
    const result = await channelService.createProjectChannel({
      _id: 'board-1', title: 'Release plan', department: { _id: 'dept-1', name: 'Engineering' },
    }, null, 'chat-workspace');
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      name: 'Release plan', type: 'project', workspaceId: 'chat-workspace',
      flowTaskRef: { entityType: 'board', entityId: 'board-1' },
      departmentRef: { departmentId: 'dept-1', departmentName: 'Engineering' },
    });
  });

  it.each(['member', 'guest', 'admin'])('excludes old generated channels from the %s channel list', async (role) => {
    const result = await channelService.getChannelsForUser('chat-user', 'chat-workspace', { role });
    expect(result.map((channel) => channel._id)).toEqual(['project']);
  });

  it('also excludes generated entries returned by the public-channel fallback', async () => {
    mocks.findByMember.mockResolvedValue([project]);
    mocks.publicChannels.mockResolvedValue([{ ...generated, visibility: 'public' }]);
    const result = await channelService.getChannelsForUser('chat-user', 'chat-workspace', { role: 'member' });
    expect(result.map((channel) => channel._id)).toEqual(['project']);
  });
});
