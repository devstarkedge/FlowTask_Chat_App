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
    enum: ['in_progress', 'archived', 'completed'],
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
    enum: ['none', 'daily', 'weekly', 'monthly'],
    default: 'none',
  },
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
    return { saved: false };
  }
  try {
    await this.create({ userId, messageId, channelId, workspaceId, type: 'saved_message' });
    return { saved: true };
  } catch (err) {
    if (err.code === 11000) {
      return { saved: true };
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
    channelId: data.channelId || null,
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
      populate: { path: 'authorId', select: 'name avatar' },
    })
    .populate('channelId', 'name type')
    .lean();
};

const SavedMessage = model('SavedMessage', savedMessageSchema);

export default SavedMessage;
