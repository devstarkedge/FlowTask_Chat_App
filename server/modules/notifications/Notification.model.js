import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Notification — persistent notification records for workspace-scoped events.
 *
 * Supports: mentions, DMs, channel invites, task updates, system alerts.
 * Auto-expires after 90 days via TTL index.
 */
const notificationSchema = new Schema({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  recipientId: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    required: true,
  },
  type: {
    type: String,
    enum: [
      'mention', 'dm', 'channel_invite', 'task_update', 'system', 'thread_reply',
      'group_message', 'channel_message', 'keyword_match', 'bot_alert',
      'workspace_invite', 'role_change', 'security_alert', 'call_invite',
    ],
    required: true,
  },
  // Notification priority for delivery decisions
  priority: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium',
  },
  // Category for filtering in notification center
  category: {
    type: String,
    enum: ['dm', 'mention', 'thread_reply', 'channel_message', 'bot', 'system', 'call_invite'],
    default: 'system',
  },
  // Bundle key for grouping multiple notifications (e.g. "channel:{channelId}")
  bundleKey: {
    type: String,
    default: null,
  },
  isBundled: {
    type: Boolean,
    default: false,
  },
  bundleCount: {
    type: Number,
    default: 1,
    min: 1,
  },
  title: {
    type: String,  
    maxlength: 200,
    default: '',
  },
  body: {
    type: String,
    maxlength: 500,
    default: '',
  },
  // Source references — what triggered this notification
  sourceType: {
    type: String,
    enum: ['message', 'channel', 'thread', 'workspace', 'task'],
    default: null,
  },
  sourceId: {
    type: Schema.Types.ObjectId,
    default: null,
  },
  channelId: {
    type: Schema.Types.ObjectId,
    ref: 'Channel',
    default: null,
  },
  threadId: {
    type: Schema.Types.ObjectId,
    ref: 'Thread',
    default: null,
  },
  senderId: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    default: null,
  },
  senderName: {
    type: String,
    maxlength: 100,
    default: null,
  },
  senderAvatar: {
    type: String,
    default: null,
  },
  channelName: {
    type: String,
    maxlength: 100,
    default: null,
  },
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Channel',
    default: null,
  },
  conversationType: {
    type: String,
    enum: ['channel', 'dm'],
    default: 'channel',
  },
  messagePreview: {
    type: String,
    maxlength: 500,
    default: '',
  },
  // Structured deep-link data for exact navigation on click
  deepLink: {
    workspaceId: { type: Schema.Types.ObjectId, default: null },
    channelId: { type: Schema.Types.ObjectId, default: null },
    messageId: { type: Schema.Types.ObjectId, default: null },
    threadId: { type: Schema.Types.ObjectId, default: null },
    type: {
      type: String,
      enum: ['channel', 'dm', 'thread', 'workspace', 'task'],
      default: 'channel',
    },
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  readAt: {
    type: Date,
    default: null,
  },
  // Push delivery tracking
  pushSentAt: {
    type: Date,
    default: null,
  },
  pushDismissedAt: {
    type: Date,
    default: null,
  },
  // Auto-expire after 90 days
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  },
}, {
  timestamps: true,
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
// Primary query: user's notifications sorted by newest first
notificationSchema.index({ workspaceId: 1, recipientId: 1, createdAt: -1 });
// Unread count query
notificationSchema.index({ workspaceId: 1, recipientId: 1, isRead: 1 });
// TTL index for auto-expiry
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ─── Static Methods ──────────────────────────────────────────────────────────

/**
 * Get notifications for a user with cursor-based pagination.
 */
notificationSchema.statics.getForUser = function (recipientId, workspaceId, { cursor, limit = 30 } = {}) {
  const filter = { recipientId, workspaceId };
  if (cursor) {
    filter._id = { $lt: cursor };
  }
  return this.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .lean();
};

/**
 * Get unread notification count for a user in a workspace.
 */
notificationSchema.statics.getUnreadCount = function (recipientId, workspaceId) {
  return this.countDocuments({ recipientId, workspaceId, isRead: false });
};

/**
 * Mark a single notification as read.
 */
notificationSchema.statics.markRead = function (notificationId, recipientId, workspaceId) {
  return this.findOneAndUpdate(
    { _id: notificationId, recipientId, workspaceId },
    { $set: { isRead: true, readAt: new Date() } },
    { returnDocument: 'after' },
  );
};

/**
 * Mark all notifications as read for a user in a workspace.
 */
notificationSchema.statics.markAllRead = function (recipientId, workspaceId) {
  return this.updateMany(
    { recipientId, workspaceId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );
};

/**
 * Get unread count per workspace for a user (for workspace switcher badges).
 */
notificationSchema.statics.getUnreadCountsByWorkspace = async function (recipientId) {
  return this.aggregate([
    { $match: { recipientId: new mongoose.Types.ObjectId(recipientId), isRead: false } },
    { $group: { _id: '$workspaceId', count: { $sum: 1 } } },
  ]);
};

const Notification = model('Notification', notificationSchema);

export default Notification;
