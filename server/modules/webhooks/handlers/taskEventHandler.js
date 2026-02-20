import eventBus from '../../../services/eventBus.js';
import channelRepository from '../../channels/channel.repository.js';
import threadService from '../../threads/thread.service.js';
import threadRepository from '../../threads/thread.repository.js';
import messageService from '../../messages/message.service.js';
import userRepository from '../../users/user.repository.js';
import logger from '../../../utils/logger.js';
import { FLOWTASK_EVENTS } from '../../../config/constants.js';

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
    const { card, boardId, userId } = payload;

    if (!card || !boardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', boardId);
    if (!channel) {
      logger.debug('task.created: no project channel', { boardId });
      return;
    }

    const creator = userId ? await userRepository.findByFlowTaskId(userId) : null;
    const creatorName = creator?.name || 'Someone';

    const priority = card.priority ? ` [${card.priority}]` : '';
    const assignee = card.assignedTo
      ? await userRepository.findByFlowTaskId(
        typeof card.assignedTo === 'string' ? card.assignedTo : card.assignedTo._id,
      )
      : null;

    let msg = `📝 ${creatorName} created task: **${card.title}**${priority}`;
    if (assignee) {
      msg += ` → assigned to ${assignee.name}`;
    }
    if (card.dueDate) {
      msg += ` | Due: ${new Date(card.dueDate).toLocaleDateString()}`;
    }

    await messageService.sendSystemMessage(channel._id, msg, {
      entityType: 'task',
      entityId: card._id,
    });
  });

  // ─── task.updated ──────────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.TASK_UPDATED, async (payload) => {
    const { card, boardId, changes, userId } = payload;

    if (!card || !boardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', boardId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId) : null;
    const userName = user?.name || 'Someone';

    // Build change summary
    const parts = [];
    if (changes?.status) parts.push(`status → "${changes.status}"`);
    if (changes?.priority) parts.push(`priority → "${changes.priority}"`);
    if (changes?.dueDate) parts.push(`due date → ${new Date(changes.dueDate).toLocaleDateString()}`);
    if (changes?.title) parts.push(`title → "${changes.title}"`);
    if (changes?.listId) parts.push('moved to different list');

    if (parts.length === 0) return; // No meaningful changes to report

    const msg = `🔄 ${userName} updated **${card.title}**: ${parts.join(', ')}`;

    await messageService.sendSystemMessage(channel._id, msg, {
      entityType: 'task',
      entityId: card._id,
    });
  });

  // ─── task.deleted ──────────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.TASK_DELETED, async (payload) => {
    const { cardId, cardTitle, boardId, userId } = payload;

    if (!boardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', boardId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId) : null;
    const title = cardTitle || cardId || 'a task';

    await messageService.sendSystemMessage(
      channel._id,
      `🗑️ ${user?.name || 'Someone'} deleted task: **${title}**`,
    );
  });

  // ─── task.assigned ─────────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.TASK_ASSIGNED, async (payload) => {
    const { card, boardId, assigneeId, assignerId } = payload;

    if (!card || !assigneeId) return;

    const [assignee, assigner, channel] = await Promise.all([
      userRepository.findByFlowTaskId(assigneeId),
      assignerId ? userRepository.findByFlowTaskId(assignerId) : null,
      boardId ? channelRepository.findByFlowTaskRef('board', boardId) : null,
    ]);

    if (!assignee) return;

    // Post in project channel
    if (channel) {
      await messageService.sendSystemMessage(
        channel._id,
        `👤 ${assigner?.name || 'Someone'} assigned **${card.title}** to ${assignee.name}`,
        { entityType: 'task', entityId: card._id },
      );
    }
  });

  // ─── task.commented ────────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.TASK_COMMENTED, async (payload) => {
    const { comment, card, boardId, userId } = payload;

    if (!comment || !card || !boardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', boardId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId) : null;
    const commentText = typeof comment === 'string'
      ? comment
      : comment.text || comment.content || '';

    if (!commentText) return;

    // Truncate long comments
    const preview = commentText.length > 200
      ? commentText.substring(0, 200) + '...'
      : commentText;

    await messageService.sendSystemMessage(
      channel._id,
      `💬 ${user?.name || 'Someone'} commented on **${card.title}**: "${preview}"`,
      { entityType: 'task', entityId: card._id },
    );
  });

  // ─── task.status_changed ───────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.TASK_STATUS_CHANGED, async (payload) => {
    const { card, boardId, oldStatus, newStatus, userId } = payload;

    if (!card || !boardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', boardId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId) : null;
    const userName = user?.name || 'Someone';

    // Status emoji mapping
    const statusEmoji = {
      completed: '✅',
      done: '✅',
      'in-progress': '🔄',
      'in progress': '🔄',
      review: '👀',
      'in review': '👀',
      todo: '📋',
      blocked: '🚫',
    };

    const emoji = statusEmoji[(newStatus || '').toLowerCase()] || '🔄';
    const from = oldStatus || 'unknown';
    const to = newStatus || 'unknown';

    await messageService.sendSystemMessage(
      channel._id,
      `${emoji} ${userName} changed **${card.title}** status: ${from} → ${to}`,
      { entityType: 'task', entityId: card._id },
    );

    // Auto-resolve thread if task is completed
    if (['completed', 'done'].includes((newStatus || '').toLowerCase())) {
      try {
        const taskId = card._id || card.id;
        const thread = await threadRepository.findByTaskId(taskId);
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
    const { card, boardId, oldDueDate, newDueDate, userId } = payload;

    if (!card || !boardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', boardId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId) : null;
    const userName = user?.name || 'Someone';

    const oldDate = oldDueDate ? new Date(oldDueDate).toLocaleDateString() : 'none';
    const newDate = newDueDate ? new Date(newDueDate).toLocaleDateString() : 'removed';

    // Check if overdue
    const isOverdue = newDueDate && new Date(newDueDate) < new Date();
    const warning = isOverdue ? ' ⚠️ **OVERDUE**' : '';

    await messageService.sendSystemMessage(
      channel._id,
      `📅 ${userName} changed due date for **${card.title}**: ${oldDate} → ${newDate}${warning}`,
      { entityType: 'task', entityId: card._id },
    );
  });

  // ─── task.comment_added ────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.TASK_COMMENT_ADDED, async (payload) => {
    const { comment, card, boardId, userId } = payload;

    if (!comment || !card || !boardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', boardId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId) : null;
    const commentText = typeof comment === 'string'
      ? comment
      : comment.text || comment.content || '';

    if (!commentText) return;

    const preview = commentText.length > 300
      ? commentText.substring(0, 300) + '...'
      : commentText;

    await messageService.sendSystemMessage(
      channel._id,
      `💬 ${user?.name || 'Someone'} commented on **${card.title}**: "${preview}"`,
      { entityType: 'task', entityId: card._id },
    );
  });

  // ─── time_entry_added ──────────────────────────────────────────────────
  eventBus.register(FLOWTASK_EVENTS.TIME_ENTRY_ADDED, async (payload) => {
    const { timeEntry, card, boardId, userId } = payload;

    if (!timeEntry || !boardId) return;

    const channel = await channelRepository.findByFlowTaskRef('board', boardId);
    if (!channel) return;

    const user = userId ? await userRepository.findByFlowTaskId(userId) : null;
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

    await messageService.sendSystemMessage(
      channel._id,
      `⏱️ ${userName} logged **${durationStr}** on **${taskTitle}**${description}`,
      { entityType: 'task', entityId: card?._id || timeEntry.cardId },
    );
  });

  logger.info('Task event handlers registered');
}
