import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * ReadReceipt — tracks per-user, per-channel unread counts and per-message
 * delivery/read status.
 *
 * Two usage modes (unified in one collection):
 *  1. Channel-level unread tracking  → (userId + channelId) unique document
 *     Fields: unreadCount, unreadMentionCount, lastReadMessageId, lastReadAt
 *
 *  2. Per-message delivery/read status → (userId + channelId + messageId) unique document
 *     Fields: deliveredAt, readAt
 *
 * Both modes share workspaceId for multi-tenant isolation.
 */

const readReceiptSchema = new Schema(
  {
    // ─── Workspace Scope ───────────────────────────────────────────────────────
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },

    // ─── Core References ──────────────────────────────────────────────────────
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

    // Present only for per-message receipts; null for channel-level documents
    messageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },

    // ─── Channel-level Unread Tracking ────────────────────────────────────────
    unreadCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    unreadMentionCount: {
      type: Number,
      default: 0,
      min: 0,
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

    // ─── Per-message Delivery / Read Status ───────────────────────────────────
    deliveredAt: {
      type: Date,
      default: null,
    },

    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Channel-level unread lookup (primary query pattern from repository)
readReceiptSchema.index({ workspaceId: 1, userId: 1, channelId: 1 }, { unique: true, sparse: true, partialFilterExpression: { messageId: null } });

// Per-message receipt lookup (used by service for getMessageInfo / markAsRead)
readReceiptSchema.index({ workspaceId: 1, messageId: 1, channelId: 1 }, { sparse: true });

// Compound index for fast per-message status upsert and uniqueness
readReceiptSchema.index({ workspaceId: 1, channelId: 1, messageId: 1, userId: 1 }, { unique: true });

// All unread channels for a user (getUnreadCounts query)
readReceiptSchema.index({ workspaceId: 1, userId: 1, unreadCount: 1 });

// All readers in a channel (getChannelReaders query)
readReceiptSchema.index({ workspaceId: 1, channelId: 1 });

const ReadReceipt =
  mongoose.models.ReadReceipt || model('ReadReceipt', readReceiptSchema);

export default ReadReceipt;
