import eventBus from '../../../services/eventBus.js';
import botNotifier from '../../../services/botNotifier.js';
import channelService from '../../channels/channel.service.js';
import messageService from '../../messages/message.service.js';
import userRepository from '../../users/user.repository.js';
import channelRepository from '../../channels/channel.repository.js';
import { emitToChannel, emitToUser } from '../../../sockets/socketManager.js';
import logger from '../../../utils/logger.js';
import { FLOWTASK_EVENTS, SOCKET_EVENTS } from '../../../config/constants.js';
import { requireWorkspaceId } from '../../../utils/webhookEventGuard.js';

function normalizeEntityId(value) {
  if (!value) return null;
  if (typeof value === 'object') {
    if (value._id) return value._id.toString();
    if (value.id) return value.id.toString();
    try { const s = value.toString(); if (s && s !== '[object Object]') return s; } catch {}
    return null;
  }
  if (typeof value === 'string') {
    const idMatch = value.match(/[0-9a-fA-F]{24}/);
    if (idMatch) return idMatch[0];
    return value;
  }
  try { return String(value); } catch { return null; }
}

function collectProjectMemberIds(payload) {
  const candidates = payload?.memberIds
    || payload?.members
    || payload?.project?.members
    || payload?.board?.members
    || [];

  return [...new Set(
    candidates
      .map((member) => {
        if (!member) return null;
        if (typeof member === 'string') return member;
        return member.userId || member._id || member.id || null;
      })
      .filter(Boolean)
      .map((memberId) => memberId.toString()),
  )];
}

function collectProjectOwnerId(payload) {
  return normalizeEntityId(
    payload?.ownerId || payload?.project?.owner || payload?.board?.owner,
  );
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
  eventBus.register(FLOWTASK_EVENTS.PROJECT_MEMBERSHIP_SYNCED, async (payload) => {
    const wsId = requireWorkspaceId(
      payload,
      FLOWTASK_EVENTS.PROJECT_MEMBERSHIP_SYNCED,
    );
    if (!wsId) return;

    const board = payload.board || payload.project;
    const boardId = normalizeEntityId(board?._id || board?.id);
    if (!boardId) {
      logger.warn('project.membership_synced: missing project ID');
      return;
    }

    const channel = await channelService.createProjectChannel(
      { ...board, _id: boardId, visibility: 'private' },
      payload.actor?.id,
      wsId,
    );
    await channelService.reconcileProjectMembers(
      channel._id,
      payload.participants || payload.memberIds || [],
      wsId,
      {
        ownerFlowTaskId: payload.project?.owner || payload.board?.owner,
        membershipVersion: payload.membershipVersion || 0,
      },
    );

    logger.info('project.membership_synced handled', {
      boardId,
      channelId: channel._id,
      membershipVersion: payload.membershipVersion || 0,
      participantCount: payload.participants?.length || 0,
    });
  });

  // ─── project.created ────────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.PROJECT_CREATED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.PROJECT_CREATED);
    if (!wsId) return;

    const { board, userId, deliveryId } = payload;

    if (!board || !board._id) {
      logger.warn('project.created: missing board data', { deliveryId, payload: Object.keys(payload) });
      return;
    }

    logger.info('project.created: creating project channel', {
      deliveryId,
      boardId: board._id,
      boardTitle: board.title || board.name,
      workspaceId: wsId,
      step: 'channel_creation_start',
    });

    // Create project channel
    const channel = await channelService.createProjectChannel(board, userId, wsId);

    logger.info('project.created: channel created', {
      deliveryId,
      channelId: channel._id,
      slug: channel.slug,
      boardId: board._id,
      step: 'channel_created',
    });

    const memberIds = collectProjectMemberIds(payload);
    const ownerId = collectProjectOwnerId(payload) || userId;

    if (
      !payload.authoritativeSnapshotFollows &&
      (memberIds.length > 0 || ownerId)
    ) {
      await channelService.reconcileProjectMembers(channel._id, memberIds, wsId, {
        ownerFlowTaskId: ownerId,
      });
      logger.info('project.created: members reconciled', {
        deliveryId,
        channelId: channel._id,
        memberCount: memberIds.length,
        ownerId,
        step: 'members_reconciled',
      });
    }

    // Broadcast channel:created to all members so it appears in sidebar instantly
    const populatedChannel = await channelRepository.findById(channel._id, { workspaceId: wsId });
    if (populatedChannel) {
      for (const member of populatedChannel.members || []) {
        const uid = member.userId?._id?.toString() || member.userId?.toString();
        if (uid) {
          emitToUser(uid, SOCKET_EVENTS.CHANNEL_CREATED, {
            channel: {
              _id: populatedChannel._id,
              name: populatedChannel.name,
              slug: populatedChannel.slug,
              type: populatedChannel.type,
              visibility: populatedChannel.visibility,
              isArchived: populatedChannel.isArchived,
              systemManaged: populatedChannel.systemManaged,
              departmentRef: populatedChannel.departmentRef,
              adminOverrides: populatedChannel.adminOverrides,
              flowTaskRef: populatedChannel.flowTaskRef,
              memberCount: populatedChannel.memberCount || populatedChannel.members?.length,
            },
          }, wsId);
        }
      }
    }

    // Post welcome system message (emits MESSAGE_CREATE via socket automatically)
    await messageService.sendSystemMessage(
      channel._id,
      `📋 Project channel created for **${board.title || board.name}**. All project members will be automatically added here.`,
      { entityType: 'board', entityId: board._id },
      wsId,
    );

    logger.info('project.created: welcome message posted', {
      deliveryId,
      channelId: channel._id,
      step: 'welcome_message_posted',
    });

    // Notify admin & managers channels
    const creator = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const creatorName = creator?.name || 'Someone';
    const deptName = typeof board.department === 'object' ? board.department?.name : null;
    await botNotifier.onProjectCreated(board.title || board.name, creatorName, deptName, wsId);

    logger.info('project.created: fully handled', {
      deliveryId,
      channelId: channel._id,
      boardId: board._id,
      step: 'project_created_complete',
    });
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

    // Update channel metadata if name, description, department, or status changed
    if (changes?.title || changes?.description || changes?.department || changes?.departmentId || changes?.status || changes?.isArchived !== undefined) {
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
      if (changes?.description !== undefined) {
        updates.description = changes.description;
      }
      
      // Handle department changes
      const newDept = changes?.department || changes?.departmentId;
      if (newDept) {
        const deptObj = typeof newDept === 'object' ? newDept : null;
        const deptId = deptObj?._id || deptObj?.id || (typeof newDept === 'string' ? newDept : null);
        const deptName = deptObj?.name || 'general';
        if (deptId) {
          updates.departmentRef = { departmentId: deptId.toString(), departmentName: deptName };
        } else if (newDept === null) {
          updates.departmentRef = { departmentId: null, departmentName: null };
        }
      }

      // Handle unarchiving / restoring via status
      if (changes?.status === 'active' || changes?.isArchived === false) {
        updates.isArchived = false;
      }

      // Handle archiving
      if (changes?.status === 'archived' || changes?.isArchived === true) {
        await channelService.archiveChannel(channel._id, 'system', wsId);
        // The archiveChannel method handles emitting the update event for archiving.
      }

      await channelService.updateChannel(channel._id, updates, null, wsId);
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
    const normalizedBoardId = normalizeEntityId(boardId || payload.board || payload.board?._id);

    if (!normalizedBoardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', normalizedBoardId, wsId);
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
    const normalizedBoardId = normalizeEntityId(boardId || payload.board || payload.board?._id);
    const memberIds = collectProjectMemberIds(payload);
    const ownerId = collectProjectOwnerId(payload);

    if (!normalizedBoardId || !memberId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', normalizedBoardId, wsId);
    if (!channel) return;
    if (payload.authoritativeSnapshotFollows) return;

    if (
      !payload.authoritativeSnapshotFollows &&
      (memberIds.length > 0 || ownerId)
    ) {
      await channelService.reconcileProjectMembers(channel._id, memberIds, wsId, {
        ownerFlowTaskId: ownerId,
      });
    } else {
      await channelService.syncMembers(channel._id, [memberId], wsId);
    }

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

    const { boardId, memberId, userId, hasActiveTasks } = payload;
    const normalizedBoardId = normalizeEntityId(boardId || payload.board || payload.board?._id);
    const memberIds = collectProjectMemberIds(payload);
    const ownerId = collectProjectOwnerId(payload);

    if (!normalizedBoardId || !memberId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', normalizedBoardId, wsId);
    if (!channel) return;
    if (payload.authoritativeSnapshotFollows) return;

    const member = await userRepository.findByFlowTaskId(memberId, wsId);
    const removedBy = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const removedByName = removedBy?.name || 'Someone';

    if (hasActiveTasks) {
      // User still has task/subtask/nano assignments — keep in channel
      logger.info('project.member_removed: user has active tasks, keeping in channel', {
        memberId,
        boardId: normalizedBoardId,
        channelId: channel._id,
      });

      if (member) {
        await messageService.sendSystemMessage(
          channel._id,
          `👤 ${member.name} was removed from the project by ${removedByName} but still has active task assignments`,
          undefined,
          wsId,
        );
      }
    } else {
      // No active tasks — safe to remove from channel
      if (memberIds.length > 0 || ownerId) {
        await channelService.reconcileProjectMembers(channel._id, memberIds, wsId, {
          ownerFlowTaskId: ownerId,
        });
      } else if (member) {
        await channelService.removeMember(channel._id, member._id, 'system', wsId);
      }

      if (member) {
        await messageService.sendSystemMessage(
          channel._id,
          `👤 ${removedByName} removed ${member.name} from the project`,
          undefined,
          wsId,
        );
      }
    }
  });

  // ─── project.member_assigned ───────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.PROJECT_MEMBER_ASSIGNED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.PROJECT_MEMBER_ASSIGNED);
    if (!wsId) return;

    const { boardId, memberId, role, userId } = payload;
    const normalizedBoardId = normalizeEntityId(boardId || payload.board || payload.board?._id);
    const memberIds = collectProjectMemberIds(payload);
    const ownerId = collectProjectOwnerId(payload);

    if (!normalizedBoardId || !memberId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', normalizedBoardId, wsId);
    if (!channel) return;
    if (payload.authoritativeSnapshotFollows) return;

    if (memberIds.length > 0 || ownerId) {
      await channelService.reconcileProjectMembers(channel._id, memberIds, wsId, {
        ownerFlowTaskId: ownerId,
      });
    } else {
      await channelService.syncMembers(channel._id, [memberId], wsId);
    }

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
