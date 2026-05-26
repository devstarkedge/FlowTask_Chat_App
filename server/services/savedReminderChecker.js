import SavedMessage from '../modules/messages/SavedMessage.model.js';
import notificationEngine from './notificationEngine.js';
import { NOTIFICATION_TYPES } from '../config/constants.js';
import logger from '../utils/logger.js';
import { DateTime } from 'luxon';

const POLL_INTERVAL_MS = 30_000; // 30s
const BATCH_SIZE = 50;
let intervalHandle = null;

function calculateNextReminderAt(saved) {
  // saved: { reminderAt, recurrence, recurrenceMeta, recurrenceRule, timezone }
  if (!saved) return null;
  const tz = saved.timezone || 'UTC';
  const now = DateTime.utc().setZone(tz);

  // If recurrenceRule exists, try basic handling via recurrenceMeta first (rrule parsing can be added later)
  const start = saved.reminderAt ? DateTime.fromJSDate(new Date(saved.reminderAt)).setZone(tz) : now;

  // Use recurrenceMeta when available (supports interval/byWeekday/byMonthDay/until)
  if (saved.recurrenceMeta && saved.recurrenceMeta.frequency) {
    const meta = saved.recurrenceMeta;
    const interval = Math.max(1, parseInt(meta.interval || 1, 10));
    let candidate = start;

    // Ensure candidate moves forward until it's in the future
    while (candidate <= now) {
      switch ((meta.frequency || saved.recurrence || 'none')) {
        case 'daily':
          candidate = candidate.plus({ days: interval });
          break;
        case 'weekly': {
          // If byWeekday provided (0-6 or ISO 1-7), try to jump to next matching weekday
          if (Array.isArray(meta.byWeekday) && meta.byWeekday.length > 0) {
            const isoNow = candidate.setZone(tz).weekday; // 1..7
            // Convert provided weekdays to ISO (accept 0-6 or 1-7 strings)
            const weekdays = meta.byWeekday.map((d) => {
              const n = parseInt(d, 10);
              if (Number.isNaN(n)) return null;
              return n === 0 ? 7 : n; // map 0->7 if used
            }).filter(Boolean);
            // Find next weekday in list
            const future = weekdays
              .map((wd) => {
                let diff = wd - isoNow;
                if (diff <= 0) diff += 7 * interval;
                return candidate.plus({ days: diff });
              })
              .sort((a, b) => a.toMillis() - b.toMillis());
            if (future.length > 0) {
              candidate = future[0];
            } else {
              candidate = candidate.plus({ weeks: interval });
            }
          } else {
            candidate = candidate.plus({ weeks: interval });
          }
        }
          break;
        case 'monthly':
          if (Array.isArray(meta.byMonthDay) && meta.byMonthDay.length > 0) {
            // Try next matching month-day
            const nextMonth = candidate.plus({ months: interval });
            // Pick the smallest byMonthDay that is after candidate
            const days = meta.byMonthDay.map((d) => parseInt(d, 10)).filter((n) => !Number.isNaN(n));
            let chosen = null;
            for (const d of days.sort((a, b) => a - b)) {
              const c = DateTime.fromObject({ year: nextMonth.year, month: nextMonth.month, day: Math.min(d, DateTime.local(nextMonth.year, nextMonth.month).endOf('month').day), zone: tz });
              if (c > candidate) {
                chosen = c;
                break;
              }
            }
            candidate = chosen || nextMonth;
          } else {
            candidate = candidate.plus({ months: interval });
          }
          break;
        default:
          return null;
      }
      // Safety bail-out
      if (candidate.diff(now, 'years').years > 100) return null;
    }

    return candidate.toJSDate();
  }

  // Fallback: simple string-based recurrence (legacy)
  if (!saved.recurrence || saved.recurrence === 'none') return null;

  let next = DateTime.fromJSDate(new Date(saved.reminderAt)).setZone(tz);
  while (next <= now) {
    switch (saved.recurrence) {
      case 'daily':
        next = next.plus({ days: 1 });
        break;
      case 'weekly':
        next = next.plus({ weeks: 1 });
        break;
      case 'monthly':
        next = next.plus({ months: 1 });
        break;
      default:
        return null;
    }
  }

  return next.toJSDate();
}

async function processDueReminders() {
  try {
    const now = new Date();
    logger.debug('[ReminderChecker] Checking for due reminders', { now: now.toISOString() });

    const due = await SavedMessage.find({
      reminderAt: { $lte: now },
      status: 'in_progress',
      overdueNotificationSent: { $ne: true },
      $or: [ { snoozedUntil: null }, { snoozedUntil: { $lte: now } } ],
    }).limit(BATCH_SIZE).lean();

    logger.info('[ReminderChecker] Found due reminders', { count: due.length });

    if (!due || due.length === 0) return;

    for (const saved of due) {
      try {
        const nextAt = calculateNextReminderAt(saved);
        
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
          logger.info(`[ReminderChecker] Rescheduling recurring reminder ${saved._id} to ${new Date(nextAt).toISOString()}`, { recurrence: saved.recurrence, recurrenceRule: saved.recurrenceRule, recurrenceMeta: saved.recurrenceMeta });
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
          priority: 'high',
          category: 'system',
          channelId: claimed.channelId || null,
          channelName: null,
          senderId: null,
          senderName: null,
          deepLink,
          forceNotify: true,
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
  logger.info('[ReminderChecker] Starting saved reminder checker', { intervalMs: POLL_INTERVAL_MS });
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
