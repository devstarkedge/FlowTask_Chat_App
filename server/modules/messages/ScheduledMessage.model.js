import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * ScheduledMessage — messages queued for future delivery.
 *
 * A cron job or BullMQ worker processes pending messages when scheduledAt ≤ now.
 * Once sent, status changes to 'sent' and the actual messageId is recorded.
 */

const scheduledMessageSchema = new Schema({
  channelId: {
    type: Schema.Types.ObjectId,
    ref: 'Channel',
    required: true,
  },
  authorId: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    required: true,
  },
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  content: {
    type: String,
    required: true,
    maxlength: 10000,
  },
  htmlContent: {
    type: String,
    maxlength: 50000,
    default: '',
  },
  threadId: {
    type: Schema.Types.ObjectId,
    ref: 'Thread',
    default: null,
  },
  scheduledAt: {
    type: Date,
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'cancelled', 'failed'],
    default: 'pending',
  },
  sentMessageId: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
  },
  failedReason: {
    type: String,
    default: null,
  },
}, {
  timestamps: true,
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
// Find pending messages due for delivery
scheduledMessageSchema.index({ status: 1, scheduledAt: 1 });
// User's scheduled messages
scheduledMessageSchema.index({ authorId: 1, workspaceId: 1, status: 1 });

// ─── Statics ─────────────────────────────────────────────────────────────────
scheduledMessageSchema.statics.findDueMessages = function (limit = 100) {
  return this.find({
    status: 'pending',
    scheduledAt: { $lte: new Date() },
  })
    .sort({ scheduledAt: 1 })
    .limit(limit);
};

scheduledMessageSchema.statics.markSent = function (id, messageId) {
  return this.findOneAndUpdate(
    { _id: id, status: { $in: ['pending', 'processing'] } },
    { status: 'sent', sentMessageId: messageId },
  );
};

scheduledMessageSchema.statics.markFailed = function (id, reason) {
  return this.findOneAndUpdate(
    { _id: id, status: { $in: ['pending', 'processing'] } },
    { status: 'failed', failedReason: reason },
  );
};

const ScheduledMessage = model('ScheduledMessage', scheduledMessageSchema);

export default ScheduledMessage;
