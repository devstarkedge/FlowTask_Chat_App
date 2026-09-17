import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map(), syncDepartment: vi.fn(), createChannel: vi.fn(),
  addMember: vi.fn(), removeMember: vi.fn(), findByRef: vi.fn(),
  findBySlug: vi.fn(), upsertUser: vi.fn(), findUser: vi.fn(),
  syncRole: vi.fn(), findMembership: vi.fn(), emitToUser: vi.fn(), systemMessage: vi.fn(),
}));
vi.mock('../services/eventBus.js', () => ({ default: {
  register: (event, handler) => mocks.handlers.set(event, handler),
} }));
vi.mock('../modules/categories/Department.model.js', () => ({ default: {
  findOneAndUpdate: mocks.syncDepartment,
} }));
vi.mock('../modules/channels/channel.service.js', () => ({ default: {
  getOrCreateDepartmentChannel: mocks.createChannel,
  addMember: mocks.addMember, removeMember: mocks.removeMember,
} }));
vi.mock('../modules/channels/channel.repository.js', () => ({ default: {
  findByFlowTaskRef: mocks.findByRef, findBySlug: mocks.findBySlug,
} }));
vi.mock('../modules/messages/message.service.js', () => ({ default: { sendSystemMessage: mocks.systemMessage } }));
vi.mock('../modules/users/user.repository.js', () => ({ default: {
  upsertFromFlowTask: mocks.upsertUser, findByFlowTaskId: mocks.findUser,
} }));
vi.mock('../services/roleSync.service.js', () => ({ default: { syncUserRole: mocks.syncRole } }));
vi.mock('../modules/workspaces/WorkspaceMembership.model.js', () => ({ default: { findOne: mocks.findMembership } }));
vi.mock('../sockets/socketManager.js', () => ({ emitToUser: mocks.emitToUser }));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { registerDepartmentTeamEventHandlers } from '../modules/webhooks/handlers/departmentTeamEventHandler.js';
import { registerUserEventHandlers } from '../modules/webhooks/handlers/userEventHandler.js';
import { FLOWTASK_EVENTS } from '../config/constants.js';

const payload = {
  _workspaceId: 'chat-workspace', workspaceId: 'flowtask-workspace',
  department: { _id: 'dept-1', name: 'Engineering' },
  user: { _id: 'flowtask-user', name: 'Member', department: { _id: 'dept-1', name: 'Engineering' } },
  access: { role: 'employee' },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.handlers.clear();
  mocks.syncDepartment.mockResolvedValue({});
  mocks.upsertUser.mockResolvedValue({ _id: 'chat-user', name: 'Member' });
  mocks.findUser.mockResolvedValue({ _id: 'chat-user' });
  mocks.findMembership.mockReturnValue({ lean: async () => ({ flowTaskAccess: { role: 'employee' } }) });
  mocks.findBySlug.mockResolvedValue(null);
  mocks.findByRef.mockResolvedValue(null);
  registerDepartmentTeamEventHandlers();
  registerUserEventHandlers();
});

describe('departments organize actual channels only', () => {
  it('syncs a new department directory entry without creating or announcing a channel', async () => {
    await mocks.handlers.get(FLOWTASK_EVENTS.DEPARTMENT_CREATED)(payload);
    expect(mocks.syncDepartment).toHaveBeenCalledWith(
      { workspaceId: 'chat-workspace', externalId: 'dept-1' },
      { name: 'Engineering', description: '', icon: '', color: '' },
      { upsert: true, new: true },
    );
    expect(mocks.createChannel).not.toHaveBeenCalled();
    expect(mocks.emitToUser).not.toHaveBeenCalled();
    expect(mocks.systemMessage).not.toHaveBeenCalled();
  });

  it('does not create a channel on repeated department deliveries', async () => {
    const handler = mocks.handlers.get(FLOWTASK_EVENTS.DEPARTMENT_CREATED);
    await handler(payload);
    await handler(payload);
    expect(mocks.syncDepartment).toHaveBeenCalledTimes(2);
    expect(mocks.createChannel).not.toHaveBeenCalled();
  });

  it('skips incomplete department events', async () => {
    const handler = mocks.handlers.get(FLOWTASK_EVENTS.DEPARTMENT_CREATED);
    await handler({ department: payload.department });
    await handler({ _workspaceId: 'chat-workspace', department: { name: 'No ID' } });
    expect(mocks.syncDepartment).not.toHaveBeenCalled();
    expect(mocks.createChannel).not.toHaveBeenCalled();
  });

  it('allows a failed directory sync to be retried', async () => {
    mocks.syncDepartment.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(mocks.handlers.get(FLOWTASK_EVENTS.DEPARTMENT_CREATED)(payload)).rejects.toThrow('Database unavailable');
  });

  it.each([FLOWTASK_EVENTS.USER_CREATED, FLOWTASK_EVENTS.USER_VERIFIED, FLOWTASK_EVENTS.USER_UPDATED])(
    '%s preserves user/access sync without creating a department channel', async (event) => {
      await mocks.handlers.get(event)({ ...payload, changes: { department: { old: null, new: payload.department } } });
      expect(mocks.upsertUser).toHaveBeenCalled();
      expect(mocks.syncRole).toHaveBeenCalledWith('flowtask-user', 'employee', 'chat-workspace', payload.access);
      expect(mocks.createChannel).not.toHaveBeenCalled();
      expect(mocks.addMember).not.toHaveBeenCalled();
    },
  );

  it('does not re-enroll users into legacy generated department channels', async () => {
    mocks.findByRef.mockResolvedValue({ _id: 'legacy-channel', type: 'department' });
    await mocks.handlers.get(FLOWTASK_EVENTS.DEPARTMENT_MEMBER_ADDED)({
      _workspaceId: 'chat-workspace', departmentId: 'dept-1', memberId: 'flowtask-user',
    });
    expect(mocks.addMember).not.toHaveBeenCalled();
  });
});
