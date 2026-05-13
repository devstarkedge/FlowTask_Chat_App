import eventBus from '../../../services/eventBus.js';
import channelRepository from '../../channels/channel.repository.js';
import channelService from '../../channels/channel.service.js';
import threadService from '../../threads/thread.service.js';
import threadRepository from '../../threads/thread.repository.js';
import messageService from '../../messages/message.service.js';
import userRepository from '../../users/user.repository.js';
import logger from '../../../utils/logger.js';
import { FLOWTASK_EVENTS } from '../../../config/constants.js';

const TIME_ACTION_BY_EVENT = Object.freeze({
  [FLOWTASK_EVENTS.TIME_ENTRY_ADDED]: 'added',
  [FLOWTASK_EVENTS.TIME_ENTRY_UPDATED]: 'updated',
  [FLOWTASK_EVENTS.TIME_ENTRY_DELETED]: 'deleted',
});

function requireWorkspaceId(payload, eventName) {
  const wsId = payload?._workspaceId || payload?.workspaceId || payload?.data?.workspaceId;
  if (!wsId) {
    logger.warn(`${eventName}: missing workspace id (no _workspaceId/workspaceId), skipping event`);
    return null;
  }
  return wsId;
}

function resolveActorName(payload, chatUser) {
  if (chatUser && chatUser.name) return chatUser.name;
  const candidate = (
    payload?.userName ||
    payload?.createdByName ||
    payload?.createdBy?.name ||
    payload?.actor?.name ||
    payload?.user?.name ||
    payload?.user?.displayName ||
    payload?.card?.createdByName ||
    payload?.card?.createdBy?.name ||
    payload?.comment?.authorName ||
    payload?.createdBy ||
    null
  );
  return candidate || 'Someone';
}

function normalizeEntityId(value) {
  if (!value) return null;
  // If it's an object (e.g., populated board doc or ObjectId), prefer _id or id
  if (typeof value === 'object') {
    if (value._id) return value._id.toString();
    if (value.id) return value.id.toString();
    try {
      const s = value.toString();
      if (s && s !== '[object Object]') return s;
    } catch (err) {
      return null;
    }
    return null;
  }

  // If it's a string, try to extract a 24-hex ObjectId if present (handles logged object literals)
  if (typeof value === 'string') {
    const idMatch = value.match(/[0-9a-fA-F]{24}/);
    if (idMatch) return idMatch[0];
    return value;
  }

  try { return String(value); } catch { return null; }
}

/**
 * Auto-add FlowTask assignees to the project chat channel.
 * Additive only — never removes users. Called on task/subtask/nano events.
 */
async function autoAddAssigneesToChannel(channel, assigneeIds, wsId) {
  if (!channel || !assigneeIds || assigneeIds.length === 0) return;

  const uniqueIds = [...new Set(
    assigneeIds
      .map((id) => {
        if (!id) return null;
        if (typeof id === 'string') return id;
        return (id._id || id.id || id.userId)?.toString() || null;
      })
      .filter(Boolean),
  )];

  if (uniqueIds.length === 0) return;

  try {
    await channelService.syncMembers(channel._id, uniqueIds, wsId);
    logger.info('Auto-added assignees to project channel', {
      channelId: channel._id,
      assigneeCount: uniqueIds.length,
    });
  } catch (err) {
    logger.warn('Failed to auto-add assignees to channel', {
      channelId: channel._id,
      error: err.message,
    });
  }
}

function toInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveTimeEntryState(timeEntry) {
  return timeEntry?.current || timeEntry?.previous || timeEntry || null;
}

function resolveTimeEntryNote(entry) {
  return entry?.note || entry?.description || entry?.reason || null;
}

function resolveTimeEntryMinutes(entry) {
  if (!entry) return 0;
  if (entry.totalMinutes !== undefined && entry.totalMinutes !== null) return toInteger(entry.totalMinutes);
  if (entry.duration !== undefined && entry.duration !== null) return toInteger(entry.duration);
  return (toInteger(entry.hours) * 60) + toInteger(entry.minutes);
}

function formatTimeEntryDuration(entry) {
  const totalMinutes = resolveTimeEntryMinutes(entry);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function resolveTimeEntryType(payload) {
  const directType = payload?.entryType || payload?.timeEntry?.type;
  if (directType === 'logged' || directType === 'estimation') {
    return directType;
  }

  const activeEntry = resolveTimeEntryState(payload?.timeEntry);
  if (activeEntry?.reason && !activeEntry?.description) {
    return 'estimation';
  }
  if (activeEntry?.description && !activeEntry?.reason) {
    return 'logged';
  }

  return null;
}

function resolveTimeActionType(eventName, payload) {
  const operation = payload?.operation;

  if (operation === 'add' || operation === 'added' || operation === 'create' || operation === 'created') {
    return 'added';
  }

  if (operation === 'update' || operation === 'updated') {
    return 'updated';
  }

  if (operation === 'delete' || operation === 'deleted' || operation === 'remove' || operation === 'removed') {
    return 'deleted';
  }

  return TIME_ACTION_BY_EVENT[eventName] || 'added';
}

function resolveTimeTotals(payload, entryType) {
  const loggedTotalMinutes = payload?.timeTotals?.logged?.totalMinutes;
  const estimationTotalMinutes = payload?.timeTotals?.estimation?.totalMinutes;
  const billedTotalMinutes = payload?.timeTotals?.billed?.totalMinutes;
  const affectedSource = payload?.timeTotals?.affectedType === entryType
    ? payload?.timeTotals?.affectedTotal
    : entryType === 'estimation'
      ? payload?.timeTotals?.estimation
      : entryType === 'logged'
        ? payload?.timeTotals?.logged
        : entryType === 'billed'
          ? payload?.timeTotals?.billed
          : null;
  const totalMinutes = affectedSource?.totalMinutes;

  return {
    totalMinutes: totalMinutes !== undefined && totalMinutes !== null ? toInteger(totalMinutes) : null,
    loggedTotalMinutes: loggedTotalMinutes !== undefined && loggedTotalMinutes !== null ? toInteger(loggedTotalMinutes) : null,
    estimationTotalMinutes: estimationTotalMinutes !== undefined && estimationTotalMinutes !== null ? toInteger(estimationTotalMinutes) : null,
    billedTotalMinutes: billedTotalMinutes !== undefined && billedTotalMinutes !== null ? toInteger(billedTotalMinutes) : null,
  };
}

function formatMinutesAsDuration(totalMinutes) {
  if (totalMinutes === undefined || totalMinutes === null) {
    return null;
  }

  return formatTimeEntryDuration({ totalMinutes });
}

function resolveTimeEntityContext(payload) {
  const entityType = payload.entityType || payload.entity?.type || (payload.nano ? 'nano' : payload.subtask ? 'subtask' : 'task');
  const taskTitle = payload.card?.title || payload.task?.title || 'a task';
  const subtaskTitle = payload.subtask?.title || null;
  const nanoTitle = payload.nano?.title || null;

  if (entityType === 'nano') {
    const nanoTarget = nanoTitle ? `checklist item **${nanoTitle}**` : 'a checklist item';
    return {
      entityType,
      entityName: payload.entity?.title || nanoTitle || taskTitle || null,
      taskTitle,
      subtaskTitle,
      nanoTitle,
      targetText: taskTitle ? `${nanoTarget} in **${taskTitle}**` : nanoTarget,
    };
  }

  if (entityType === 'subtask') {
    const subtaskTarget = subtaskTitle ? `subtask **${subtaskTitle}**` : 'a subtask';
    return {
      entityType,
      entityName: payload.entity?.title || subtaskTitle || taskTitle || null,
      taskTitle,
      subtaskTitle,
      nanoTitle,
      targetText: taskTitle ? `${subtaskTarget} in **${taskTitle}**` : subtaskTarget,
    };
  }

  return {
    entityType,
    entityName: payload.entity?.title || taskTitle || null,
    taskTitle,
    subtaskTitle,
    nanoTitle,
    targetText: taskTitle ? `**${taskTitle}**` : 'a task',
  };
}

function buildTimeEntryActivityMeta({
  eventName,
  payload,
  userName,
  normalizedBoardId,
  departmentId,
  project,
  taskId,
  entryType,
  entityContext,
  oldValue,
  newValue,
  channelId = null,
}) {
  const previousEntry = payload?.timeEntry?.previous || null;
  const currentEntry = payload?.timeEntry?.current || null;
  const fallbackEntry = resolveTimeEntryState(payload?.timeEntry);
  const actionType = resolveTimeActionType(eventName, payload);
  const totals = resolveTimeTotals(payload, entryType);
  const actorAvatar = payload?.actor?.avatar || null;

  return {
    eventType: eventName,
    actionType,
    taskId,
    channelId,
    projectId: normalizedBoardId,
    departmentId: departmentId || project?.departmentId || null,
    projectName: project?.name || null,
    taskTitle: entityContext.taskTitle || null,
    parentTaskTitle: entityContext.taskTitle || null,
    subtaskTitle: entityContext.subtaskTitle || null,
    nanoTitle: entityContext.nanoTitle || null,
    actorName: userName,
    actorAvatar,
    entryType,
    entityType: entityContext.entityType,
    entityName: entityContext.entityName || null,
    entryNote: resolveTimeEntryNote(currentEntry || previousEntry || fallbackEntry),
    oldValue,
    newValue,
    currentMinutes: currentEntry
      ? resolveTimeEntryMinutes(currentEntry)
      : (actionType === 'added' && fallbackEntry ? resolveTimeEntryMinutes(fallbackEntry) : null),
    previousMinutes: previousEntry
      ? resolveTimeEntryMinutes(previousEntry)
      : (actionType === 'deleted' && fallbackEntry ? resolveTimeEntryMinutes(fallbackEntry) : null),
    totalMinutes: totals.totalMinutes,
    loggedTotalMinutes: totals.loggedTotalMinutes,
    estimationTotalMinutes: totals.estimationTotalMinutes,
    billedTotalMinutes: totals.billedTotalMinutes,
  };
}

function resolveEntryLabel(entryType) {
  if (entryType === 'estimation') return 'estimated time';
  if (entryType === 'billed') return 'billed time';
  return 'logged time';
}

function isUpdateEvent(eventName) {
  return eventName === FLOWTASK_EVENTS.TIME_ENTRY_UPDATED
    || eventName === FLOWTASK_EVENTS.LOGGED_TIME_UPDATED
    || eventName === FLOWTASK_EVENTS.ESTIMATED_TIME_UPDATED
    || eventName === FLOWTASK_EVENTS.BILLED_TIME_UPDATED;
}

function isDeleteEvent(eventName) {
  return eventName === FLOWTASK_EVENTS.TIME_ENTRY_DELETED
    || eventName === FLOWTASK_EVENTS.LOGGED_TIME_DELETED
    || eventName === FLOWTASK_EVENTS.ESTIMATED_TIME_DELETED
    || eventName === FLOWTASK_EVENTS.BILLED_TIME_DELETED;
}

function buildTimeEntryMessage(eventName, payload, userName, previousValue, currentValue, entryType, totalValue) {
  const { targetText } = resolveTimeEntityContext(payload);
  const entryLabel = resolveEntryLabel(entryType);
  const activeEntry = resolveTimeEntryState(payload.timeEntry);
  const note = activeEntry?.note ? ` — "${activeEntry.note}"` : '';
  const totalSuffix = totalValue ? `. Total ${entryLabel}: **${totalValue}**` : '';

  if (isUpdateEvent(eventName)) {
    return `${userName} updated ${entryLabel} on ${targetText}: ${previousValue || '0m'} → ${currentValue || '0m'}${note}${totalSuffix}`;
  }

  if (isDeleteEvent(eventName)) {
    return `${userName} removed ${entryLabel} (${previousValue || currentValue || '0m'}) from ${targetText}${note}${totalSuffix}`;
  }

  if (entryType === 'estimation') {
    return `${userName} added estimated time **${currentValue || '0m'}** on ${targetText}${note}${totalSuffix}`;
  }

  if (entryType === 'billed') {
    return `${userName} added billed time **${currentValue || '0m'}** on ${targetText}${note}${totalSuffix}`;
  }

  return `${userName} logged **${currentValue || '0m'}** on ${targetText}${note}${totalSuffix}`;
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
    const normalizedBoardId = normalizeEntityId(boardId || payload.board || payload.project?.id || payload.boardId);

    if (!card || !normalizedBoardId) {
      logger.warn('task.created: missing card or boardId, skipping', { deliveryId: payload.deliveryId, boardId });
      return;
    }

    const channel = await channelRepository.findByFlowTaskRef('board', normalizedBoardId, wsId);
    if (!channel) {
      logger.debug('task.created: no project channel', { boardId: normalizedBoardId });
      return;
    }

    // Auto-add task assignees to project channel
    const taskAssignees = card.assignees || (card.assignedTo ? [card.assignedTo] : []);
    await autoAddAssigneesToChannel(channel, taskAssignees, wsId);

    const creator = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const creatorName = resolveActorName(payload, creator);

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
      projectId: normalizedBoardId,
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
    const normalizedBoardId = normalizeEntityId(boardId || payload.board || payload.project?.id || payload.boardId);

    if (!card || !normalizedBoardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', normalizedBoardId, wsId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const userName = resolveActorName(payload, user);

    // Build change summary from field-level diffs
    const parts = [];
    const changedFields = {};

    if (changes?.status) {
      const s = typeof changes.status === 'object' ? changes.status : { old: null, new: changes.status };
      parts.push(`status: ${s.old || '?'} → ${s.new}`);
      changedFields.status = s;
    }
    if (changes?.priority) {
      const p = typeof changes.priority === 'object' ? changes.priority : { old: null, new: changes.priority };
      parts.push(`priority: ${p.old || '?'} → ${p.new}`);
      changedFields.priority = p;
    }
    if (changes?.title) {
      const t = typeof changes.title === 'object' ? changes.title : { old: null, new: changes.title };
      parts.push(`title: "${t.old || '?'}" → "${t.new}"`);
      changedFields.title = t;
    }
    if (changes?.dueDate) {
      const d = typeof changes.dueDate === 'object' ? changes.dueDate : { old: null, new: changes.dueDate };
      parts.push(`due date: ${d.old || 'None'} → ${d.new || 'Removed'}`);
      changedFields.dueDate = d;
    }
    if (changes?.startDate) {
      const sd = typeof changes.startDate === 'object' ? changes.startDate : { old: null, new: changes.startDate };
      parts.push(`start date: ${sd.old || 'None'} → ${sd.new || 'Removed'}`);
      changedFields.startDate = sd;
    }
    if (changes?.description) {
      parts.push('description updated');
      changedFields.description = { old: 'Updated', new: 'Updated' };
    }
    if (changes?.labels) {
      parts.push('labels updated');
      changedFields.labels = typeof changes.labels === 'object' ? changes.labels : { old: [], new: [] };
    }
    if (changes?.listId) {
      parts.push('moved to different list');
      changedFields.listId = typeof changes.listId === 'object' ? changes.listId : { old: null, new: changes.listId };
    }

    if (parts.length === 0) return; // No meaningful changes to report

    const msg = `${userName} updated **${card.title}**: ${parts.join(', ')}`;

    const activityMeta = {
      eventType: 'TASK_UPDATED',
      taskId: card._id || null,
      projectId: normalizedBoardId,
      departmentId: departmentId || null,
      projectName: project?.name || null,
      taskTitle: card.title || null,
      actorName: userName,
      changedFields: Object.keys(changedFields).length > 0 ? changedFields : null,
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
    const normalizedBoardId = normalizeEntityId(boardId || payload.board || payload.project?.id || payload.boardId);

    if (!normalizedBoardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', normalizedBoardId, wsId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const title = cardTitle || cardId || 'a task';
    const userName = resolveActorName(payload, user);

    const activityMeta = {
      eventType: 'TASK_DELETED',
      taskId: cardId || null,
      projectId: normalizedBoardId,
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
    const normalizedBoardId = normalizeEntityId(boardId || payload.board || payload.project?.id || payload.boardId);

    if (!card || !assigneeId) return;

    const [assignee, assigner, channel] = await Promise.all([
      userRepository.findByFlowTaskId(assigneeId, wsId),
      assignerId ? userRepository.findByFlowTaskId(assignerId, wsId) : null,
      normalizedBoardId ? channelRepository.findByFlowTaskRef('board', normalizedBoardId, wsId) : null,
    ]);

    if (!assignee) return;

    const assignerName = resolveActorName(payload, assigner);

    // Auto-add all assignees to project channel
    if (channel) {
      const allAssigneeIds = (payload.assignees || [])
        .map((a) => a.userId || a._id || a.id || (typeof a === 'string' ? a : null))
        .filter(Boolean);
      if (assigneeId && !allAssigneeIds.includes(assigneeId)) {
        allAssigneeIds.push(assigneeId);
      }
      await autoAddAssigneesToChannel(channel, allAssigneeIds, wsId);
    }

    // Post in project channel
    if (channel) {
      const activityMeta = {
        eventType: 'TASK_ASSIGNED',
        taskId: card._id || null,
        projectId: normalizedBoardId || boardId || null,
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

  // ─── task.unassigned ──────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.TASK_UNASSIGNED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.TASK_UNASSIGNED);
    if (!wsId) return;

    const { boardId, removedUserIds, activeTaskFlags, userId, card, project, departmentId } = payload;
    const normalizedBoardId = normalizeEntityId(boardId || payload.board || payload.project?.id);

    if (!normalizedBoardId || !removedUserIds || removedUserIds.length === 0) return;

    const channel = await channelRepository.findByFlowTaskRef('board', normalizedBoardId, wsId);
    if (!channel) return;

    const actor = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const actorName = resolveActorName(payload, actor);
    const taskTitle = card?.title || payload.task?.title || 'a task';

    for (const removedId of removedUserIds) {
      const chatUser = await userRepository.findByFlowTaskId(removedId, wsId);
      if (!chatUser) continue;

      const stillHasTasks = activeTaskFlags?.[removedId];

      if (stillHasTasks) {
        // User has other assignments in the project — keep in channel, just notify
        logger.info('task.unassigned: user has other active tasks, keeping in channel', {
          removedId,
          boardId: normalizedBoardId,
          channelId: channel._id,
        });
      } else {
        // User has NO other involvement — remove from channel
        try {
          await channelService.removeMember(channel._id, chatUser._id, 'system');
          logger.info('task.unassigned: removed user from project channel', {
            removedId,
            chatUserId: chatUser._id,
            channelId: channel._id,
          });
        } catch (err) {
          logger.warn('task.unassigned: failed to remove user from channel', {
            removedId,
            error: err.message,
          });
        }

        await messageService.sendSystemMessage(
          channel._id,
          `👤 ${actorName} removed ${chatUser.name} from **${taskTitle}** — no remaining project assignments`,
          { entityType: 'card', entityId: card?._id || payload.task?.id },
          wsId,
        );
      }
    }
  });

  // ─── task.commented ────────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.TASK_COMMENTED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.TASK_COMMENTED);
    if (!wsId) return;
    const { comment, card, boardId, userId, departmentId, project } = payload;
    const normalizedBoardId = normalizeEntityId(boardId || payload.board || payload.project?.id || payload.boardId);

    if (!comment || !card || !normalizedBoardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', normalizedBoardId, wsId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const userName = resolveActorName(payload, user);
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
      projectId: normalizedBoardId,
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
    const normalizedBoardId = normalizeEntityId(boardId || payload.board || payload.project?.id || payload.boardId);

    if (!card || !normalizedBoardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', normalizedBoardId, wsId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const userName = resolveActorName(payload, user);

    const from = oldStatus || 'unknown';
    const to = newStatus || 'unknown';

    const activityMeta = {
      eventType: 'TASK_STATUS_CHANGED',
      taskId: card._id || null,
      projectId: normalizedBoardId,
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
    const normalizedBoardId = normalizeEntityId(boardId || payload.board || payload.project?.id || payload.boardId);

    if (!card || !normalizedBoardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', normalizedBoardId, wsId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const userName = resolveActorName(payload, user);

    const oldDate = oldDueDate ? new Date(oldDueDate).toLocaleDateString() : 'none';
    const newDate = newDueDate ? new Date(newDueDate).toLocaleDateString() : 'removed';

    // Check if overdue
    const isOverdue = newDueDate && new Date(newDueDate) < new Date();
    const warning = isOverdue ? ' **OVERDUE**' : '';

    const activityMeta = {
      eventType: 'TASK_DUE_DATE_CHANGED',
      taskId: card._id || null,
      projectId: normalizedBoardId,
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

  const registerTimeEntryHandler = (eventName) => {
    eventBus.register(eventName, async (payload) => {
      const wsId = requireWorkspaceId(payload, eventName);
      if (!wsId) return;

      const { timeEntry, card, boardId, userId, departmentId, project } = payload;
      const normalizedBoardId = normalizeEntityId(boardId || payload.board || payload.project?.id || payload.boardId);

      if (!timeEntry || !normalizedBoardId) return;

      const entryType = resolveTimeEntryType(payload);
      if (!entryType) {
        logger.warn(`${eventName}: missing or invalid entryType for time event, skipping`, {
          deliveryId: payload.deliveryId,
          boardId: normalizedBoardId,
        });
        return;
      }

      const channel = await channelRepository.findByFlowTaskRef('board', normalizedBoardId, wsId);
      if (!channel) return;

      const user = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
      const userName = resolveActorName(payload, user);
      const previousEntry = timeEntry.previous || null;
      const currentEntry = timeEntry.current || null;
      const fallbackEntry = resolveTimeEntryState(timeEntry);
      const oldValue = previousEntry
        ? formatTimeEntryDuration(previousEntry)
        : (eventName === FLOWTASK_EVENTS.TIME_ENTRY_DELETED && fallbackEntry ? formatTimeEntryDuration(fallbackEntry) : null);
      const newValue = currentEntry
        ? formatTimeEntryDuration(currentEntry)
        : (eventName === FLOWTASK_EVENTS.TIME_ENTRY_ADDED && fallbackEntry ? formatTimeEntryDuration(fallbackEntry) : null);
      const entityContext = resolveTimeEntityContext(payload);
      const taskId = card?._id || payload.task?.id || payload.task?._id || null;
      const activityMeta = buildTimeEntryActivityMeta({
        eventName,
        payload,
        userName,
        normalizedBoardId,
        departmentId,
        project,
        taskId,
        entryType,
        entityContext,
        oldValue,
        newValue,
      });
      const totalValue = formatMinutesAsDuration(activityMeta.totalMinutes);

      await messageService.sendSystemMessage(
        channel._id,
        buildTimeEntryMessage(eventName, payload, userName, oldValue, newValue, entryType, totalValue),
        { entityType: 'card', entityId: taskId },
        wsId,
        [],
        activityMeta,
      );
    });
  };

  // Type-specific time entry events only — legacy TIME_ENTRY_* events are no longer
  // dispatched by FlowTask (removed dual-dispatch), so those handlers are omitted.
  registerTimeEntryHandler(FLOWTASK_EVENTS.LOGGED_TIME_ADDED);
  registerTimeEntryHandler(FLOWTASK_EVENTS.LOGGED_TIME_UPDATED);
  registerTimeEntryHandler(FLOWTASK_EVENTS.LOGGED_TIME_DELETED);
  registerTimeEntryHandler(FLOWTASK_EVENTS.ESTIMATED_TIME_ADDED);
  registerTimeEntryHandler(FLOWTASK_EVENTS.ESTIMATED_TIME_UPDATED);
  registerTimeEntryHandler(FLOWTASK_EVENTS.ESTIMATED_TIME_DELETED);
  registerTimeEntryHandler(FLOWTASK_EVENTS.BILLED_TIME_ADDED);
  registerTimeEntryHandler(FLOWTASK_EVENTS.BILLED_TIME_UPDATED);
  registerTimeEntryHandler(FLOWTASK_EVENTS.BILLED_TIME_DELETED);

  // ─── subtask.created ───────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.SUBTASK_CREATED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.SUBTASK_CREATED);
    if (!wsId) return;

    const { subtask, card, boardId, userId, departmentId, project, deliveryId } = payload;
    const normalizedBoardId = normalizeEntityId(boardId || payload.board || payload.project?.id || payload.boardId);
    if (!subtask || !normalizedBoardId) {
      logger.warn('SUBTASK_CREATED: missing subtask or boardId, skipping', { deliveryId, boardId, keys: Object.keys(payload || {}) });
      return;
    }

    const channel = await channelRepository.findByFlowTaskRef('board', normalizedBoardId, wsId);
    if (!channel) {
      logger.warn('SUBTASK_CREATED: no project channel found for board', { deliveryId: payload.deliveryId, boardId: normalizedBoardId, workspaceId: wsId });
      return;
    }

    // Auto-add subtask assignees to project channel
    const subtaskAssignees = subtask.assignees || [];
    await autoAddAssigneesToChannel(channel, subtaskAssignees, wsId);

    const user = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const userName = resolveActorName(payload, user);
    const taskTitle = card?.title || payload.task?.title || 'a task';

    const activityMeta = {
      eventType: 'SUBTASK_CREATED',
      taskId: card?._id || payload.task?.id || null,
      projectId: normalizedBoardId,
      departmentId: departmentId || project?.departmentId || null,
      projectName: project?.name || null,
      taskTitle,
      subtaskTitle: subtask.title || null,
      parentTaskTitle: taskTitle,
      actorName: userName,
    };

    logger.info('SUBTASK_CREATED: sending system message', { deliveryId: payload.deliveryId, channelId: channel._id?.toString(), boardId, workspaceId: wsId, activityMeta });

    await messageService.sendSystemMessage(
      channel._id,
      `${userName} created subtask **${subtask.title}** on **${taskTitle}**`,
      { entityType: 'card', entityId: card?._id || payload.task?.id },
      wsId,
      [],
      activityMeta,
    );
  });

  // ─── subtask.completed ─────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.SUBTASK_COMPLETED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.SUBTASK_COMPLETED);
    if (!wsId) return;

    const { subtask, card, boardId, userId, departmentId, project } = payload;
    const normalizedBoardId = normalizeEntityId(boardId || payload.board || payload.project?.id || payload.boardId);
    if (!subtask || !normalizedBoardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', normalizedBoardId, wsId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const userName = resolveActorName(payload, user);
    const taskTitle = card?.title || payload.task?.title || 'a task';

    const activityMeta = {
      eventType: 'SUBTASK_COMPLETED',
      taskId: card?._id || payload.task?.id || null,
      projectId: normalizedBoardId,
      departmentId: departmentId || null,
      projectName: project?.name || null,
      taskTitle,
      subtaskTitle: subtask.title || null,
      parentTaskTitle: taskTitle,
      actorName: userName,
    };

    await messageService.sendSystemMessage(
      channel._id,
      `${userName} completed subtask **${subtask.title}** on **${taskTitle}**`,
      { entityType: 'card', entityId: card?._id || payload.task?.id },
      wsId,
      [],
      activityMeta,
    );
  });

  // ─── subtask.deleted ───────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.SUBTASK_DELETED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.SUBTASK_DELETED);
    if (!wsId) return;

    const { subtask, card, boardId, userId, departmentId, project } = payload;
    const normalizedBoardId = normalizeEntityId(boardId || payload.board || payload.project?.id || payload.boardId);
    if (!subtask || !normalizedBoardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', normalizedBoardId, wsId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const userName = resolveActorName(payload, user);
    const taskTitle = card?.title || payload.task?.title || 'a task';

    const activityMeta = {
      eventType: 'SUBTASK_DELETED',
      taskId: card?._id || payload.task?.id || null,
      projectId: normalizedBoardId,
      departmentId: departmentId || null,
      projectName: project?.name || null,
      taskTitle,
      subtaskTitle: subtask.title || null,
      parentTaskTitle: taskTitle,
      actorName: userName,
    };

    await messageService.sendSystemMessage(
      channel._id,
      `${userName} deleted subtask **${subtask.title}** from **${taskTitle}**`,
      undefined,
      wsId,
      [],
      activityMeta,
    );
  });

  // ─── subtask.updated ─────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.SUBTASK_UPDATED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.SUBTASK_UPDATED);
    if (!wsId) return;

    const { subtask, card, boardId, userId, departmentId, project, deliveryId } = payload;
    const normalizedBoardId = normalizeEntityId(boardId || payload.board || payload.project?.id || payload.boardId);
    if (!subtask || !normalizedBoardId) {
      logger.warn('SUBTASK_UPDATED: missing subtask or boardId, skipping', { deliveryId, boardId, keys: Object.keys(payload || {}) });
      return;
    }

    const channel = await channelRepository.findByFlowTaskRef('board', normalizedBoardId, wsId);
    if (!channel) {
      logger.warn('SUBTASK_UPDATED: no project channel found for board', { deliveryId: payload.deliveryId, boardId: normalizedBoardId, workspaceId: wsId });
      return;
    }

    // Auto-add subtask assignees to project channel (handles new assignee additions)
    const subtaskAssignees = subtask.assignees || [];
    await autoAddAssigneesToChannel(channel, subtaskAssignees, wsId);

    const user = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const userName = resolveActorName(payload, user);
    const taskTitle = card?.title || payload.task?.title || 'a task';

    const activityMeta = {
      eventType: 'SUBTASK_UPDATED',
      taskId: card?._id || payload.task?.id || null,
      projectId: normalizedBoardId,
      departmentId: departmentId || project?.departmentId || null,
      projectName: project?.name || null,
      taskTitle,
      subtaskTitle: subtask.title || null,
      parentTaskTitle: taskTitle,
      actorName: userName,
    };

    logger.info('SUBTASK_UPDATED: sending system message', { deliveryId: payload.deliveryId, channelId: channel._id?.toString(), boardId: normalizedBoardId, workspaceId: wsId, activityMeta });

    await messageService.sendSystemMessage(
      channel._id,
      `${userName} updated subtask **${subtask.title}** on **${taskTitle}**`,
      { entityType: 'card', entityId: card?._id || payload.task?.id },
      wsId,
      [],
      activityMeta,
    );
  });

  // ─── nano.created ─────────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.NANO_CREATED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.NANO_CREATED);
    if (!wsId) return;

    const { nano, subtask, card, boardId, userId, departmentId, project } = payload;
    const normalizedBoardId = normalizeEntityId(boardId || payload.board || payload.project?.id || payload.boardId);
    if (!nano || !normalizedBoardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', normalizedBoardId, wsId);
    if (!channel) return;

    // Auto-add nano assignees to project channel
    const nanoAssignees = nano.assignees || [];
    await autoAddAssigneesToChannel(channel, nanoAssignees, wsId);

    const user = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const userName = user?.name || 'Someone';
    const taskTitle = card?.title || payload.task?.title || 'a task';

    const activityMeta = {
      eventType: 'NANO_CREATED',
      taskId: card?._id || payload.task?.id || null,
      projectId: normalizedBoardId,
      departmentId: departmentId || project?.departmentId || null,
      projectName: project?.name || null,
      taskTitle,
      subtaskTitle: subtask?.title || null,
      parentTaskTitle: taskTitle,
      nanoTitle: nano.title || null,
      actorName: userName,
    };

    await messageService.sendSystemMessage(
      channel._id,
      `${userName} created nano **${nano.title}** on subtask **${subtask?.title || '?'}** in **${taskTitle}**`,
      { entityType: 'card', entityId: card?._id || payload.task?.id },
      wsId,
      [],
      activityMeta,
    );
  });

  // ─── nano.completed ───────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.NANO_COMPLETED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.NANO_COMPLETED);
    if (!wsId) return;

    const { nano, subtask, card, boardId, userId, departmentId, project } = payload;
    const normalizedBoardId = normalizeEntityId(boardId || payload.board || payload.project?.id || payload.boardId);
    if (!nano || !normalizedBoardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', normalizedBoardId, wsId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const userName = user?.name || 'Someone';
    const taskTitle = card?.title || payload.task?.title || 'a task';

    const activityMeta = {
      eventType: 'NANO_COMPLETED',
      taskId: card?._id || payload.task?.id || null,
      projectId: normalizedBoardId,
      departmentId: departmentId || null,
      projectName: project?.name || null,
      taskTitle,
      subtaskTitle: subtask?.title || null,
      parentTaskTitle: taskTitle,
      nanoTitle: nano.title || null,
      actorName: userName,
    };

    await messageService.sendSystemMessage(
      channel._id,
      `${userName} completed nano **${nano.title}** on **${taskTitle}**`,
      { entityType: 'card', entityId: card?._id || payload.task?.id },
      wsId,
      [],
      activityMeta,
    );
  });

  // ─── nano.deleted ─────────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.NANO_DELETED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.NANO_DELETED);
    if (!wsId) return;

    const { nano, subtask, card, boardId, userId, departmentId, project } = payload;
    const normalizedBoardId = normalizeEntityId(boardId || payload.board || payload.project?.id || payload.boardId);
    if (!nano || !normalizedBoardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', normalizedBoardId, wsId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const userName = user?.name || 'Someone';
    const taskTitle = card?.title || payload.task?.title || 'a task';

    const activityMeta = {
      eventType: 'NANO_DELETED',
      taskId: card?._id || payload.task?.id || null,
      projectId: normalizedBoardId,
      departmentId: departmentId || null,
      projectName: project?.name || null,
      taskTitle,
      subtaskTitle: subtask?.title || null,
      parentTaskTitle: taskTitle,
      nanoTitle: nano.title || null,
      actorName: userName,
    };

    await messageService.sendSystemMessage(
      channel._id,
      `${userName} deleted nano **${nano.title}** from **${taskTitle}**`,
      undefined,
      wsId,
      [],
      activityMeta,
    );
  });

  // ─── attachment.added ──────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.ATTACHMENT_ADDED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.ATTACHMENT_ADDED);
    if (!wsId) return;

    const { attachment, card, boardId, userId, departmentId, project, deliveryId } = payload;
    const normalizedBoardId = normalizeEntityId(boardId || payload.board || payload.project?.id || payload.boardId);
    if (!attachment || !normalizedBoardId) {
      logger.warn('ATTACHMENT_ADDED: missing attachment or boardId, skipping', { deliveryId, boardId, keys: Object.keys(payload || {}) });
      return;
    }

    const channel = await channelRepository.findByFlowTaskRef('board', normalizedBoardId, wsId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId, wsId) : null;
    const userName = user?.name || 'Someone';
    const taskTitle = card?.title || payload.task?.title || 'a task';
    const fileName = attachment.fileName || attachment.originalName || 'a file';

    const activityMeta = {
      eventType: 'ATTACHMENT_ADDED',
      taskId: card?._id || payload.task?.id || null,
      projectId: normalizedBoardId,
      departmentId: departmentId || project?.departmentId || null,
      projectName: project?.name || null,
      taskTitle,
      fileName,
      actorName: userName,
    };

    // Log which IDs are present so client deep-link issues can be diagnosed
    logger.info('ATTACHMENT_ADDED: activityMeta built', { deliveryId: payload.deliveryId, channelId: channel._id?.toString(), taskId: activityMeta.taskId, projectId: activityMeta.projectId, departmentId: activityMeta.departmentId });

    await messageService.sendSystemMessage(
      channel._id,
      `${userName} attached **${fileName}** to **${taskTitle}**`,
      { entityType: 'card', entityId: card?._id || payload.task?.id },
      wsId,
      [],
      activityMeta,
    );
  });

  logger.info('Task event handlers registered');
}
