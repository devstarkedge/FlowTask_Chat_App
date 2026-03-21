import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * ReadReceipt — tracks per-user, per-channel read position.
 *
 * Used to compute unread counts and render "new messages" dividers.
 * Compound unique index on (userId, channelId) ensures one record per user per channel.
 */

const readReceiptSchema = new Schema({
  // ─── Workspace Scope (multi-tenant isolation) ─────────────────────────────
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true,
  },

  userId: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    required: true,
  },
  channelId: {
    type: Schema.Types.ObjectId,
    ref: 'Channel',
    required: true,
  },
  lastReadMessageId: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
  },
  lastReadAt: {
    type: Date,
    default: null,
  },
  unreadCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Track mentions that the user hasn't acknowledged
  unreadMentionCount: {
    type: Number,
    default: 0,
    min: 0,
  },
}, {
  timestamps: true,
});

// ─── Indexes (all workspace-scoped) ──────────────────────────────────────────
// One receipt per user per channel per workspace
readReceiptSchema.index({ workspaceId: 1, userId: 1, channelId: 1 }, { unique: true });
// All channel readers within workspace (for channel read indicators)
readReceiptSchema.index({ workspaceId: 1, channelId: 1 });
// User's unread channels within workspace (for sidebar badges)
readReceiptSchema.index({ workspaceId: 1, userId: 1, unreadCount: 1 });

// ─── Static Methods ──────────────────────────────────────────────────────────
readReceiptSchema.statics.getUnreadCounts = function (userId, workspaceId) {
  const filter = { userId, workspaceId, unreadCount: { $gt: 0 } };
  return this.find(
    filter,
    { channelId: 1, unreadCount: 1, unreadMentionCount: 1, lastReadMessageId: 1, _id: 0 },
  ).populate('channelId', 'lastMessageAt lastMessagePreview').lean();
};

readReceiptSchema.statics.markChannelAsRead = async function (userId, channelId, lastMessageId, workspaceId) {
  const filter = { userId, channelId, workspaceId };
  return this.findOneAndUpdate(
    filter,
    {
      lastReadMessageId: lastMessageId,
      lastReadAt: new Date(),
      unreadCount: 0,
      unreadMentionCount: 0,
      workspaceId,
    },
    { upsert: true, new: true },
  );
};

readReceiptSchema.statics.incrementUnread = async function (channelId, excludeUserId, hasMention = false, workspaceId) {
  const update = { $inc: { unreadCount: 1 } };
  if (hasMention) {
    update.$inc.unreadMentionCount = 1;
  }
  const filter = {
    channelId,
    workspaceId,
    userId: { $ne: excludeUserId },
  };
  return this.updateMany(filter, update);
};

const ReadReceipt = model('ReadReceipt', readReceiptSchema);

export default ReadReceipt;
