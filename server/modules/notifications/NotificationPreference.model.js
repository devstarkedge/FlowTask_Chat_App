import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * NotificationPreference — per-user, per-workspace notification settings.
 *
 * Unified model for:
 *  - Global toggles (sound, desktop push, mobile push)
 *  - Pause / quiet hours (timezone-aware)
 *  - Per-section defaults (channels, groups, DMs, bots)
 *  - Per-channel overrides (mute, level)
 *  - Custom keyword triggers
 *  - VIP users who bypass DND
 *
 * One document per (userId, workspaceId) pair.
 */

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

const channelOverrideSchema = new Schema({
  level: {
    type: String,
    enum: ['all', 'mentions', 'nothing'],
    default: 'mentions',
  },
  muted: { type: Boolean, default: false },
  muteUntil: { type: Date, default: null },
}, { _id: false });

const dmOverrideSchema = new Schema({
  muted: { type: Boolean, default: false },
  muteUntil: { type: Date, default: null },
}, { _id: false });

// ─── Main Schema ─────────────────────────────────────────────────────────────

const notificationPreferenceSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    required: true,
  },
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },

  // ─── Global Toggles ─────────────────────────────────────────────────
  global: {
    enabled: { type: Boolean, default: true },         // Master kill switch
    sound: { type: Boolean, default: true },
    desktopPush: { type: Boolean, default: true },
    mobilePush: { type: Boolean, default: true },
    emailDigest: { type: Boolean, default: false },
  },

  // ─── Pause / Quiet Hours ────────────────────────────────────────────
  pause: {
    active: { type: Boolean, default: false },
    resumeAt: { type: Date, default: null },           // When to auto-resume
    quietHoursEnabled: { type: Boolean, default: false },
    quietStart: { type: String, default: '22:00' },    // HH:MM format
    quietEnd: { type: String, default: '08:00' },
    timezone: { type: String, default: 'UTC' },
  },

  // ─── Channel Notifications ──────────────────────────────────────────
  channels: {
    defaultLevel: {
      type: String,
      enum: ['all', 'mentions', 'nothing'],
      default: 'mentions',
    },
    overrides: {
      type: Map,
      of: channelOverrideSchema,
      default: new Map(),
    },
  },

  // ─── Group / Private Channel Notifications ──────────────────────────
  groups: {
    defaultLevel: {
      type: String,
      enum: ['all', 'mentions', 'nothing'],
      default: 'all',
    },
    overrides: {
      type: Map,
      of: channelOverrideSchema,
      default: new Map(),
    },
  },

  // ─── Direct Message Notifications ───────────────────────────────────
  dms: {
    enabled: { type: Boolean, default: true },         // Always-on by default
    overrides: {
      type: Map,
      of: dmOverrideSchema,
      default: new Map(),
    },
  },

  // ─── Bot Notifications ──────────────────────────────────────────────
  bots: {
    enabled: { type: Boolean, default: true },
    level: {
      type: String,
      enum: ['all', 'important', 'nothing'],
      default: 'important',
    },
  },

  // ─── Custom Keyword Triggers ────────────────────────────────────────
  // Notification fires if any message contains one of these keywords
  keywords: {
    type: [String],
    default: [],
    validate: {
      validator: (v) => v.length <= 50,
      message: 'Maximum 50 keywords allowed',
    },
  },

  // ─── VIP Users (bypass DND/pause) ───────────────────────────────────
  vipUsers: [{
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
  }],
}, {
  timestamps: true,
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
// One preference doc per user per workspace
notificationPreferenceSchema.index(
  { userId: 1, workspaceId: 1 },
  { unique: true },
);

// ─── Static Methods ──────────────────────────────────────────────────────────

/**
 * Get or create preference document for a user in a workspace.
 * Returns existing doc or creates with defaults.
 */
notificationPreferenceSchema.statics.getOrCreate = async function (userId, workspaceId) {
  let pref = await this.findOne({ userId, workspaceId }).lean();
  if (!pref) {
    pref = await this.create({ userId, workspaceId });
    pref = pref.toObject();
  }
  return pref;
};

/**
 * Update global toggles for a user.
 */
notificationPreferenceSchema.statics.updateGlobal = function (userId, workspaceId, globalSettings) {
  const setFields = {};
  for (const [key, value] of Object.entries(globalSettings)) {
    setFields[`global.${key}`] = value;
  }
  return this.findOneAndUpdate(
    { userId, workspaceId },
    { $set: setFields },
    { upsert: true, returnDocument: 'after' },
  );
};

/**
 * Set pause state.
 */
notificationPreferenceSchema.statics.setPause = function (userId, workspaceId, pauseData) {
  const setFields = {};
  for (const [key, value] of Object.entries(pauseData)) {
    setFields[`pause.${key}`] = value;
  }
  return this.findOneAndUpdate(
    { userId, workspaceId },
    { $set: setFields },
    { upsert: true, returnDocument: 'after' },
  );
};

/**
 * Set per-channel notification override.
 */
notificationPreferenceSchema.statics.setChannelOverride = function (
  userId, workspaceId, channelId, section, override,
) {
  const key = `${section}.overrides.${channelId}`;
  return this.findOneAndUpdate(
    { userId, workspaceId },
    { $set: { [key]: override } },
    { upsert: true, returnDocument: 'after' },
  );
};

/**
 * Remove per-channel override (revert to default).
 */
notificationPreferenceSchema.statics.removeChannelOverride = function (
  userId, workspaceId, channelId, section,
) {
  const key = `${section}.overrides.${channelId}`;
  return this.findOneAndUpdate(
    { userId, workspaceId },
    { $unset: { [key]: 1 } },
    { returnDocument: 'after' },
  );
};

/**
 * Update custom keywords.
 */
notificationPreferenceSchema.statics.setKeywords = function (userId, workspaceId, keywords) {
  const cleaned = [...new Set(
    keywords.map((k) => k.trim().toLowerCase()).filter(Boolean),
  )].slice(0, 50);
  return this.findOneAndUpdate(
    { userId, workspaceId },
    { $set: { keywords: cleaned } },
    { upsert: true, returnDocument: 'after' },
  );
};

/**
 * Check if a user is currently in pause mode.
 * Handles expired pauses by auto-clearing them.
 */
notificationPreferenceSchema.statics.isPaused = async function (userId, workspaceId) {
  const pref = await this.findOne({ userId, workspaceId }).select('pause').lean();
  if (!pref?.pause?.active) return false;

  // Check if pause has expired
  if (pref.pause.resumeAt && new Date(pref.pause.resumeAt) <= new Date()) {
    await this.findOneAndUpdate(
      { userId, workspaceId },
      { $set: { 'pause.active': false, 'pause.resumeAt': null } },
    );
    return false;
  }

  return true;
};

/**
 * Check if current time falls within quiet hours (timezone-aware).
 */
notificationPreferenceSchema.statics.isInQuietHours = async function (userId, workspaceId) {
  const pref = await this.findOne({ userId, workspaceId })
    .select('pause.quietHoursEnabled pause.quietStart pause.quietEnd pause.timezone')
    .lean();

  if (!pref?.pause?.quietHoursEnabled) return false;

  const { quietStart, quietEnd, timezone } = pref.pause;
  if (!quietStart || !quietEnd) return false;

  try {
    // Get current time in user's timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      timeZone: timezone || 'UTC',
    });
    const parts = formatter.formatToParts(now);
    const currentHour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const currentMinute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
    const currentMinutes = currentHour * 60 + currentMinute;

    const [startH, startM] = quietStart.split(':').map(Number);
    const [endH, endM] = quietEnd.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
    // Wraps midnight (e.g. 22:00 – 08:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  } catch {
    return false;
  }
};

/**
 * Get the notification level for a specific channel/conversation.
 * Returns { level, muted, shouldNotify } based on section + overrides.
 */
notificationPreferenceSchema.statics.getChannelLevel = async function (
  userId, workspaceId, channelId, channelType,
) {
  const pref = await this.findOne({ userId, workspaceId })
    .select('channels groups dms')
    .lean();

  if (!pref) {
    // Default behavior when no preferences exist
    return { level: channelType === 'dm' ? 'all' : 'mentions', muted: false, shouldNotify: true };
  }

  const channelIdStr = channelId.toString();

  // DM channels
  if (channelType === 'dm') {
    const override = pref.dms?.overrides?.[channelIdStr];
    if (override?.muted) {
      // Check if mute has expired
      if (override.muteUntil && new Date(override.muteUntil) <= new Date()) {
        return { level: 'all', muted: false, shouldNotify: pref.dms?.enabled !== false };
      }
      return { level: 'all', muted: true, shouldNotify: false };
    }
    return { level: 'all', muted: false, shouldNotify: pref.dms?.enabled !== false };
  }

  // Private/group channels
  if (channelType === 'private' || channelType === 'team') {
    const override = pref.groups?.overrides?.[channelIdStr];
    if (override) {
      if (override.muted) {
        if (override.muteUntil && new Date(override.muteUntil) <= new Date()) {
          return { level: pref.groups?.defaultLevel || 'all', muted: false, shouldNotify: true };
        }
        return { level: override.level || 'nothing', muted: true, shouldNotify: false };
      }
      return { level: override.level || pref.groups?.defaultLevel || 'all', muted: false, shouldNotify: true };
    }
    return { level: pref.groups?.defaultLevel || 'all', muted: false, shouldNotify: true };
  }

  // Public/regular channels
  const override = pref.channels?.overrides?.[channelIdStr];
  if (override) {
    if (override.muted) {
      if (override.muteUntil && new Date(override.muteUntil) <= new Date()) {
        return { level: pref.channels?.defaultLevel || 'mentions', muted: false, shouldNotify: true };
      }
      return { level: override.level || 'nothing', muted: true, shouldNotify: false };
    }
    return { level: override.level || pref.channels?.defaultLevel || 'mentions', muted: false, shouldNotify: true };
  }
  return { level: pref.channels?.defaultLevel || 'mentions', muted: false, shouldNotify: true };
};

const NotificationPreference = model('NotificationPreference', notificationPreferenceSchema);

export default NotificationPreference;
