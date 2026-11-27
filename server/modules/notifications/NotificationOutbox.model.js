import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const notificationOutboxSchema = new Schema({
  dedupKey: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  eventKey: {
    type: String,
    required: true,
    index: true,
  },
  notificationId: {
    type: Schema.Types.ObjectId,
    ref: 'Notification',
    required: true,
    index: true,
  },
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  recipientId: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    required: true,
    index: true,
  },
  installationId: {
    type: String,
    required: true,
    index: true,
  },
  channelId: {
    type: Schema.Types.ObjectId,
    ref: 'Channel',
    default: null,
    index: true,
  },
  messageId: {
    type: Schema.Types.ObjectId,
    default: null,
  },
  platform: {
    type: String,
    default: 'expo',
  },
  deliveryChannel: {
    type: String,
    enum: ['expo', 'fcm', 'webpush'],
    default: 'expo',
  },
  pushToken: {
    type: String,
    default: null,
  },
  tokenFingerprint: {
    type: String,
    default: null,
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'sent', 'cancelled', 'failed', 'expired'],
    default: 'pending',
    index: true,
  },
  cancelReason: {
    type: String,
    default: null,
  },
  scheduledAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 86400 },
  },
  attempts: {
    type: Number,
    default: 0,
  },
  maxAttempts: {
    type: Number,
    default: 5,
  },
  nextAttemptAt: {
    type: Date,
    default: Date.now,
  },
  lastError: {
    type: String,
    default: null,
  },
  payload: {
    type: Schema.Types.Mixed,
    default: {},
  },
  sentAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

notificationOutboxSchema.index({ status: 1, scheduledAt: 1, nextAttemptAt: 1 });
notificationOutboxSchema.index({ recipientId: 1, channelId: 1, status: 1 });
notificationOutboxSchema.index({ recipientId: 1, status: 1, scheduledAt: 1 });

const NotificationOutbox = model('NotificationOutbox', notificationOutboxSchema);
export default NotificationOutbox;
