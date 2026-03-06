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
    required: true,
  },
  channelId: {
    type: Schema.Types.ObjectId,
    ref: 'Channel',
    required: true,
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
  // Try delete first — if it existed, we unsaved
  const deleted = await this.findOneAndDelete({ userId, messageId });
  if (deleted) {
    return { saved: false };
  }
  // Not found — create (handle concurrent duplicate)
  try {
    await this.create({ userId, messageId, channelId, workspaceId });
    return { saved: true };
  } catch (err) {
    if (err.code === 11000) {
      // Race: another request saved it first — treat as already saved
      return { saved: true };
    }
    throw err;
  }
};

savedMessageSchema.statics.getUserSaved = async function (userId, workspaceId, { limit = 50, skip = 0 } = {}) {
  return this.find({ userId, workspaceId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'messageId',
      populate: { path: 'authorId', select: 'name avatar' },
    })
    .lean();
};

const SavedMessage = model('SavedMessage', savedMessageSchema);

export default SavedMessage;
