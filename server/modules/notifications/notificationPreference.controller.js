import asyncHandler from '../../middleware/asyncHandler.js';
import NotificationPreference from './NotificationPreference.model.js';
import Notification from './Notification.model.js';
import { emitToUser } from '../../sockets/socketManager.js';
import { SOCKET_EVENTS } from '../../config/constants.js';
import logger from '../../utils/logger.js';

// ─── Get Preferences ─────────────────────────────────────────────────────────

// GET /api/chat/notifications/preferences
export const getPreferences = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const workspaceId = req.workspaceId;

  const prefs = await NotificationPreference.getOrCreate(userId, workspaceId);
  res.json({ success: true, data: prefs });
});

// ─── Update Global Preferences ───────────────────────────────────────────────

// PUT /api/chat/notifications/preferences
export const updatePreferences = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const workspaceId = req.workspaceId;
  const { global, channels, groups, dms, bots } = req.body;

  const updateData = {};

  if (global) {
    for (const [key, value] of Object.entries(global)) {
      if (['enabled', 'sound', 'desktopPush', 'mobilePush', 'emailDigest'].includes(key)) {
        updateData[`global.${key}`] = value;
      }
    }
  }

  if (channels?.defaultLevel) {
    updateData['channels.defaultLevel'] = channels.defaultLevel;
  }
  if (groups?.defaultLevel) {
    updateData['groups.defaultLevel'] = groups.defaultLevel;
  }
  if (dms && typeof dms.enabled === 'boolean') {
    updateData['dms.enabled'] = dms.enabled;
  }
  if (bots) {
    if (typeof bots.enabled === 'boolean') updateData['bots.enabled'] = bots.enabled;
    if (bots.level) updateData['bots.level'] = bots.level;
  }

  const updated = await NotificationPreference.findOneAndUpdate(
    { userId, workspaceId },
    { $set: updateData },
    { upsert: true, returnDocument: 'after' },
  );

  // Broadcast preference change to all user's devices
  emitToUser(userId.toString(), SOCKET_EVENTS.NOTIFICATION_PREFERENCES_UPDATED, {
    preferences: updated,
  }, workspaceId?.toString());

  res.json({ success: true, data: updated });
});

// ─── Per-Channel Override ────────────────────────────────────────────────────

// PUT /api/chat/notifications/preferences/channel/:channelId
export const updateChannelPreference = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const workspaceId = req.workspaceId;
  const { channelId } = req.params;
  const { level, muted, muteUntil, section } = req.body;

  // Determine which section (channels, groups, dms)
  const sectionKey = section || 'channels';
  if (!['channels', 'groups', 'dms'].includes(sectionKey)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid section' } });
  }

  const override = {};
  if (sectionKey === 'dms') {
    // DM overrides only have muted + muteUntil
    if (typeof muted === 'boolean') override.muted = muted;
    if (muteUntil) override.muteUntil = new Date(muteUntil);
  } else {
    if (level) override.level = level;
    if (typeof muted === 'boolean') override.muted = muted;
    if (muteUntil) override.muteUntil = new Date(muteUntil);
  }

  const updated = await NotificationPreference.setChannelOverride(
    userId, workspaceId, channelId, sectionKey, override,
  );

  res.json({ success: true, data: updated });
});

// DELETE /api/chat/notifications/preferences/channel/:channelId
export const removeChannelPreference = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const workspaceId = req.workspaceId;
  const { channelId } = req.params;
  const { section } = req.body || {};
  const sectionKey = section || 'channels';

  const updated = await NotificationPreference.removeChannelOverride(
    userId, workspaceId, channelId, sectionKey,
  );

  res.json({ success: true, data: updated });
});

// ─── Pause Notifications ─────────────────────────────────────────────────────

// PUT /api/chat/notifications/preferences/pause
export const pauseNotifications = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const workspaceId = req.workspaceId;
  const { duration, resumeAt, quietHoursEnabled, quietStart, quietEnd, timezone } = req.body;

  const pauseData = { active: true };

  if (resumeAt) {
    pauseData.resumeAt = new Date(resumeAt);
  } else if (duration) {
    // Duration in minutes
    const durationMs = parseInt(duration, 10) * 60 * 1000;
    pauseData.resumeAt = new Date(Date.now() + durationMs);
  }

  if (typeof quietHoursEnabled === 'boolean') {
    pauseData.quietHoursEnabled = quietHoursEnabled;
  }
  if (quietStart) pauseData.quietStart = quietStart;
  if (quietEnd) pauseData.quietEnd = quietEnd;
  if (timezone) pauseData.timezone = timezone;

  const updated = await NotificationPreference.setPause(userId, workspaceId, pauseData);

  // Broadcast to all devices
  emitToUser(userId.toString(), SOCKET_EVENTS.NOTIFICATION_PREFERENCES_UPDATED, {
    preferences: updated,
  }, workspaceId?.toString());

  res.json({ success: true, data: updated });
});

// POST /api/chat/notifications/preferences/resume
export const resumeNotifications = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const workspaceId = req.workspaceId;

  const updated = await NotificationPreference.setPause(userId, workspaceId, {
    active: false,
    resumeAt: null,
  });

  emitToUser(userId.toString(), SOCKET_EVENTS.NOTIFICATION_PREFERENCES_UPDATED, {
    preferences: updated,
  }, workspaceId?.toString());

  res.json({ success: true, data: updated });
});

// ─── Custom Keywords ─────────────────────────────────────────────────────────

// PUT /api/chat/notifications/preferences/keywords
export const updateKeywords = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const workspaceId = req.workspaceId;
  const { keywords } = req.body;

  if (!Array.isArray(keywords)) {
    return res.status(400).json({ success: false, error: { message: 'keywords must be an array' } });
  }

  const updated = await NotificationPreference.setKeywords(userId, workspaceId, keywords);
  res.json({ success: true, data: updated });
});

// ─── VIP Users ───────────────────────────────────────────────────────────────

// PUT /api/chat/notifications/preferences/vip
export const updateVIPUsers = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const workspaceId = req.workspaceId;
  const { vipUsers } = req.body;

  if (!Array.isArray(vipUsers)) {
    return res.status(400).json({ success: false, error: { message: 'vipUsers must be an array' } });
  }

  const updated = await NotificationPreference.findOneAndUpdate(
    { userId, workspaceId },
    { $set: { vipUsers } },
    { upsert: true, returnDocument: 'after' },
  );

  res.json({ success: true, data: updated });
});

// ─── Notification History ────────────────────────────────────────────────────

// GET /api/chat/notifications/history
export const getHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const workspaceId = req.workspaceId;
  const {
    type,
    category,
    channelId,
    isRead,
    page = 1,
    limit = 30,
  } = req.query;

  const filter = { recipientId: userId, workspaceId };

  if (type) filter.type = type;
  if (category) filter.category = category;
  if (channelId) filter.channelId = channelId;
  if (isRead !== undefined) filter.isRead = isRead === 'true';

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const limitNum = Math.min(parseInt(limit, 10), 100);

  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Notification.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      notifications,
      pagination: {
        page: parseInt(page, 10),
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    },
  });
});

export default {
  getPreferences,
  updatePreferences,
  updateChannelPreference,
  removeChannelPreference,
  pauseNotifications,
  resumeNotifications,
  updateKeywords,
  updateVIPUsers,
  getHistory,
};
