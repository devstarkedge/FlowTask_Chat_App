import NotificationOutbox from '../modules/notifications/NotificationOutbox.model.js';
import Notification from '../modules/notifications/Notification.model.js';
import NotificationPreference from '../modules/notifications/NotificationPreference.model.js';
import DeviceInstallation, { getTokenFingerprint } from '../modules/push/DeviceInstallation.model.js';
import userRepository from '../modules/users/user.repository.js';
import pushService from './push.service.js';
import { addJob, registerQueue } from './jobQueue.service.js';
import { shouldSendMobilePush } from '../utils/mobilePushDelivery.js';
import logger from '../utils/logger.js';

const OUTBOX_QUEUE = 'notification_outbox';
const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000;
let _sweepTimer = null;

function applyLockScreenPreview(payload, lockScreenPreview = 'full', notification = null) {
  if (lockScreenPreview === 'hidden') {
    return {
      ...payload,
      title: 'TaskChat',
      body: 'You have a new message',
    };
  }
  if (lockScreenPreview === 'sender_only') {
    const sender = notification?.senderName || 'Someone';
    return {
      ...payload,
      title: sender,
      body: 'Sent you a message',
    };
  }
  return payload;
}

export async function enqueueMobileOutbox({
  notification,
  recipientId,
  workspaceId,
  channelId = null,
  messageId = null,
  payload,
  delayMs = 0,
  expiresInMs = DEFAULT_EXPIRY_MS,
}) {
  const recipientIdStr = String(recipientId);
  const now = Date.now();
  const scheduledAt = new Date(now + Math.max(0, delayMs));
  const expiresAt = new Date(now + expiresInMs);

  // Gather signed-in mobile installations from DeviceInstallation
  const installations = await DeviceInstallation.find({
    userId: recipientIdStr,
    deviceType: 'mobile',
    sessionState: 'signed_in',
    pushToken: { $ne: null },
  }).lean();

  // Merge any legacy fcmTokens not yet represented in DeviceInstallation
  const user = await userRepository.findById(recipientIdStr);
  const fcmTokens = user?.chatPreferences?.fcmTokens || [];
  const seenTokens = new Set(installations.map(i => i.pushToken).filter(Boolean));
  const targets = installations.map(inst => ({
    installationId: inst.installationId,
    platform: inst.platform || 'expo',
    deliveryChannel: inst.pushProvider === 'fcm' ? 'fcm' : 'expo',
    pushToken: inst.pushToken,
  }));

  for (const entry of fcmTokens) {
    if (!entry?.token || seenTokens.has(entry.token)) continue;
    if (!['expo', 'android', 'ios'].includes(entry.platform)) continue;
    seenTokens.add(entry.token);
    targets.push({
      installationId: entry.deviceId || `legacy:${getTokenFingerprint(entry.token)}`,
      platform: entry.platform,
      deliveryChannel: entry.platform === 'expo' ? 'expo' : 'fcm',
      pushToken: entry.token,
    });
  }

  if (targets.length === 0) {
    logger.info('NotificationOutbox: no mobile installations for recipient', {
      recipientId: recipientIdStr,
      notificationId: String(notification._id),
    });
    return [];
  }

  const eventKey = notification.eventKey || `notif:${notification._id}`;
  const createdEntries = [];

  for (const target of targets) {
    const dedupKey = `${eventKey}:${recipientIdStr}:${target.installationId}`;
    try {
      const doc = await NotificationOutbox.findOneAndUpdate(
        { dedupKey },
        {
          $setOnInsert: {
            dedupKey,
            eventKey,
            notificationId: notification._id,
            workspaceId,
            recipientId: recipientIdStr,
            installationId: target.installationId,
            channelId: channelId || null,
            messageId: messageId || null,
            platform: target.platform,
            deliveryChannel: target.deliveryChannel,
            pushToken: target.pushToken,
            tokenFingerprint: getTokenFingerprint(target.pushToken),
            status: 'pending',
            scheduledAt,
            nextAttemptAt: scheduledAt,
            expiresAt,
            payload,
          },
        },
        { upsert: true, returnDocument: 'after' },
      ).lean();

      createdEntries.push(doc);

      if (doc.status === 'pending') {
        await addJob(OUTBOX_QUEUE, { outboxId: String(doc._id) }, {
          delay: delayMs > 0 ? delayMs : undefined,
          jobId: `outbox-${doc._id}`,
          removeOnComplete: true,
          removeOnFail: 50,
        }).catch(() => {});
      }
    } catch (err) {
      if (err?.code !== 11000) {
        logger.warn('NotificationOutbox: enqueue failed', {
          recipientId: recipientIdStr,
          installationId: target.installationId,
          error: err?.message,
        });
      }
    }
  }

  return createdEntries;
}

export async function dispatchOutboxEntry(outboxId) {
  const now = new Date();
  const entry = await NotificationOutbox.findOneAndUpdate(
    {
      _id: outboxId,
      status: 'pending',
      scheduledAt: { $lte: now },
      nextAttemptAt: { $lte: now },
    },
    { $set: { status: 'processing' } },
    { returnDocument: 'after' },
  ).lean();

  if (!entry) return { status: 'skipped' };

  if (entry.expiresAt && new Date(entry.expiresAt) <= now) {
    await NotificationOutbox.findByIdAndUpdate(entry._id, {
      $set: { status: 'expired', cancelReason: 'expired' },
    });
    return { status: 'expired' };
  }

  // 1. Recheck notification read status
  const notification = await Notification.findById(entry.notificationId).lean();
  if (!notification || notification.isRead) {
    await NotificationOutbox.findByIdAndUpdate(entry._id, {
      $set: { status: 'cancelled', cancelReason: notification ? 'already_read' : 'notification_deleted' },
    });
    return { status: 'cancelled', reason: 'already_read' };
  }

  // 2. Recheck installation ownership (if bound to another account or signed out, cancel)
  const inst = await DeviceInstallation.findOne({ installationId: entry.installationId }).lean();
  if (inst && (inst.sessionState !== 'signed_in' || String(inst.userId) !== String(entry.recipientId))) {
    await NotificationOutbox.findByIdAndUpdate(entry._id, {
      $set: { status: 'cancelled', cancelReason: 'installation_rebound_or_signed_out' },
    });
    logger.info('NotificationOutbox: cancelled for rebound/signed-out installation', {
      outboxId: String(entry._id),
      recipientId: String(entry.recipientId),
      installationId: entry.installationId,
    });
    return { status: 'cancelled', reason: 'installation_rebound_or_signed_out' };
  }

  // 3. Recheck workspace membership & channel access
  try {
    const { default: WorkspaceMembership } = await import('../modules/workspaces/WorkspaceMembership.model.js');
    const membership = await WorkspaceMembership.findOne({
      workspaceId: entry.workspaceId,
      userId: entry.recipientId,
      isActive: { $ne: false },
    }).select('_id').lean();
    if (!membership) {
      await NotificationOutbox.findByIdAndUpdate(entry._id, {
        $set: { status: 'cancelled', cancelReason: 'workspace_access_revoked' },
      });
      return { status: 'cancelled', reason: 'workspace_access_revoked' };
    }
  } catch (err) {
    logger.debug('NotificationOutbox: workspace membership check skipped', { error: err?.message });
  }

  // 4. Recheck notification preferences
  const prefs = await NotificationPreference.getOrCreate(entry.recipientId, entry.workspaceId);
  if (!prefs.global?.enabled || !shouldSendMobilePush({ mobilePushEnabled: prefs.global?.mobilePush })) {
    await NotificationOutbox.findByIdAndUpdate(entry._id, {
      $set: { status: 'cancelled', cancelReason: 'settings_changed' },
    });
    return { status: 'cancelled', reason: 'settings_changed' };
  }

  const senderIdStr = notification.senderId ? String(notification.senderId) : null;
  const isVIP = senderIdStr && prefs.vipUsers?.some(id => String(id) === senderIdStr);
  if (!isVIP) {
    const isPaused = await NotificationPreference.isPaused(entry.recipientId, entry.workspaceId);
    const inQuietHours = await NotificationPreference.isInQuietHours(entry.recipientId, entry.workspaceId);
    if (isPaused || inQuietHours) {
      await NotificationOutbox.findByIdAndUpdate(entry._id, {
        $set: { status: 'cancelled', cancelReason: isPaused ? 'paused' : 'quiet_hours' },
      });
      return { status: 'cancelled', reason: isPaused ? 'paused' : 'quiet_hours' };
    }
  }

  // 5. Apply lock-screen preview & sound preferences
  const formattedPayload = applyLockScreenPreview(
    {
      ...entry.payload,
      sound: prefs.global?.sound === false ? false : entry.payload?.sound,
    },
    prefs.global?.lockScreenPreview || 'full',
    notification,
  );

  // 6. Dispatch via push service
  const outcome = await pushService.sendToInstallation({
    userId: entry.recipientId,
    installationId: entry.installationId,
    deliveryChannel: entry.deliveryChannel,
    pushToken: entry.pushToken,
    payload: formattedPayload,
  });

  if (outcome.status === 'ok') {
    await NotificationOutbox.findByIdAndUpdate(entry._id, {
      $set: { status: 'sent', sentAt: new Date(), lastError: null },
    });
    await Notification.findByIdAndUpdate(entry.notificationId, {
      $set: { pushSentAt: new Date() },
    }).catch(() => {});
    return { status: 'sent' };
  }

  if (outcome.status === 'invalid_registration' || outcome.status === 'skipped') {
    await DeviceInstallation.updateMany(
      { installationId: entry.installationId, pushToken: entry.pushToken },
      { $set: { pushToken: null, tokenFingerprint: null } },
    ).catch(() => {});
    await NotificationOutbox.findByIdAndUpdate(entry._id, {
      $set: { status: 'failed', lastError: outcome.code || 'invalid_registration' },
    });
    return { status: 'failed', reason: outcome.code };
  }

  // Temporary failure — retry with exponential backoff within expiry
  const attempts = (entry.attempts || 0) + 1;
  const backoffMs = Math.min(60000, 2000 * (2 ** attempts));
  const nextAttemptAt = new Date(Date.now() + backoffMs);
  if (attempts < (entry.maxAttempts || 5) && (!entry.expiresAt || nextAttemptAt < new Date(entry.expiresAt))) {
    await NotificationOutbox.findByIdAndUpdate(entry._id, {
      $set: { status: 'pending', attempts, nextAttemptAt, lastError: outcome.code || 'temporary_failure' },
    });
    await addJob(OUTBOX_QUEUE, { outboxId: String(entry._id) }, {
      delay: backoffMs,
      jobId: `outbox-${entry._id}-retry-${attempts}`,
      removeOnComplete: true,
      removeOnFail: 50,
    }).catch(() => {});
    return { status: 'retrying', attempts };
  }

  await NotificationOutbox.findByIdAndUpdate(entry._id, {
    $set: { status: 'failed', attempts, lastError: outcome.code || 'max_attempts_reached' },
  });
  return { status: 'failed', reason: outcome.code };
}

export async function processDueOutboxEntries(limit = 50) {
  const now = new Date();
  const due = await NotificationOutbox.find({
    status: 'pending',
    scheduledAt: { $lte: now },
    nextAttemptAt: { $lte: now },
  })
    .sort({ scheduledAt: 1 })
    .limit(limit)
    .select('_id')
    .lean();

  for (const item of due) {
    await dispatchOutboxEntry(item._id).catch(err => {
      logger.warn('NotificationOutbox: dispatch error', { outboxId: String(item._id), error: err?.message });
    });
  }
  return due.length;
}

export async function triggerPendingMobileAlertsForUser(userId) {
  if (!userId) return 0;
  const now = new Date();
  const pending = await NotificationOutbox.find({
    recipientId: userId,
    status: 'pending',
    scheduledAt: { $gt: now },
  }).select('_id').lean();

  if (pending.length === 0) return 0;

  await NotificationOutbox.updateMany(
    { _id: { $in: pending.map(p => p._id) }, status: 'pending' },
    { $set: { scheduledAt: now, nextAttemptAt: now } },
  );

  for (const item of pending) {
    await dispatchOutboxEntry(item._id).catch(() => {});
  }
  return pending.length;
}

export async function cancelForNotification(notificationId, reason = 'cancelled') {
  if (!notificationId) return;
  return NotificationOutbox.updateMany(
    { notificationId, status: 'pending' },
    { $set: { status: 'cancelled', cancelReason: reason } },
  );
}

export async function cancelForChannelRead(recipientId, channelId, reason = 'already_read') {
  if (!recipientId || !channelId) return;
  return NotificationOutbox.updateMany(
    { recipientId, channelId, status: 'pending' },
    { $set: { status: 'cancelled', cancelReason: reason } },
  );
}

export async function cancelForUserAccessRevoked(recipientId, workspaceId, channelId = null, reason = 'access_revoked') {
  if (!recipientId) return;
  const filter = { recipientId, status: 'pending' };
  if (workspaceId) filter.workspaceId = workspaceId;
  if (channelId) filter.channelId = channelId;
  return NotificationOutbox.updateMany(filter, {
    $set: { status: 'cancelled', cancelReason: reason },
  });
}

export async function cancelForInstallationSwitch(installationId, previousUserId = null, reason = 'account_switched') {
  if (!installationId) return;
  const filter = { installationId, status: 'pending' };
  if (previousUserId) filter.recipientId = previousUserId;
  return NotificationOutbox.updateMany(filter, {
    $set: { status: 'cancelled', cancelReason: reason },
  });
}

export async function cancelForSettingsChange(recipientId, workspaceId = null, reason = 'settings_changed') {
  if (!recipientId) return;
  const filter = { recipientId, status: 'pending' };
  if (workspaceId) filter.workspaceId = workspaceId;
  return NotificationOutbox.updateMany(filter, {
    $set: { status: 'cancelled', cancelReason: reason },
  });
}

registerQueue(OUTBOX_QUEUE, async (job) => {
  await dispatchOutboxEntry(job.data.outboxId);
}, { concurrency: 5 });

export function startOutboxSweeper(intervalMs = 15000) {
  if (_sweepTimer) return;
  _sweepTimer = setInterval(() => {
    processDueOutboxEntries().catch(() => {});
  }, intervalMs);
  _sweepTimer.unref?.();
}

export default {
  enqueueMobileOutbox,
  dispatchOutboxEntry,
  processDueOutboxEntries,
  triggerPendingMobileAlertsForUser,
  cancelForNotification,
  cancelForChannelRead,
  cancelForUserAccessRevoked,
  cancelForInstallationSwitch,
  cancelForSettingsChange,
  startOutboxSweeper,
};
