import eventBus from '../../../services/eventBus.js';
import channelRepository from '../../channels/channel.repository.js';
import threadService from '../../threads/thread.service.js';
import threadRepository from '../../threads/thread.repository.js';
import messageService from '../../messages/message.service.js';
import userRepository from '../../users/user.repository.js';
import logger from '../../../utils/logger.js';
import { FLOWTASK_EVENTS } from '../../../config/constants.js';

function requireWorkspaceId(payload, eventName) {
  const wsId = payload?._workspaceId;
  if (!wsId) {
    logger.warn(`${eventName}: missing _workspaceId, skipping event`);
    return null;
  }
  return wsId;
}

/**
 * Task Event Handler — handles FlowTask card/task lifecycle events.
 *
 * Events:
 *   task.created    — Post card-creation notification in project channel
 *   task.updated    — Post update notification, create/update thread if needed
 *   task.deleted    — Post deletion notification
 *   task.assigned   — Notify assignee, post in project channel
 *   task.commented  — Cross-post FlowTask comment to chat thread
 */

export function registerTaskEventHandlers() {
  // ─── task.created ──────────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.TASK_CREATED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.TASK_CREATED);
    if (!wsId) return;

    const { card, boardId, userId, departmentId, project } = payload;

    if (!card || !boardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', boardId, wsId);
    if (!channel) {
      logger.debug('task.created: no project channel', { boardId });
      return;
    }

    const creator = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const creatorName = creator?.name || 'Someone';

    const priority = card.priority ? ` [${card.priority}]` : '';
    const assignee = card.assignedTo
      ? await userRepository.findByFlowTaskId(
        typeof card.assignedTo === 'string' ? card.assignedTo : card.assignedTo._id, wsId,
      )
      : null;

    let msg = `${creatorName} created a new task: **${card.title}**${priority}`;
    if (assignee) {
      msg += ` → assigned to ${assignee.name}`;
    }
    if (card.dueDate) {
      msg += ` | Due: ${new Date(card.dueDate).toLocaleDateString()}`;
    }

    const activityMeta = {
      eventType: 'TASK_CREATED',
      taskId: card._id || null,
      projectId: boardId,
      departmentId: departmentId || null,
      projectName: project?.name || null,
      taskTitle: card.title || null,
      actorName: creatorName,
      priority: card.priority || null,
      category: card.category || null,
    };

    await messageService.sendSystemMessage(channel._id, msg, {
      entityType: 'card',
      entityId: card._id,
    }, wsId, [], activityMeta);
  });

  // ─── task.updated ──────────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.TASK_UPDATED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.TASK_UPDATED);
    if (!wsId) return;

    const { card, boardId, changes, userId, departmentId, project } = payload;

    if (!card || !boardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', boardId, wsId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const userName = user?.name || 'Someone';

    // Build change summary
    const parts = [];
    if (changes?.status) parts.push(`status → "${changes.status}"`);
    if (changes?.priority) parts.push(`priority → "${changes.priority}"`);
    if (changes?.dueDate) parts.push(`due date → ${new Date(changes.dueDate).toLocaleDateString()}`);
    if (changes?.title) parts.push(`title → "${changes.title}"`);
    if (changes?.listId) parts.push('moved to different list');

    if (parts.length === 0) return; // No meaningful changes to report

    const msg = `${userName} updated **${card.title}**: ${parts.join(', ')}`;

    const activityMeta = {
      eventType: 'TASK_UPDATED',
      taskId: card._id || null,
      projectId: boardId,
      departmentId: departmentId || null,
      projectName: project?.name || null,
      taskTitle: card.title || null,
      actorName: userName,
    };

    await messageService.sendSystemMessage(channel._id, msg, {
      entityType: 'card',
      entityId: card._id,
    }, wsId, [], activityMeta);
  });

  // ─── task.deleted ──────────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.TASK_DELETED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.TASK_DELETED);
    if (!wsId) return;

    const { cardId, cardTitle, boardId, userId, departmentId, project } = payload;

    if (!boardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', boardId, wsId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const title = cardTitle || cardId || 'a task';
    const userName = user?.name || 'Someone';

    const activityMeta = {
      eventType: 'TASK_DELETED',
      taskId: cardId || null,
      projectId: boardId,
      departmentId: departmentId || null,
      projectName: project?.name || null,
      taskTitle: title,
      actorName: userName,
    };

    await messageService.sendSystemMessage(
      channel._id,
      `${userName} deleted task: **${title}**`,
      undefined,
      wsId,
      [],
      activityMeta,
    );
  });

  // ─── task.assigned ─────────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.TASK_ASSIGNED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.TASK_ASSIGNED);
    if (!wsId) return;

    const { card, boardId, assigneeId, assignerId, departmentId, project } = payload;

    if (!card || !assigneeId) return;

    const [assignee, assigner, channel] = await Promise.all([
      userRepository.findByFlowTaskId(assigneeId, wsId),
      assignerId ? userRepository.findByFlowTaskId(assignerId, wsId) : null,
      boardId ? channelRepository.findByFlowTaskRef('board', boardId, wsId) : null,
    ]);

    if (!assignee) return;

    const assignerName = assigner?.name || 'Someone';

    // Post in project channel
    if (channel) {
      const activityMeta = {
        eventType: 'TASK_ASSIGNED',
        taskId: card._id || null,
        projectId: boardId || null,
        departmentId: departmentId || null,
        projectName: project?.name || null,
        taskTitle: card.title || null,
        actorName: assignerName,
        newValue: assignee.name,
      };

      await messageService.sendSystemMessage(
        channel._id,
        `${assignerName} assigned **${card.title}** to ${assignee.name}`,
        { entityType: 'card', entityId: card._id },
        wsId,
        [],
        activityMeta,
      );
    }
  });

  // ─── task.commented ────────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.TASK_COMMENTED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.TASK_COMMENTED);
    if (!wsId) return;

    const { comment, card, boardId, userId, departmentId, project } = payload;

    if (!comment || !card || !boardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', boardId, wsId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const userName = user?.name || 'Someone';
    const commentText = typeof comment === 'string'
      ? comment
      : comment.text || comment.content || '';

    if (!commentText) return;

    // Truncate long comments
    const preview = commentText.length > 200
      ? commentText.substring(0, 200) + '...'
      : commentText;

    const activityMeta = {
      eventType: 'TASK_COMMENTED',
      taskId: card._id || null,
      projectId: boardId,
      departmentId: departmentId || null,
      projectName: project?.name || null,
      taskTitle: card.title || null,
      actorName: userName,
    };

    await messageService.sendSystemMessage(
      channel._id,
      `${userName} commented on **${card.title}**: "${preview}"`,
      { entityType: 'card', entityId: card._id },
      wsId,
      [],
      activityMeta,
    );
  });

  // ─── task.status_changed ───────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.TASK_STATUS_CHANGED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.TASK_STATUS_CHANGED);
    if (!wsId) return;

    const { card, boardId, oldStatus, newStatus, userId, departmentId, project } = payload;

    if (!card || !boardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', boardId, wsId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const userName = user?.name || 'Someone';

    const from = oldStatus || 'unknown';
    const to = newStatus || 'unknown';

    const activityMeta = {
      eventType: 'TASK_STATUS_CHANGED',
      taskId: card._id || null,
      projectId: boardId,
      departmentId: departmentId || null,
      projectName: project?.name || null,
      taskTitle: card.title || null,
      actorName: userName,
      oldValue: from,
      newValue: to,
    };

    await messageService.sendSystemMessage(
      channel._id,
      `${userName} changed **${card.title}** status: ${from} → ${to}`,
      { entityType: 'card', entityId: card._id },
      wsId,
      [],
      activityMeta,
    );

    // Auto-resolve thread if task is completed
    if (['completed', 'done'].includes((newStatus || '').toLowerCase())) {
      try {
        const taskId = card._id || card.id;
        const thread = await threadRepository.findByTaskId(taskId, wsId);
        if (thread && !thread.isResolved) {
          await threadRepository.resolve(thread._id, null);
          logger.info('Auto-resolved thread for completed task', { threadId: thread._id, taskId });
        }
      } catch (err) {
        logger.warn('Failed to auto-resolve thread', { error: err.message });
      }
    }
  });

  // ─── task.due_date_changed ─────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.TASK_DUE_DATE_CHANGED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.TASK_DUE_DATE_CHANGED);
    if (!wsId) return;

    const { card, boardId, oldDueDate, newDueDate, userId, departmentId, project } = payload;

    if (!card || !boardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', boardId, wsId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const userName = user?.name || 'Someone';

    const oldDate = oldDueDate ? new Date(oldDueDate).toLocaleDateString() : 'none';
    const newDate = newDueDate ? new Date(newDueDate).toLocaleDateString() : 'removed';

    // Check if overdue
    const isOverdue = newDueDate && new Date(newDueDate) < new Date();
    const warning = isOverdue ? ' **OVERDUE**' : '';

    const activityMeta = {
      eventType: 'TASK_DUE_DATE_CHANGED',
      taskId: card._id || null,
      projectId: boardId,
      departmentId: departmentId || null,
      projectName: project?.name || null,
      taskTitle: card.title || null,
      actorName: userName,
      oldValue: oldDate,
      newValue: newDate,
    };

    await messageService.sendSystemMessage(
      channel._id,
      `${userName} changed due date for **${card.title}**: ${oldDate} → ${newDate}${warning}`,
      { entityType: 'card', entityId: card._id },
      wsId,
      [],
      activityMeta,
    );
  });

  // NOTE: TASK_COMMENT_ADDED removed — consolidated into TASK_COMMENTED above
  // to avoid duplicate messages from the same webhook event.

  // ─── time_entry_added ──────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.TIME_ENTRY_ADDED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.TIME_ENTRY_ADDED);
    if (!wsId) return;

    const { timeEntry, card, boardId, userId, departmentId, project } = payload;

    if (!timeEntry || !boardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', boardId, wsId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const userName = user?.name || 'Someone';

    // Format duration
    const minutes = timeEntry.duration || timeEntry.minutes || 0;
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    let durationStr = '';
    if (hours > 0) durationStr += `${hours}h`;
    if (remainingMins > 0) durationStr += ` ${remainingMins}m`;
    if (!durationStr) durationStr = `${minutes}m`;
    durationStr = durationStr.trim();

    const taskTitle = card?.title || timeEntry.cardTitle || 'a task';
    const description = timeEntry.description ? ` — "${timeEntry.description}"` : '';

    const activityMeta = {
      eventType: 'TIME_ENTRY_ADDED',
      taskId: card?._id || timeEntry.cardId || null,
      projectId: boardId,
      departmentId: departmentId || null,
      projectName: project?.name || null,
      taskTitle: taskTitle,
      actorName: userName,
      newValue: durationStr,
    };

    await messageService.sendSystemMessage(
      channel._id,
      `${userName} logged **${durationStr}** on **${taskTitle}**${description}`,
      { entityType: 'card', entityId: card?._id || timeEntry.cardId },
      wsId,
      [],
      activityMeta,
    );
  });

  logger.info('Task event handlers registered');
}
