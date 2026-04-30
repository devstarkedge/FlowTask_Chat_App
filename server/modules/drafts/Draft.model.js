import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Draft — auto-saved message drafts for users.
 *
 * One active draft per user + conversation (channelId) + thread (threadId).
 * Synced across devices via socket events and cached in Redis for fast restore.
 */

const draftSchema = new Schema({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  channelId: {
    type: Schema.Types.ObjectId,
    ref: 'Channel',
    required: true,
  },
  threadId: {
    type: Schema.Types.ObjectId,
    ref: 'Thread',
    default: null,
  },
  senderId: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    required: true,
  },
  content: {
    type: String,
    default: '',
    maxlength: 10000,
  },
  htmlContent: {
    type: String,
    default: '',
    maxlength: 50000,
  },
  attachments: [{
    fileId: { type: Schema.Types.ObjectId, ref: 'FileAsset' },
    fileName: { type: String, maxlength: 255 },
    mimeType: { type: String, maxlength: 100 },
    fileSize: { type: Number },
    url: { type: String },
    thumbnailUrl: { type: String },
  }],
  mentions: [{
    targetId: { type: String },
    name: { type: String },
    type: { type: String, enum: ['user', 'channel'], default: 'user' },
  }],
  status: {
    type: String,
    enum: ['draft', 'converted'],
    default: 'draft',
  },
}, {
  timestamps: true,
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
// One active draft per user per conversation per thread
draftSchema.index(
  { workspaceId: 1, senderId: 1, channelId: 1, threadId: 1 },
  { unique: true },
);
// All drafts for a user in a workspace (sidebar query)
draftSchema.index({ workspaceId: 1, senderId: 1, status: 1, updatedAt: -1 });
// Auto-expire old drafts after 30 days
draftSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// ─── Statics ─────────────────────────────────────────────────────────────────

/**
 * Upsert a draft — creates or updates the single draft for this user+channel+thread.
 */
draftSchema.statics.upsertDraft = function (filter, update) {
  return this.findOneAndUpdate(
    filter,
    { $set: update, $setOnInsert: { createdAt: new Date() } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
};

/**
 * Get all active drafts for a user in a workspace.
 */
draftSchema.statics.getUserDrafts = function (senderId, workspaceId, { limit = 50, skip = 0 } = {}) {
  return this.find({
    senderId,
    workspaceId,
    status: 'draft',
  })
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

/**
 * Get draft for a specific conversation.
 */
draftSchema.statics.getConversationDraft = function (senderId, channelId, threadId, workspaceId) {
  return this.findOne({
    senderId,
    channelId,
    threadId: threadId || null,
    workspaceId,
    status: 'draft',
  }).lean();
};

/**
 * Remove a draft (on send or explicit delete).
 */
draftSchema.statics.removeDraft = function (draftId, senderId) {
  return this.findOneAndDelete({ _id: draftId, senderId });
};

/**
 * Remove draft by conversation (when message is sent).
 */
draftSchema.statics.removeByConversation = function (senderId, channelId, threadId, workspaceId) {
  return this.findOneAndDelete({
    senderId,
    channelId,
    threadId: threadId || null,
    workspaceId,
  });
};

/**
 * Count active drafts for sidebar badge.
 */
draftSchema.statics.countUserDrafts = function (senderId, workspaceId) {
  return this.countDocuments({ senderId, workspaceId, status: 'draft' });
};

const Draft = model('Draft', draftSchema);

export default Draft;
