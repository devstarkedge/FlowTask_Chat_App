import ScheduledMessage from '../modules/messages/ScheduledMessage.model.js';
import messageService from '../modules/messages/message.service.js';
import logger from '../utils/logger.js';

/**
 * Scheduled Message Processor — cron-style interval job.
 *
 * Runs every 30 seconds, picks up pending scheduled messages
 * whose scheduledAt ≤ now, and sends them via the message service.
 *
 * Safe for multi-instance: uses findOneAndUpdate with status CAS
 * to prevent duplicate sends.
 */

let intervalHandle = null;
const POLL_INTERVAL_MS = 30_000; // 30 seconds

async function processDueMessages() {
  try {
    const dueMessages = await ScheduledMessage.findDueMessages(20);

    for (const scheduled of dueMessages) {
      try {
        // CAS: atomically claim this message
        const claimed = await ScheduledMessage.findOneAndUpdate(
          { _id: scheduled._id, status: 'pending' },
          { $set: { status: 'processing' } },
          { new: true },
        );
        if (!claimed) continue; // Another instance claimed it

        const message = await messageService.sendMessage({
          channelId: scheduled.channelId,
          authorId: scheduled.authorId,
          content: scheduled.content,
          htmlContent: scheduled.htmlContent,
          threadId: scheduled.threadId,
          workspaceId: scheduled.workspaceId,
        });

        await ScheduledMessage.markSent(scheduled._id, message._id);
        logger.info('Scheduled message sent', { scheduledId: scheduled._id, messageId: message._id });
      } catch (err) {
        await ScheduledMessage.markFailed(scheduled._id, err.message);
        logger.error('Failed to send scheduled message', {
          scheduledId: scheduled._id,
          error: err.message,
        });
      }
    }
  } catch (err) {
    logger.error('Scheduled message processor error', { error: err.message });
  }
}

export function startScheduledMessageProcessor() {
  if (intervalHandle) return;
  intervalHandle = setInterval(processDueMessages, POLL_INTERVAL_MS);
  logger.info('Scheduled message processor started');
}

export function stopScheduledMessageProcessor() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
