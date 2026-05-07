import ScheduledMessage from '../modules/messages/ScheduledMessage.model.js';
import messageService from '../modules/messages/message.service.js';
import { emitToUser } from '../sockets/socketManager.js';
import { SOCKET_EVENTS } from '../config/constants.js';
import { registerQueue, addJob } from './jobQueue.service.js';
import env from '../config/environment.js';
import logger from '../utils/logger.js';

/**
 * Scheduled Message Processor — BullMQ-backed with interval fallback.
 *
 * If Redis is available, uses BullMQ delayed jobs for precise scheduling.
 * Otherwise, falls back to 30-second polling interval.
 *
 * Safe for multi-instance: uses findOneAndUpdate with status CAS
 * to prevent duplicate sends.
 */

let intervalHandle = null;
const POLL_INTERVAL_MS = 30_000; // 30 seconds
const QUEUE_NAME = 'scheduled-messages';
let bullMQEnabled = false;

/**
 * Process a single scheduled message (BullMQ job handler or poll handler).
 */
async function processScheduledMessage(scheduled) {
  try {
    // CAS: atomically claim this message
    const claimed = await ScheduledMessage.findOneAndUpdate(
      { _id: scheduled._id, status: 'pending' },
      { $set: { status: 'processing' } },
      { returnDocument: 'after' },
    );
    if (!claimed) return; // Another instance claimed it

    const message = await messageService.sendMessage({
      channelId: scheduled.channelId,
      authorId: scheduled.authorId,
      content: scheduled.content,
      htmlContent: scheduled.htmlContent,
      threadId: scheduled.threadId,
      workspaceId: scheduled.workspaceId,
      attachments: scheduled.attachments || [],
      mentions: (scheduled.mentions || []).map((m) => ({
        userId: m.targetId,
        username: m.name,
        type: m.type,
      })),
    });

    await ScheduledMessage.markSent(scheduled._id, message._id);

    // Notify the author that scheduled message was sent
    emitToUser(scheduled.authorId.toString(), SOCKET_EVENTS.SCHEDULED_MESSAGE_SENT, {
      scheduledMessageId: scheduled._id.toString(),
      message,
      channelId: scheduled.channelId.toString(),
      workspaceId: scheduled.workspaceId.toString(),
    }, scheduled.workspaceId.toString());

    logger.info('Scheduled message sent', { scheduledId: scheduled._id, messageId: message._id });
  } catch (err) {
    await ScheduledMessage.markFailed(scheduled._id, err.message);

    emitToUser(scheduled.authorId.toString(), SOCKET_EVENTS.SCHEDULED_MESSAGE_FAILED, {
      scheduledMessageId: scheduled._id.toString(),
      channelId: scheduled.channelId.toString(),
      reason: 'Failed to send scheduled message',
    }, scheduled.workspaceId.toString());

    logger.error('Failed to send scheduled message', {
      scheduledId: scheduled._id,
      error: err.message,
    });
  }
}

/**
 * Poll-based processor (fallback when Redis unavailable).
 */
async function processDueMessages() {
  try {
    const now = new Date();
    const dueMessages = await ScheduledMessage.findDueMessages(20);
    if (dueMessages.length > 0) {
      logger.debug('Scheduled message poll: found due messages', {
        count: dueMessages.length,
        serverTime: now.toISOString(),
        earliestScheduledAt: dueMessages[0]?.scheduledAt?.toISOString(),
      });
    }
    for (const scheduled of dueMessages) {
      await processScheduledMessage(scheduled);
    }
  } catch (err) {
    logger.error('Scheduled message processor error', { error: err.message });
  }
}

/**
 * BullMQ job processor — only runs when the BullMQ delay has elapsed.
 * Includes a defensive time check so a mistimed job never sends early.
 */
async function bullMQProcessor(job) {
  const { scheduledMessageId } = job.data;
  const scheduled = await ScheduledMessage.findById(scheduledMessageId);
  if (!scheduled || scheduled.status !== 'pending') return;

  // Defensive guard: BullMQ delay should have handled timing, but verify anyway
  if (scheduled.scheduledAt > new Date()) {
    logger.warn('BullMQ job fired too early — re-queuing', {
      scheduledMessageId,
      scheduledAt: scheduled.scheduledAt.toISOString(),
      now: new Date().toISOString(),
    });
    const remainingDelay = scheduled.scheduledAt.getTime() - Date.now();
    await addJob(QUEUE_NAME, { scheduledMessageId: scheduled._id.toString() }, {
      delay: remainingDelay,
      jobId: `sched-${scheduled._id}-retry`,
      removeOnComplete: true,
      removeOnFail: { count: 50 },
    });
    return;
  }

  await processScheduledMessage(scheduled);
}

/**
 * Schedule a BullMQ delayed job for a scheduled message.
 */
export async function enqueueScheduledMessage(scheduledMessage) {
  if (!bullMQEnabled) return; // Will be picked up by polling

  const delay = Math.max(0, new Date(scheduledMessage.scheduledAt).getTime() - Date.now());
  await addJob(QUEUE_NAME, {
    scheduledMessageId: scheduledMessage._id.toString(),
  }, {
    delay,
    jobId: `sched-${scheduledMessage._id}`, // Prevent duplicates
    removeOnComplete: true,
    removeOnFail: { count: 50 },
  });
}

export function startScheduledMessageProcessor() {
  // Only enable BullMQ delayed jobs when Redis is actually configured.
  // When Redis is absent, registerQueue() registers a sync-mode fallback that
  // executes addJob() *immediately* — which would bypass the scheduled delay
  // and send the message instantly. The polling interval handles the no-Redis
  // path correctly, so we must keep bullMQEnabled = false in that case.
  const redisAvailable = !!env.REDIS_URL;

  if (redisAvailable) {
    try {
      registerQueue(QUEUE_NAME, bullMQProcessor, { concurrency: 5 });
      bullMQEnabled = true;
      logger.info('Scheduled message processor started with BullMQ (Redis-backed delayed jobs)');
    } catch (err) {
      bullMQEnabled = false;
      logger.warn('BullMQ registration failed — falling back to polling only', { error: err.message });
    }
  } else {
    bullMQEnabled = false;
    logger.info('Scheduled message processor started in polling-only mode (REDIS_URL not configured)');
  }

  // Always run the polling fallback — handles BullMQ misses and no-Redis envs.
  // findDueMessages() filters by scheduledAt <= now so no premature sends.
  if (intervalHandle) return;
  intervalHandle = setInterval(processDueMessages, POLL_INTERVAL_MS);
  logger.info(`Scheduled message poll processor started (interval: ${POLL_INTERVAL_MS}ms)`);
}

export function stopScheduledMessageProcessor() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
