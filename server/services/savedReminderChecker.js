import SavedMessage from '../modules/messages/SavedMessage.model.js';
import notificationEngine from './notificationEngine.js';
import { NOTIFICATION_TYPES } from '../config/constants.js';
import logger from '../utils/logger.js';

const POLL_INTERVAL_MS = 30_000; // 30s
const BATCH_SIZE = 50;
let intervalHandle = null;

async function processDueReminders() {
  try {
    const now = new Date();

    const due = await SavedMessage.find({
      reminderAt: { $lte: now },
      status: 'in_progress',
      overdueNotificationSent: { $ne: true },
    }).limit(BATCH_SIZE).lean();

    if (!due || due.length === 0) return;

    for (const saved of due) {
      try {
        // Atomically mark this reminder as having its overdue notification sent
        const claimed = await SavedMessage.findOneAndUpdate(
          { _id: saved._id, overdueNotificationSent: { $ne: true } },
          { $set: { overdueNotificationSent: true, notificationSent: true } },
          { new: true },
        );

        if (!claimed) continue; // Already handled by another instance

        const rawTitle = claimed.title || claimed.reminderDescription || 'Reminder';
        const rawBody = claimed.reminderDescription || 'Your reminder is now overdue';
        const titleText = rawTitle.length > 150 ? rawTitle.substring(0, 150) + '...' : rawTitle;
        const bodyText = rawBody.length > 490 ? rawBody.substring(0, 490) + '...' : rawBody;

        const deepLink = {
          workspaceId: claimed.workspaceId,
          channelId: claimed.channelId || null,
          messageId: claimed.messageId || null,
          type: claimed.channelId ? 'channel' : 'workspace',
        };

        // Use the Notification Engine so deepLink, DND and push logic are applied
        await notificationEngine.processSystemNotification({
          workspaceId: claimed.workspaceId,
          recipientId: claimed.userId,
          type: NOTIFICATION_TYPES.REMINDER_OVERDUE,
          title: `Reminder overdue: ${titleText}`,
          body: bodyText,
          priority: 'medium',
          category: 'system',
          channelId: claimed.channelId || null,
          channelName: null,
          senderId: null,
          senderName: null,
          deepLink,
        });
      } catch (err) {
        logger.error('SavedReminderChecker: failed processing saved reminder', { id: saved._id, error: err?.message || err });
      }
    }
  } catch (err) {
    logger.error('SavedReminderChecker: poll error', { error: err?.message || err });
  }
}

export function startSavedReminderChecker() {
  if (intervalHandle) return;
  // Run immediately, then poll on interval
  processDueReminders().catch(() => {});
  intervalHandle = setInterval(processDueReminders, POLL_INTERVAL_MS);
  logger.info('Saved reminder checker started', { intervalMs: POLL_INTERVAL_MS });
}

export function stopSavedReminderChecker() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  logger.info('Saved reminder checker stopped');
}

export default { startSavedReminderChecker, stopSavedReminderChecker };
