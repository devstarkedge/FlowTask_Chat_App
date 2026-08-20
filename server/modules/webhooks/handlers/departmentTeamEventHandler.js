import eventBus from '../../../services/eventBus.js';
import channelService from '../../channels/channel.service.js';
import channelRepository from '../../channels/channel.repository.js';
import messageService from '../../messages/message.service.js';
import userRepository from '../../users/user.repository.js';
import Department from '../../categories/Department.model.js';
import { emitToUser } from '../../../sockets/socketManager.js';
import logger from '../../../utils/logger.js';
import { FLOWTASK_EVENTS, SOCKET_EVENTS } from '../../../config/constants.js';
import { requireWorkspaceId } from '../../../utils/webhookEventGuard.js';

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
      const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.DEPARTMENT_CREATED);
      const { department, userId } = payload;
      if (!wsId || !department) return;

      const deptId = department._id || department.id;
      const deptName = department.name || 'Unnamed Department';

      const channel = await channelService.getOrCreateDepartmentChannel(deptId, deptName, wsId);

      // Sync Department to local collection
      await Department.findOneAndUpdate(
        { workspaceId: wsId, externalId: deptId },
        { 
          name: deptName, 
          description: department.description || '', 
          icon: department.icon || '',
          color: department.color || ''
        },
        { upsert: true, new: true }
      );

      // Broadcast channel:created so it appears in sidebar for relevant users
      const populated = await channelRepository.findById(channel._id, { workspaceId: wsId });
      if (populated) {
        for (const member of populated.members || []) {
          const uid = member.userId?._id?.toString() || member.userId?.toString();
          if (uid) {
            emitToUser(uid, SOCKET_EVENTS.CHANNEL_CREATED, {
              channel: {
                _id: populated._id,
                name: populated.name,
                slug: populated.slug,
                type: populated.type,
                visibility: populated.visibility,
                isArchived: populated.isArchived,
                systemManaged: populated.systemManaged,
                departmentRef: populated.departmentRef,
                adminOverrides: populated.adminOverrides,
                flowTaskRef: populated.flowTaskRef,
                memberCount: populated.memberCount || populated.members?.length,
              },
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
      const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.DEPARTMENT_UPDATED);
      const { department, changes } = payload;
      if (!wsId || !department) return;

      const deptId = department._id || department.id;
      
      // Sync local Department collection
      const deptUpdates = {};
      if (changes?.name) deptUpdates.name = changes.name;
      if (changes?.description !== undefined) deptUpdates.description = changes.description;
      if (changes?.icon !== undefined) deptUpdates.icon = changes.icon;
      if (changes?.color !== undefined) deptUpdates.color = changes.color;
      
      if (Object.keys(deptUpdates).length > 0) {
        await Department.findOneAndUpdate(
          { workspaceId: wsId, externalId: deptId },
          { $set: deptUpdates }
        );
      }

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
      const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.DEPARTMENT_DELETED);
      const { departmentId, departmentName } = payload;
      if (!wsId || !departmentId) return;

      // Delete from local Department collection
      await Department.findOneAndDelete({ workspaceId: wsId, externalId: departmentId });

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
      const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.DEPARTMENT_MEMBER_ADDED);
      const { departmentId, memberId } = payload;
      if (!wsId || !departmentId || !memberId) return;

      const channel = await channelRepository.findByFlowTaskRef('department', departmentId, wsId);
      if (!channel) return;

      const user = await userRepository.findByFlowTaskId(memberId, wsId);
      if (!user) return;

      await channelService.addMember(channel._id, user._id, undefined, wsId);
    } catch (err) {
      logger.error('DEPARTMENT_MEMBER_ADDED handler failed', { error: err.message, payload });
    }
  });

  eventBus.register(FLOWTASK_EVENTS.DEPARTMENT_MEMBER_REMOVED, async (payload) => {
    try {
      const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.DEPARTMENT_MEMBER_REMOVED);
      const { departmentId, memberId } = payload;
      if (!wsId || !departmentId || !memberId) return;

      const channel = await channelRepository.findByFlowTaskRef('department', departmentId, wsId);
      if (!channel) return;

      const user = await userRepository.findByFlowTaskId(memberId, wsId);
      if (!user) return;

      await channelService.removeMember(channel._id, user._id, 'system', wsId);
    } catch (err) {
      logger.error('DEPARTMENT_MEMBER_REMOVED handler failed', { error: err.message, payload });
    }
  });

  // ─── Team Events ──────────────────────────────────────────────────────

  eventBus.register(FLOWTASK_EVENTS.TEAM_CREATED, async (payload) => {
    try {
      const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.TEAM_CREATED);
      const { team, userId } = payload;
      if (!wsId || !team) return;

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
              channel: {
                _id: populated._id,
                name: populated.name,
                slug: populated.slug,
                type: populated.type,
                visibility: populated.visibility,
                isArchived: populated.isArchived,
                systemManaged: populated.systemManaged,
                departmentRef: populated.departmentRef,
                adminOverrides: populated.adminOverrides,
                flowTaskRef: populated.flowTaskRef,
                memberCount: populated.memberCount || populated.members?.length,
              },
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
      const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.TEAM_UPDATED);
      const { team, changes } = payload;
      if (!wsId || !team) return;

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
      const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.TEAM_DELETED);
      const { teamId, teamName } = payload;
      if (!wsId || !teamId) return;

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
      const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.TEAM_MEMBER_ADDED);
      const { teamId, memberId } = payload;
      if (!wsId || !teamId || !memberId) return;

      const channel = await channelRepository.findByFlowTaskRef('team', teamId, wsId);
      if (!channel) return;

      const user = await userRepository.findByFlowTaskId(memberId, wsId);
      if (!user) return;

      await channelService.addMember(channel._id, user._id, undefined, wsId);
    } catch (err) {
      logger.error('TEAM_MEMBER_ADDED handler failed', { error: err.message, payload });
    }
  });

  eventBus.register(FLOWTASK_EVENTS.TEAM_MEMBER_REMOVED, async (payload) => {
    try {
      const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.TEAM_MEMBER_REMOVED);
      const { teamId, memberId } = payload;
      if (!wsId || !teamId || !memberId) return;

      const channel = await channelRepository.findByFlowTaskRef('team', teamId, wsId);
      if (!channel) return;

      const user = await userRepository.findByFlowTaskId(memberId, wsId);
      if (!user) return;

      await channelService.removeMember(channel._id, user._id, 'system', wsId);
    } catch (err) {
      logger.error('TEAM_MEMBER_REMOVED handler failed', { error: err.message, payload });
    }
  });

  logger.info('Department/Team event handlers registered');
}
