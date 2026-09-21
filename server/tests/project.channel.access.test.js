import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findByRef: vi.fn(),
  create: vi.fn(),
  slugExists: vi.fn(),
  findByMember: vi.fn(),
  systemChannels: vi.fn(),
  publicChannels: vi.fn(),
  findChannels: vi.fn(),
  findWorkspace: vi.fn(),
  getPins: vi.fn(),
  latestMessages: vi.fn(),
  isMember: vi.fn(),
  getMemberIds: vi.fn(),
  findWorkspaceMemberships: vi.fn(),
}));

vi.mock('../modules/channels/channel.repository.js', () => ({
  default: {
    findByFlowTaskRef: mocks.findByRef,
    create: mocks.create,
    slugExists: mocks.slugExists,
    findByMember: mocks.findByMember,
    findSystemChannels: mocks.systemChannels,
    findPublicChannels: mocks.publicChannels,
  },
}));

vi.mock('../modules/channels/Channel.model.js', () => ({
  default: {
    find: mocks.findChannels,
    findOne: mocks.findByRef,
    findByFlowTaskRef: mocks.findByRef,
    findUserChannels: mocks.findByMember,
  },
}));

vi.mock('../modules/channels/ChannelMember.model.js', () => ({
  default: {
    isMember: mocks.isMember,
    getMemberIds: mocks.getMemberIds,
  },
}));

vi.mock('../modules/workspaces/WorkspaceMembership.model.js', () => ({
  default: {
    findOne: vi.fn(),
    find: mocks.findWorkspaceMemberships,
  },
}));

vi.mock('../modules/channels/ChannelPin.model.js', () => ({
  default: { getPinsForUser: mocks.getPins },
}));

vi.mock('../modules/workspaces/workspace.repository.js', () => ({
  default: { findById: mocks.findWorkspace },
}));

vi.mock('../modules/messages/message.repository.js', () => ({
  default: { getLatestMessagesForChannels: mocks.latestMessages },
}));

vi.mock('../modules/users/user.repository.js', () => ({ default: {} }));
vi.mock('../modules/favorites/favorites.service.js', () => ({ default: {} }));
vi.mock('../modules/dms/directMessage.service.js', () => ({ default: {} }));
vi.mock('../modules/flowtask/flowtask.service.js', () => ({ default: {} }));
vi.mock('../sockets/socketManager.js', () => ({
  emitToChannel: vi.fn(),
  emitToUser: vi.fn(),
  emitToWorkspace: vi.fn(),
  joinChannelRoom: vi.fn(),
  leaveChannelRoom: vi.fn(),
  reconcileChannelRoomAccess: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import channelService from '../modules/channels/channel.service.js';
import {
  canAccessFlowTaskProjectChannel,
  getAuthorizedProjectUserIds,
  isFlowTaskProjectChannel,
} from '../modules/flowtask/projectAccess.service.js';

const workspaceId = 'ws-123';
const ownerUserId = 'user-owner';
const adminUserId = 'user-admin';
const memberAUserId = 'user-member-a';
const memberBUserId = 'user-member-b';

const projectAChannel = {
  _id: 'chan-proj-a',
  name: 'Project Alpha',
  type: 'project',
  visibility: 'private',
  workspaceId,
  flowTaskRef: { entityType: 'board', entityId: 'board-a' },
};

const projectBChannel = {
  _id: 'chan-proj-b',
  name: 'Project Beta',
  type: 'project',
  visibility: 'private',
  workspaceId,
  flowTaskRef: { entityType: 'board', entityId: 'board-b' },
};

beforeEach(() => {
  vi.resetAllMocks();

  mocks.findByRef.mockResolvedValue(null);
  mocks.slugExists.mockResolvedValue(false);
  mocks.create.mockImplementation(async (data) => ({ _id: 'chan-proj-a', ...data }));
  mocks.findWorkspace.mockResolvedValue({ _id: workspaceId, source: 'flowtask' });
  mocks.getPins.mockResolvedValue([]);
  mocks.latestMessages.mockResolvedValue(new Map());
  mocks.systemChannels.mockResolvedValue([]);
  mocks.publicChannels.mockResolvedValue([]);
  mocks.findChannels.mockReturnValue({
    lean: async () => [projectAChannel, projectBChannel],
  });

  mocks.findWorkspaceMemberships.mockReturnValue({
    select: () => ({
      lean: async () => [
        { userId: ownerUserId, role: 'owner' },
        { userId: adminUserId, role: 'admin' },
      ],
    }),
  });
});

describe('FlowTask Project Channel Access & Role Visibility', () => {
  describe('isFlowTaskProjectChannel', () => {
    it('identifies project channels correctly', () => {
      expect(isFlowTaskProjectChannel(projectAChannel)).toBe(true);
      expect(isFlowTaskProjectChannel({ type: 'public' })).toBe(false);
      expect(isFlowTaskProjectChannel({ type: 'dm' })).toBe(false);
    });
  });

  describe('canAccessFlowTaskProjectChannel', () => {
    it('grants access to Workspace Owner regardless of direct membership', async () => {
      mocks.isMember.mockResolvedValue(false);
      const allowed = await canAccessFlowTaskProjectChannel(
        projectAChannel,
        ownerUserId,
        workspaceId,
        { role: 'owner' },
      );
      expect(allowed).toBe(true);
      expect(mocks.isMember).not.toHaveBeenCalled();
    });

    it('grants access to Workspace Admin regardless of direct membership', async () => {
      mocks.isMember.mockResolvedValue(false);
      const allowed = await canAccessFlowTaskProjectChannel(
        projectBChannel,
        adminUserId,
        workspaceId,
        { role: 'admin' },
      );
      expect(allowed).toBe(true);
      expect(mocks.isMember).not.toHaveBeenCalled();
    });

    it('grants access to Regular Member if they are a direct member of the project channel', async () => {
      mocks.isMember.mockImplementation(async (chId, uId) => {
        return chId === 'chan-proj-a' && uId === memberAUserId;
      });

      const allowedA = await canAccessFlowTaskProjectChannel(
        projectAChannel,
        memberAUserId,
        workspaceId,
        { role: 'member' },
      );
      expect(allowedA).toBe(true);
    });

    it('denies access to Regular Member if they are NOT a member of the project channel', async () => {
      mocks.isMember.mockImplementation(async (chId, uId) => {
        return chId === 'chan-proj-a' && uId === memberAUserId;
      });

      const allowedB = await canAccessFlowTaskProjectChannel(
        projectBChannel,
        memberAUserId,
        workspaceId,
        { role: 'member' },
      );
      expect(allowedB).toBe(false);
    });
  });

  describe('getAuthorizedProjectUserIds', () => {
    it('includes direct project members and all workspace owners/admins', async () => {
      mocks.getMemberIds.mockResolvedValue([memberAUserId]);

      const authorized = await getAuthorizedProjectUserIds(projectAChannel, workspaceId);

      expect(authorized).toContain(memberAUserId);
      expect(authorized).toContain(ownerUserId);
      expect(authorized).toContain(adminUserId);
      expect(authorized).not.toContain(memberBUserId);
    });
  });

  describe('getChannelsForUser', () => {
    it('returns all FlowTask project channels for Workspace Owner & Admin', async () => {
      mocks.findByMember.mockResolvedValue([]);

      const ownerChannels = await channelService.getChannelsForUser(
        ownerUserId,
        workspaceId,
        { role: 'owner' },
      );
      expect(ownerChannels.map((c) => c._id)).toEqual(['chan-proj-a', 'chan-proj-b']);

      const adminChannels = await channelService.getChannelsForUser(
        adminUserId,
        workspaceId,
        { role: 'admin' },
      );
      expect(adminChannels.map((c) => c._id)).toEqual(['chan-proj-a', 'chan-proj-b']);
    });

    it('returns ONLY project channels the user belongs to for regular members', async () => {
      mocks.findByMember.mockResolvedValue([projectAChannel]);

      const memberChannels = await channelService.getChannelsForUser(
        memberAUserId,
        workspaceId,
        { role: 'member' },
      );
      expect(memberChannels.map((c) => c._id)).toEqual(['chan-proj-a']);
    });
  });
});
