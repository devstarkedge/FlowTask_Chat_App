import SavedMessage from '../modules/messages/SavedMessage.model.js';
import notificationEngine from './notificationEngine.js';
import { NOTIFICATION_TYPES } from '../config/constants.js';
import logger from '../utils/logger.js';

const POLL_INTERVAL_MS = 30_000; // 30s
const BATCH_SIZE = 50;
let intervalHandle = null;

function calculateNextReminderAt(current, frequency) {
  if (!frequency || frequency === 'none') return null;
  const next = new Date(current);
  const now = new Date();
  
  // Ensure the next occurrence is in the future
  while (next <= now) {
    switch (frequency) {
      case 'daily':
        next.setDate(next.getDate() + 1);
        break;
      case 'weekly':
        next.setDate(next.getDate() + 7);
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        break;
      default:
        return null;
    }
  }
  return next;
}

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
        const nextAt = calculateNextReminderAt(saved.reminderAt, saved.recurrence);
        
        let updateData;
        if (nextAt) {
          // Recurring: Reschedule instead of marking as sent/overdue
          updateData = { 
            $set: { 
              reminderAt: nextAt,
              notificationSent: false,
              overdueNotificationSent: false 
            } 
          };
          logger.info(`[ReminderChecker] Rescheduling recurring reminder ${saved._id} to ${nextAt.toISOString()} (${saved.recurrence})`);
        } else {
          // One-time: Mark as sent
          updateData = { 
            $set: { 
              overdueNotificationSent: true, 
              notificationSent: true 
            } 
          };
        }

        // Atomically claim and update
        const claimed = await SavedMessage.findOneAndUpdate(
          { _id: saved._id, overdueNotificationSent: { $ne: true } },
          updateData,
          { new: true },
        );

        if (!claimed) continue;

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

        // Use the Notification Engine
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
