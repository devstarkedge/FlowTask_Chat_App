import eventBus from '../../../services/eventBus.js';
import channelService from '../../channels/channel.service.js';
import channelRepository from '../../channels/channel.repository.js';
import messageService from '../../messages/message.service.js';
import userRepository from '../../users/user.repository.js';
import { emitToUser } from '../../../sockets/socketManager.js';
import logger from '../../../utils/logger.js';
import { FLOWTASK_EVENTS, SOCKET_EVENTS } from '../../../config/constants.js';

/**
 * Department & Team Event Handler — handles FlowTask department/team lifecycle events.
 *
 * Events:
 *   DEPARTMENT_CREATED  — Auto-create department channel
 *   DEPARTMENT_UPDATED  — Update channel name/description
 *   DEPARTMENT_DELETED  — Archive department channel
 *   DEPARTMENT_MEMBER_ADDED — Add user to department channel
 *   DEPARTMENT_MEMBER_REMOVED — Remove user from department channel
 *   TEAM_CREATED        — Auto-create team channel
 *   TEAM_UPDATED        — Update channel name/description
 *   TEAM_DELETED        — Archive team channel
 *   TEAM_MEMBER_ADDED   — Add user to team channel
 *   TEAM_MEMBER_REMOVED — Remove user from team channel
 */

export function registerDepartmentTeamEventHandlers() {
  // ─── Department Events ────────────────────────────────────────────────

  eventBus.register(FLOWTASK_EVENTS.DEPARTMENT_CREATED, async (payload) => {
    try {
      const { department, userId, _workspaceId: wsId } = payload;
      if (!department || !wsId) return;

      const deptId = department._id || department.id;
      const deptName = department.name || 'Unnamed Department';

      const channel = await channelService.getOrCreateDepartmentChannel(deptId, deptName, wsId);

      // Broadcast channel:created so it appears in sidebar for relevant users
      const populated = await channelRepository.findById(channel._id, { workspaceId: wsId });
      if (populated) {
        for (const member of populated.members || []) {
          const uid = member.userId?._id?.toString() || member.userId?.toString();
          if (uid) {
            emitToUser(uid, SOCKET_EVENTS.CHANNEL_CREATED, {
              channel: { _id: populated._id, name: populated.name, slug: populated.slug, type: populated.type },
            }, wsId);
          }
        }
      }

      const creator = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
      await messageService.sendSystemMessage(
        channel._id,
        `🏢 Department channel created${creator ? ` by ${creator.name}` : ''}`,
        undefined,
        wsId,
      );

      logger.info('Department channel auto-created', { deptId, channelId: channel._id });
    } catch (err) {
      logger.error('DEPARTMENT_CREATED handler failed', { error: err.message, payload });
    }
  });

  eventBus.register(FLOWTASK_EVENTS.DEPARTMENT_UPDATED, async (payload) => {
    try {
      const { department, changes, _workspaceId: wsId } = payload;
      if (!department) return;

      const deptId = department._id || department.id;
      const channel = await channelRepository.findByFlowTaskRef('department', deptId, wsId);
      if (!channel) return;

      const updates = {};
      if (changes?.name) updates.name = changes.name;
      if (changes?.description !== undefined) updates.description = changes.description;

      if (Object.keys(updates).length > 0) {
        await channelRepository.update(channel._id, updates, wsId);
      }
    } catch (err) {
      logger.error('DEPARTMENT_UPDATED handler failed', { error: err.message, payload });
    }
  });

  eventBus.register(FLOWTASK_EVENTS.DEPARTMENT_DELETED, async (payload) => {
    try {
      const { departmentId, departmentName, _workspaceId: wsId } = payload;
      if (!departmentId) return;

      const channel = await channelRepository.findByFlowTaskRef('department', departmentId, wsId);
      if (!channel || channel.isArchived) return;

      await channelRepository.archive(channel._id, 'Department deleted in FlowTask', wsId);
      await messageService.sendSystemMessage(
        channel._id,
        `🏢 Department "${departmentName || 'Unknown'}" was deleted. Channel archived.`,
        undefined,
        wsId,
      );
    } catch (err) {
      logger.error('DEPARTMENT_DELETED handler failed', { error: err.message, payload });
    }
  });

  eventBus.register(FLOWTASK_EVENTS.DEPARTMENT_MEMBER_ADDED, async (payload) => {
    try {
      const { departmentId, memberId, _workspaceId: wsId } = payload;
      if (!departmentId || !memberId) return;

      const channel = await channelRepository.findByFlowTaskRef('department', departmentId, wsId);
      if (!channel) return;

      const user = await userRepository.findByFlowTaskId(memberId, wsId);
      if (!user) return;

      await channelService.addMember(channel._id, user._id);
    } catch (err) {
      logger.error('DEPARTMENT_MEMBER_ADDED handler failed', { error: err.message, payload });
    }
  });

  eventBus.register(FLOWTASK_EVENTS.DEPARTMENT_MEMBER_REMOVED, async (payload) => {
    try {
      const { departmentId, memberId, _workspaceId: wsId } = payload;
      if (!departmentId || !memberId) return;

      const channel = await channelRepository.findByFlowTaskRef('department', departmentId, wsId);
      if (!channel) return;

      const user = await userRepository.findByFlowTaskId(memberId, wsId);
      if (!user) return;

      await channelService.removeMember(channel._id, user._id, 'system');
    } catch (err) {
      logger.error('DEPARTMENT_MEMBER_REMOVED handler failed', { error: err.message, payload });
    }
  });

  // ─── Team Events ──────────────────────────────────────────────────────

  eventBus.register(FLOWTASK_EVENTS.TEAM_CREATED, async (payload) => {
    try {
      const { team, userId, _workspaceId: wsId } = payload;
      if (!team || !wsId) return;

      const teamId = team._id || team.id;
      const teamName = team.name || 'Unnamed Team';

      const channel = await channelService.getOrCreateTeamChannel(teamId, teamName, wsId);

      // Broadcast channel:created so it appears in sidebar for relevant users
      const populated = await channelRepository.findById(channel._id, { workspaceId: wsId });
      if (populated) {
        for (const member of populated.members || []) {
          const uid = member.userId?._id?.toString() || member.userId?.toString();
          if (uid) {
            emitToUser(uid, SOCKET_EVENTS.CHANNEL_CREATED, {
              channel: { _id: populated._id, name: populated.name, slug: populated.slug, type: populated.type },
            }, wsId);
          }
        }
      }

      const creator = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
      await messageService.sendSystemMessage(
        channel._id,
        `👥 Team channel created${creator ? ` by ${creator.name}` : ''}`,
        undefined,
        wsId,
      );

      logger.info('Team channel auto-created', { teamId, channelId: channel._id });
    } catch (err) {
      logger.error('TEAM_CREATED handler failed', { error: err.message, payload });
    }
  });

  eventBus.register(FLOWTASK_EVENTS.TEAM_UPDATED, async (payload) => {
    try {
      const { team, changes, _workspaceId: wsId } = payload;
      if (!team) return;

      const teamId = team._id || team.id;
      const channel = await channelRepository.findByFlowTaskRef('team', teamId, wsId);
      if (!channel) return;

      const updates = {};
      if (changes?.name) updates.name = changes.name;
      if (changes?.description !== undefined) updates.description = changes.description;

      if (Object.keys(updates).length > 0) {
        await channelRepository.update(channel._id, updates, wsId);
      }
    } catch (err) {
      logger.error('TEAM_UPDATED handler failed', { error: err.message, payload });
    }
  });

  eventBus.register(FLOWTASK_EVENTS.TEAM_DELETED, async (payload) => {
    try {
      const { teamId, teamName, _workspaceId: wsId } = payload;
      if (!teamId) return;

      const channel = await channelRepository.findByFlowTaskRef('team', teamId, wsId);
      if (!channel || channel.isArchived) return;

      await channelRepository.archive(channel._id, 'Team deleted in FlowTask', wsId);
      await messageService.sendSystemMessage(
        channel._id,
        `👥 Team "${teamName || 'Unknown'}" was deleted. Channel archived.`,
        undefined,
        wsId,
      );
    } catch (err) {
      logger.error('TEAM_DELETED handler failed', { error: err.message, payload });
    }
  });

  eventBus.register(FLOWTASK_EVENTS.TEAM_MEMBER_ADDED, async (payload) => {
    try {
      const { teamId, memberId, _workspaceId: wsId } = payload;
      if (!teamId || !memberId) return;

      const channel = await channelRepository.findByFlowTaskRef('team', teamId, wsId);
      if (!channel) return;

      const user = await userRepository.findByFlowTaskId(memberId, wsId);
      if (!user) return;

      await channelService.addMember(channel._id, user._id);
    } catch (err) {
      logger.error('TEAM_MEMBER_ADDED handler failed', { error: err.message, payload });
    }
  });

  eventBus.register(FLOWTASK_EVENTS.TEAM_MEMBER_REMOVED, async (payload) => {
    try {
      const { teamId, memberId, _workspaceId: wsId } = payload;
      if (!teamId || !memberId) return;

      const channel = await channelRepository.findByFlowTaskRef('team', teamId, wsId);
      if (!channel) return;

      const user = await userRepository.findByFlowTaskId(memberId, wsId);
      if (!user) return;

      await channelService.removeMember(channel._id, user._id, 'system');
    } catch (err) {
      logger.error('TEAM_MEMBER_REMOVED handler failed', { error: err.message, payload });
    }
  });

  logger.info('Department/Team event handlers registered');
}
