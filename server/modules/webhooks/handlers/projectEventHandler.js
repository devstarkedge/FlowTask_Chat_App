import eventBus from '../../../services/eventBus.js';
import botNotifier from '../../../services/botNotifier.js';
import channelService from '../../channels/channel.service.js';
import messageService from '../../messages/message.service.js';
import userRepository from '../../users/user.repository.js';
import channelRepository from '../../channels/channel.repository.js';
import logger from '../../../utils/logger.js';
import { FLOWTASK_EVENTS, MESSAGE_CONTENT_TYPES } from '../../../config/constants.js';

function requireWorkspaceId(payload, eventName) {
  const wsId = payload?._workspaceId;
  if (!wsId) {
    logger.warn(`${eventName}: missing _workspaceId, skipping event`);
    return null;
  }
  return wsId;
}

/**
 * Project Event Handler — handles project/board lifecycle events.
 *
 * Events:
 *   project.created   — Auto-create project channel, post welcome message
 *   project.updated   — Update channel metadata (name change)
 *   project.deleted   — Archive project channel
 *   project.member_added   — Add member to project channel
 *   project.member_removed — Remove member from project channel
 */

export function registerProjectEventHandlers() {
  // ─── project.created ────────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.PROJECT_CREATED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.PROJECT_CREATED);
    if (!wsId) return;

    const { board, userId } = payload;

    if (!board || !board._id) {
      logger.warn('project.created: missing board data', { payload });
      return;
    }

    // Create project channel
    const channel = await channelService.createProjectChannel(board, userId, wsId);

    // Sync board members if provided
    if (board.members?.length) {
      const memberIds = board.members
        .map((m) => (typeof m === 'string' ? m : m.user || m._id))
        .filter(Boolean);

      if (memberIds.length > 0) {
        await channelService.syncMembers(channel._id, memberIds, wsId);
      }
    }

    // Post welcome system message
    await messageService.sendSystemMessage(
      channel._id,
      `📋 Project channel created for **${board.title}**. All project members will be automatically added here.`,
      { entityType: 'board', entityId: board._id },
      wsId,
    );

    logger.info('project.created handled', {
      channelId: channel._id,
      boardId: board._id,
    });

    // Notify admin & managers channels
    const creator = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const creatorName = creator?.name || 'Someone';
    const deptName = typeof board.department === 'object' ? board.department?.name : null;
    await botNotifier.onProjectCreated(board.title || board.name, creatorName, deptName, wsId);
  });

  // ─── project.updated ────────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.PROJECT_UPDATED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.PROJECT_UPDATED);
    if (!wsId) return;

    const { board, changes, userId } = payload;

    if (!board?._id) return;

    const channel = await channelRepository.findByFlowTaskRef('board', board._id, wsId);
    if (!channel) {
      logger.warn('project.updated: no channel found for board', { boardId: board._id });
      return;
    }

    // Update channel metadata if name changed
    if (changes?.title || changes?.description) {
      const updates = {};
      if (changes?.title) {
        updates.name = changes.title;
        // Generate new slug from the new title
        const { slugify, appendCollisionSuffix } = await import('../../../utils/slugify.js');
        let newSlug = slugify(changes.title);
        // Check if slug already exists for another channel
        const existingSlug = await channelRepository.findBySlug(newSlug, wsId);
        if (existingSlug && existingSlug._id.toString() !== channel._id.toString()) {
          newSlug = appendCollisionSuffix(newSlug, board._id);
        }
        updates.slug = newSlug;
      }
      if (changes?.description) {
        updates.description = changes.description;
      }

      await channelService.updateChannel(channel._id, updates, null);

      // Emit channel update via socket
      const { emitToChannel: emitChannel } = await import('../../../sockets/socketManager.js');
      const { SOCKET_EVENTS: SE } = await import('../../../config/constants.js');
      emitChannel(channel._id.toString(), SE.CHANNEL_UPDATED, {
        channel: { _id: channel._id, name: updates.name || channel.name, slug: updates.slug || channel.slug },
      }, wsId);
    }

    // Post update notification
    const user = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const userName = user?.name || 'Someone';

    const changeDetails = [];
    if (changes?.title) changeDetails.push(`title to "${changes.title}"`);
    if (changes?.description) changeDetails.push('description');
    if (changes?.status) changeDetails.push(`status to "${changes.status}"`);

    if (changeDetails.length > 0) {
      await messageService.sendSystemMessage(
        channel._id,
        `🔄 ${userName} updated project: ${changeDetails.join(', ')}`,
        { entityType: 'board', entityId: board._id },
        wsId,
      );
    }
  });

  // ─── project.deleted ────────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.PROJECT_DELETED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.PROJECT_DELETED);
    if (!wsId) return;

    const { boardId, userId } = payload;

    if (!boardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', boardId, wsId);
    if (!channel) return;

    // Post notification before archiving
    const user = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    await messageService.sendSystemMessage(
      channel._id,
      `🗑️ Project was deleted by ${user?.name || 'an admin'}. This channel is now archived.`,
      undefined,
      wsId,
    );

    // Archive the channel
    await channelService.archiveChannel(channel._id, 'system');

    logger.info('project.deleted handled', { channelId: channel._id, boardId });
  });

  // ─── project.member_added ──────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.PROJECT_MEMBER_ADDED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.PROJECT_MEMBER_ADDED);
    if (!wsId) return;

    const { boardId, memberId, userId } = payload;

    if (!boardId || !memberId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', boardId, wsId);
    if (!channel) return;

    await channelService.syncMembers(channel._id, [memberId], wsId);

    // Post join message
    const member = await userRepository.findByFlowTaskId(memberId, wsId);
    const addedBy = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;

    if (member) {
      await messageService.sendSystemMessage(
        channel._id,
        `👤 ${member.name} was added to the project${addedBy ? ` by ${addedBy.name}` : ''}`,
        undefined,
        wsId,
      );
    }
  });

  // ─── project.member_removed ────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.PROJECT_MEMBER_REMOVED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.PROJECT_MEMBER_REMOVED);
    if (!wsId) return;

    const { boardId, memberId, userId } = payload;

    if (!boardId || !memberId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', boardId, wsId);
    if (!channel) return;

    const member = await userRepository.findByFlowTaskId(memberId, wsId);
    if (member) {
      await channelService.removeMember(channel._id, member._id, 'system');

      await messageService.sendSystemMessage(
        channel._id,
        `👤 ${member.name} was removed from the project`,
        undefined,
        wsId,
      );
    }
  });

  // ─── project.member_assigned ───────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.PROJECT_MEMBER_ASSIGNED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.PROJECT_MEMBER_ASSIGNED);
    if (!wsId) return;

    const { boardId, memberId, role, userId } = payload;

    if (!boardId || !memberId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', boardId, wsId);
    if (!channel) return;

    await channelService.syncMembers(channel._id, [memberId], wsId);

    const member = await userRepository.findByFlowTaskId(memberId, wsId);
    const assignedBy = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;

    if (member) {
      const roleLabel = role ? ` as **${role}**` : '';
      await messageService.sendSystemMessage(
        channel._id,
        `👤 ${member.name} was assigned to the project${roleLabel}${assignedBy ? ` by ${assignedBy.name}` : ''}`,
        undefined,
        wsId,
      );
    }
  });

  logger.info('Project event handlers registered');
}
