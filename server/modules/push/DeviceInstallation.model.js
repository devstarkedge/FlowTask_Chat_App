import mongoose from 'mongoose';
import { createHash } from 'node:crypto';

const { Schema, model } = mongoose;

export function getTokenFingerprint(token) {
  if (!token || typeof token !== 'string') return null;
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

const deviceInstallationSchema = new Schema({
  installationId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    default: null,
    index: true,
  },
  platform: {
    type: String,
    enum: ['expo', 'android', 'ios', 'desktop_win', 'desktop_mac', 'desktop_linux', 'desktop', 'web'],
    default: 'expo',
  },
  deviceType: {
    type: String,
    enum: ['mobile', 'desktop', 'web'],
    default: 'mobile',
  },
  pushProvider: {
    type: String,
    enum: ['expo', 'fcm', 'apns', 'webpush', 'electron_ipc', 'none'],
    default: 'expo',
  },
  pushToken: {
    type: String,
    default: null,
    index: true,
  },
  tokenFingerprint: {
    type: String,
    default: null,
  },
  sessionState: {
    type: String,
    enum: ['signed_in', 'signed_out', 'expired'],
    default: 'signed_in',
  },
  appState: {
    type: String,
    enum: ['active', 'background', 'minimized', 'tray', 'closed'],
    default: 'active',
  },
  focused: {
    type: Boolean,
    default: false,
  },
  idleState: {
    type: String,
    enum: ['active', 'idle', 'locked'],
    default: 'active',
  },
  screenLocked: {
    type: Boolean,
    default: false,
  },
  activeWorkspaceId: {
    type: String,
    default: null,
  },
  activeChannelId: {
    type: String,
    default: null,
  },
  lastActiveAt: {
    type: Date,
    default: Date.now,
  },
  lastSeenAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

deviceInstallationSchema.index({ userId: 1, sessionState: 1, deviceType: 1 });

/**
 * Bind a physical installation to the currently signed-in account.
 * Reassigns ownership cleanly on account switch without touching unrelated installations.
 */
deviceInstallationSchema.statics.bindInstallation = async function ({
  installationId,
  userId,
  platform = 'expo',
  deviceType = 'mobile',
  pushProvider = 'expo',
  pushToken = null,
}) {
  if (!installationId || !userId) return null;
  const now = new Date();
  const fingerprint = getTokenFingerprint(pushToken);

  // If this pushToken was previously associated with another installationId, clear it there.
  if (pushToken) {
    await this.updateMany(
      { installationId: { $ne: installationId }, pushToken },
      { $set: { pushToken: null, tokenFingerprint: null, sessionState: 'signed_out' } },
    );
  }

  return this.findOneAndUpdate(
    { installationId },
    {
      $set: {
        userId,
        platform,
        deviceType,
        pushProvider,
        pushToken: pushToken || null,
        tokenFingerprint: fingerprint,
        sessionState: 'signed_in',
        lastSeenAt: now,
        lastActiveAt: now,
      },
    },
    { upsert: true, returnDocument: 'after' },
  ).lean();
};

/**
 * Unbind an installation ONLY if it is currently owned by `userId`.
 * A late logout from account A will not revoke account B's binding.
 */
deviceInstallationSchema.statics.unbindInstallation = async function ({
  installationId = null,
  userId,
  pushToken = null,
}) {
  if (!userId) return null;
  const filter = { userId };
  if (installationId && pushToken) {
    filter.$or = [{ installationId }, { pushToken }];
  } else if (installationId) {
    filter.installationId = installationId;
  } else if (pushToken) {
    filter.pushToken = pushToken;
  } else {
    return null;
  }

  return this.updateMany(filter, {
    $set: {
      userId: null,
      sessionState: 'signed_out',
      focused: false,
      activeChannelId: null,
      lastSeenAt: new Date(),
    },
  });
};

/**
 * Update activity state (focus, idle, lock, appState, activeChannelId) for an installation.
 */
deviceInstallationSchema.statics.updateActivity = async function ({
  installationId,
  userId,
  platform,
  deviceType,
  focused,
  idleState,
  screenLocked,
  appState,
  sessionState,
  activeWorkspaceId,
  activeChannelId,
}) {
  if (!installationId || !userId) return null;
  const now = new Date();
  const update = { lastSeenAt: now };

  if (typeof focused === 'boolean') update.focused = focused;
  if (idleState) update.idleState = idleState;
  if (typeof screenLocked === 'boolean') update.screenLocked = screenLocked;
  if (appState) update.appState = appState;
  if (sessionState) update.sessionState = sessionState;
  if (activeWorkspaceId !== undefined) update.activeWorkspaceId = activeWorkspaceId ? String(activeWorkspaceId) : null;
  if (activeChannelId !== undefined) update.activeChannelId = activeChannelId ? String(activeChannelId) : null;
  if (platform) update.platform = platform;
  if (deviceType) update.deviceType = deviceType;

  if (focused || appState === 'active' || idleState === 'active') {
    update.lastActiveAt = now;
  }

  // Only update if installation is unbound or owned by this user
  return this.findOneAndUpdate(
    { installationId, $or: [{ userId }, { userId: null }] },
    { $set: { ...update, userId } },
    { upsert: true, returnDocument: 'after' },
  ).lean();
};

/**
 * Determine if the user has an active, unlocked desktop installation that can receive alerts.
 */
deviceInstallationSchema.statics.canDesktopReceiveAlerts = async function (userId, activeWindowMs = 5 * 60 * 1000) {
  if (!userId) return false;
  const cutoff = new Date(Date.now() - activeWindowMs);
  const desktop = await this.findOne({
    userId,
    deviceType: 'desktop',
    sessionState: 'signed_in',
    screenLocked: false,
    idleState: 'active',
    appState: { $in: ['active', 'minimized', 'tray'] },
    lastSeenAt: { $gte: cutoff },
  }).select('_id').lean();
  return Boolean(desktop);
};

const DeviceInstallation = model('DeviceInstallation', deviceInstallationSchema);
export default DeviceInstallation;
