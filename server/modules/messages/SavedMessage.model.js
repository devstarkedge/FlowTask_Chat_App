import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * SavedMessage — user bookmarks / saved messages (Slack "Later" feature).
 *
 * One document per user-message pair. Users can save messages from any channel
 * they have access to and retrieve them later.
 */

const savedMessageSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    required: true,
  },
  messageId: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
  },
  type: {
    type: String,
    enum: ['saved_message', 'standalone'],
    default: 'saved_message',
  },
  title: {
    type: String,
    maxlength: 200,
    default: '',
  },
  channelId: {
    type: Schema.Types.ObjectId,
    ref: 'Channel',
    default: null,
  },
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  note: {
    type: String,
    maxlength: 500,
    default: '',
  },
  reminderAt: {
    type: Date,
    default: null,
  },
  reminderDescription: {
    type: String,
    maxlength: 1000,
    default: '',
  },
  status: {
    type: String,
    enum: ['in_progress', 'archived', 'completed', 'dismissed'],
    default: 'in_progress',
  },
  notificationSent: {
    type: Boolean,
    default: false,
  },
  overdueNotificationSent: {
    type: Boolean,
    default: false,
  },
  recurrence: {
    type: String,
    enum: ['none', 'daily', 'weekly', 'monthly', 'yearly'],
    default: 'none',
  },
  // Advanced fields for enhanced reminders
  recurrenceRule: {
    // RFC RRULE string (optional) for complex/custom recurrence
    type: String,
    default: null,
  },
  recurrenceMeta: {
    // JSON object with recurrence details { frequency, interval, byWeekday, byMonthDay, until }
    type: Schema.Types.Mixed,
    default: null,
  },
  timezone: {
    type: String,
    default: 'UTC',
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  },
  tags: {
    type: [String],
    default: [],
  },
  attachments: [{ type: Schema.Types.ObjectId, ref: 'FileAsset' }],
  // Snooze support
  snoozedUntil: { type: Date, default: null },
  snoozeHistory: { type: [Schema.Types.Mixed], default: [] },
  // Scope of reminder (personal, channel-wide, linked to lists/canvas)
  scope: {
    type: String,
    enum: ['personal', 'channel', 'list', 'canvas'],
    default: 'personal',
  },
  // Generic references for linking reminders to tasks/canvas blocks
  linkedTaskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
  canvasRef: { type: Schema.Types.Mixed, default: null },
  // Mention targets for channel reminders (user/role/channel)
  mentionTargets: { type: [Schema.Types.Mixed], default: [] },
}, {
  timestamps: true,
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
// Unique: one save per user per message
savedMessageSchema.index({ userId: 1, messageId: 1 }, { unique: true });
// User's saved messages sorted by newest
savedMessageSchema.index({ userId: 1, workspaceId: 1, createdAt: -1 });

// ─── Statics ─────────────────────────────────────────────────────────────────
savedMessageSchema.statics.toggle = async function (userId, messageId, channelId, workspaceId) {
  const deleted = await this.findOneAndDelete({ userId, messageId });
  if (deleted) {
    return { saved: false, savedMessageId: deleted._id };
  }
  try {
    const created = await this.create({ userId, messageId, channelId, workspaceId, type: 'saved_message' });
    return { saved: true, savedMessageId: created._id };
  } catch (err) {
    if (err.code === 11000) {
      // Race condition: another request already saved — treat as saved
      const existing = await this.findOne({ userId, messageId }).select('_id').lean();
      return { saved: true, savedMessageId: existing?._id || null };
    }
    throw err;
  }
};

savedMessageSchema.statics.createStandalone = async function (userId, workspaceId, data) {
  return this.create({
    userId,
    workspaceId,
    type: 'standalone',
    title: data.title,
    reminderAt: data.reminderAt,
    reminderDescription: data.reminderDescription || '',
    recurrence: data.recurrence || 'none',
    recurrenceRule: data.recurrenceRule || null,
    recurrenceMeta: data.recurrenceMeta || null,
    timezone: data.timezone || 'UTC',
    priority: data.priority || 'medium',
    tags: data.tags || [],
    attachments: data.attachments || [],
    channelId: data.channelId || null,
    scope: data.scope || 'personal',
    linkedTaskId: data.linkedTaskId || null,
    canvasRef: data.canvasRef || null,
    mentionTargets: data.mentionTargets || [],
  });
};

savedMessageSchema.statics.getUserSaved = async function (userId, workspaceId, { limit = 50, skip = 0, status = null } = {}) {
  const query = { userId, workspaceId };
  if (status) query.status = status;
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'messageId',
      populate: [
        { path: 'authorId', select: 'name avatar' },
        { path: 'fileReferences', populate: { path: 'fileId' } }
      ],
    })
    .populate('channelId', 'name type')
    .lean();
};

const SavedMessage = model('SavedMessage', savedMessageSchema);

export default SavedMessage;
