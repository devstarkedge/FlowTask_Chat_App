import ScheduledMessage from '../modules/messages/ScheduledMessage.model.js';
import messageService from '../modules/messages/message.service.js';
import { emitToUser } from '../sockets/socketManager.js';
import { SOCKET_EVENTS } from '../config/constants.js';
import { registerQueue, addJob } from './jobQueue.service.js';
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
      { new: true },
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
      scheduledId: scheduled._id,
      messageId: message._id,
      channelId: scheduled.channelId.toString(),
    }, scheduled.workspaceId.toString());

    logger.info('Scheduled message sent', { scheduledId: scheduled._id, messageId: message._id });
  } catch (err) {
    await ScheduledMessage.markFailed(scheduled._id, err.message);

    emitToUser(scheduled.authorId.toString(), SOCKET_EVENTS.SCHEDULED_MESSAGE_FAILED, {
      scheduledId: scheduled._id,
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
    const dueMessages = await ScheduledMessage.findDueMessages(20);
    for (const scheduled of dueMessages) {
      await processScheduledMessage(scheduled);
    }
  } catch (err) {
    logger.error('Scheduled message processor error', { error: err.message });
  }
}

/**
 * BullMQ job processor.
 */
async function bullMQProcessor(job) {
  const { scheduledMessageId } = job.data;
  const scheduled = await ScheduledMessage.findById(scheduledMessageId);
  if (!scheduled || scheduled.status !== 'pending') return;
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
  // Try to register BullMQ queue
  try {
    registerQueue(QUEUE_NAME, bullMQProcessor, { concurrency: 5 });
    bullMQEnabled = true;
    logger.info('Scheduled message processor started with BullMQ');
  } catch {
    bullMQEnabled = false;
  }

  // Always run the polling fallback — it handles BullMQ misses and non-Redis envs
  if (intervalHandle) return;
  intervalHandle = setInterval(processDueMessages, POLL_INTERVAL_MS);
  logger.info('Scheduled message poll processor started');
}

export function stopScheduledMessageProcessor() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
