import cron from 'node-cron';
import flowTaskService from '../flowtask/flowtask.service.js';
import messageService from '../messages/message.service.js';
import channelRepository from '../channels/channel.repository.js';
import userRepository from '../users/user.repository.js';
import { emitToUser } from '../../sockets/socketManager.js';
import { shouldDeliverNotification } from '../notifications/dnd.gateway.js';
import logger from '../../utils/logger.js';
import { SOCKET_EVENTS, BOT } from '../../config/constants.js';

/**
 * Deadline Warning Cron — scans FlowTask for tasks nearing deadlines
 * and posts warnings in the appropriate project channels.
 *
 * Runs daily at 9:00 AM (configurable).
 * Warns for tasks due within 24 hours.
 */

let cronJob = null;

export function startDeadlineWarningCron() {
  cronJob = cron.schedule(BOT.DEADLINE_CHECK_CRON, async () => {
    const startTime = performance.now();
    logger.info('Running deadline warning check');

    try {
      await checkDeadlines();
      const durationMs = Math.round(performance.now() - startTime);
      logger.info('Deadline warning check complete', {
        metric: 'cron_execution',
        job: 'deadline_warning',
        durationMs,
      });
    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);
      logger.error('Deadline warning cron failed', {
        metric: 'cron_execution',
        job: 'deadline_warning',
        error: error.message,
        durationMs,
      });
    }
  });

  logger.info(`Deadline warning cron scheduled: ${BOT.DEADLINE_CHECK_CRON}`);
}

export function stopDeadlineWarningCron() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
}

async function checkDeadlines() {
  // Get all active users to check their tasks
  const users = await userRepository.findByRole('all'); // Get all active users

  if (!users || users.length === 0) return;

  const now = new Date();
  const warningThreshold = new Date(now.getTime() + BOT.DEADLINE_WARNING_HOURS * 60 * 60 * 1000);

  let warningCount = 0;

  // Process in smaller batches to avoid overwhelming the FlowTask API
  for (const user of users) {
    try {
      // Skip users without FlowTask IDs
      if (!user.flowTaskUserId) continue;

      // We can't call FlowTask API for each user without their token.
      // Instead, use a service-level approach: check channels with linked projects
      // and their associated tasks via stored references.
      // For now, this is a placeholder that can be enhanced with a service token.

    } catch (error) {
      logger.debug('Deadline check failed for user', {
        userId: user._id,
        error: error.message,
      });
    }
  }

  // Alternative approach: check each project channel's linked board
  const projectChannels = await channelRepository.findByType('project');

  for (const channel of projectChannels) {
    if (!channel.flowTaskRef?.entityId || channel.isArchived) continue;

    try {
      // Try to get board data (needs service-level token)
      // For now, log the check
      logger.debug('Would check deadlines for project channel', {
        channelId: channel._id,
        boardId: channel.flowTaskRef.entityId,
      });
    } catch (error) {
      // Expected to fail without service token — silent skip
    }
  }

  if (warningCount > 0) {
    logger.info(`Deadline warnings sent: ${warningCount}`);
  }
}

/**
 * Post a deadline warning message for a specific task.
 * Called by the cron job or by webhook when a task approaches its deadline.
 */
export async function postDeadlineWarning(channelId, card, assignee, workspaceId) {
  const dueDate = new Date(card.dueDate);
  const now = new Date();
  const hoursLeft = Math.max(0, Math.round((dueDate - now) / (60 * 60 * 1000)));

  let urgency;
  if (hoursLeft <= 0) {
    urgency = '🔴 OVERDUE';
  } else if (hoursLeft <= 4) {
    urgency = '🟠 DUE VERY SOON';
  } else {
    urgency = '🟡 APPROACHING DEADLINE';
  }

  let msg = `⏰ ${urgency}: **${card.title}**\n`;
  msg += `Due: ${dueDate.toLocaleString()}`;

  if (hoursLeft > 0) {
    msg += ` (${hoursLeft}h remaining)`;
  }

  if (assignee) {
    msg += `\nAssigned to: ${assignee.name}`;
  }

  await messageService.sendSystemMessage(channelId, msg, {
    entityType: 'task',
    entityId: card._id,
  }, workspaceId);

  // Also notify the assignee directly
  if (assignee) {
    try {
      const deliver = await shouldDeliverNotification(assignee._id, null);
      if (deliver) {
        emitToUser(assignee._id.toString(), SOCKET_EVENTS.NOTIFICATION, {
          type: 'deadline_warning',
          channelId,
          taskTitle: card.title,
          dueDate: card.dueDate,
          hoursLeft,
        }, workspaceId?.toString());
      }
    } catch (err) {
      // If gateway fails, fall back to emitting the notification
      emitToUser(assignee._id.toString(), SOCKET_EVENTS.NOTIFICATION, {
        type: 'deadline_warning',
        channelId,
        taskTitle: card.title,
        dueDate: card.dueDate,
        hoursLeft,
      }, workspaceId?.toString());
    }
  }
}
