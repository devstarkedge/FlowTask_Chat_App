import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * ReadReceipt — tracks per-user, per-channel read position.
 *
 * Used to compute unread counts and render "new messages" dividers.
 * Compound unique index on (userId, channelId) ensures one record per user per channel.
 */

const readReceiptSchema = new Schema({
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

// ─── Indexes ─────────────────────────────────────────────────────────────────
// One receipt per user per channel
readReceiptSchema.index({ userId: 1, channelId: 1 }, { unique: true });
// All channel readers (for channel read indicators)
readReceiptSchema.index({ channelId: 1 });
// User's unread channels (for sidebar badges)
readReceiptSchema.index({ userId: 1, unreadCount: 1 });

// ─── Static Methods ──────────────────────────────────────────────────────────
readReceiptSchema.statics.getUnreadCounts = function (userId) {
  return this.find(
    { userId, unreadCount: { $gt: 0 } },
    { channelId: 1, unreadCount: 1, unreadMentionCount: 1, _id: 0 },
  ).lean();
};

readReceiptSchema.statics.markChannelAsRead = async function (userId, channelId, lastMessageId) {
  return this.findOneAndUpdate(
    { userId, channelId },
    {
      lastReadMessageId: lastMessageId,
      lastReadAt: new Date(),
      unreadCount: 0,
      unreadMentionCount: 0,
    },
    { upsert: true, new: true },
  );
};

readReceiptSchema.statics.incrementUnread = async function (channelId, excludeUserId, hasMention = false) {
  const update = { $inc: { unreadCount: 1 } };
  if (hasMention) {
    update.$inc.unreadMentionCount = 1;
  }

  return this.updateMany(
    {
      channelId,
      userId: { $ne: excludeUserId },
    },
    update,
  );
};

const ReadReceipt = model('ReadReceipt', readReceiptSchema);

export default ReadReceipt;
