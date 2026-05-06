import mongoose from 'mongoose';
import {
  MESSAGE_CONTENT_TYPES,
  ATTACHMENT_SOURCES,
  MENTION_TYPES,
} from '../../config/constants.js';

const { Schema, model } = mongoose;

/**
 * Message — individual chat message within a channel or thread.
 *
 * Design decisions:
 *  - Reactions are embedded (6-10 types max, avoids join overhead)
 *  - Attachments are embedded (max ~10 per message in practice)
 *  - Soft-delete preserves audit trail and thread integrity
 *  - Edit history capped at 10 entries per spec
 *  - FlowTask references link messages to originating domain events
 */

const attachmentSchema = new Schema({
  fileName: { type: String, required: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  fileSize: { type: Number, required: true },
  url: { type: String, required: true },
  thumbnailUrl: { type: String, default: null },
  source: {
    type: String,
    enum: Object.values(ATTACHMENT_SOURCES),
    required: true,
  },
  // Only populated for FlowTask-linked files — metadata reference only, never copied
  flowTaskAttachmentId: { type: String, default: null },
}, { _id: true });

const mentionSchema = new Schema({
  type: {
    type: String,
    enum: Object.values(MENTION_TYPES),
    required: true,
  },
  targetId: { type: String, required: true },
  name: { type: String, required: true },
}, { _id: false });

const reactionSchema = new Schema({
  emoji: {
    type: String,
    required: true,
  },
  userIds: [{
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
  }],
  count: {
    type: Number,
    default: 0,
  },
}, { _id: false });

const editHistorySchema = new Schema({
  content: { type: String, required: true },
  htmlContent: { type: String },
  editedAt: { type: Date, default: Date.now },
  editedBy: { type: Schema.Types.ObjectId, ref: 'ChatUser' },
}, { _id: false });

const flowTaskRefSchema = new Schema({
  entityType: {
    type: String,
    enum: ['card', 'comment', 'board', 'announcement', 'subtask'],
  },
  entityId: { type: String },
}, { _id: false });

const activityMetaSchema = new Schema({
  eventType: {
    type: String,
    enum: [
      'TASK_CREATED', 'TASK_UPDATED', 'TASK_DELETED',
      'TASK_ASSIGNED', 'TASK_COMMENTED', 'TASK_STATUS_CHANGED',
      'TASK_DUE_DATE_CHANGED', 'TIME_ENTRY_ADDED', 'TIME_ENTRY_UPDATED', 'TIME_ENTRY_DELETED',
      'LOGGED_TIME_ADDED', 'LOGGED_TIME_UPDATED', 'LOGGED_TIME_DELETED',
      'ESTIMATED_TIME_ADDED', 'ESTIMATED_TIME_UPDATED', 'ESTIMATED_TIME_DELETED',
      'BILLED_TIME_ADDED', 'BILLED_TIME_UPDATED', 'BILLED_TIME_DELETED',
      'ANNOUNCEMENT_CREATED',
      'SUBTASK_CREATED', 'SUBTASK_COMPLETED', 'SUBTASK_DELETED',
      'SUBTASK_UPDATED',
      'NANO_CREATED', 'NANO_COMPLETED', 'NANO_DELETED',
      'ATTACHMENT_ADDED',
    ],
  },
  taskId: { type: String, default: null },
  projectId: { type: String, default: null },
  departmentId: { type: String, default: null },
  projectName: { type: String, default: null },
  taskTitle: { type: String, default: null },
  actorName: { type: String, default: null },
  actionType: { type: String, default: null },
  entryType: { type: String, default: null },
  entityType: { type: String, default: null },
  entityName: { type: String, default: null },
  entryNote: { type: String, default: null },
  oldValue: { type: String, default: null },
  newValue: { type: String, default: null },
  currentMinutes: { type: Number, default: null },
  previousMinutes: { type: Number, default: null },
  totalMinutes: { type: Number, default: null },
  loggedTotalMinutes: { type: Number, default: null },
  estimationTotalMinutes: { type: Number, default: null },
  billedTotalMinutes: { type: Number, default: null },
  actorAvatar: { type: String, default: null },
  announcementId: { type: String, default: null },
  announcementTitle: { type: String, default: null },
  announcementDescription: { type: String, default: null },
  category: { type: String, default: null },
  priority: { type: String, default: null },
  // Field-level diffs for TASK_UPDATED: { title: {old, new}, priority: {old, new}, ... }
  changedFields: { type: Schema.Types.Mixed, default: null },
  // Subtask/nano hierarchy
  subtaskTitle: { type: String, default: null },
  parentTaskTitle: { type: String, default: null },
  nanoTitle: { type: String, default: null },
  // Attachment info
  fileName: { type: String, default: null },
}, { _id: false });

const messageSchema = new Schema({
  // ─── Workspace Scope (multi-tenant isolation) ─────────────────────────
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true,
  },

  channelId: {
    type: Schema.Types.ObjectId,
    ref: 'Channel',
    required: true,
    // index: removed — covered by compound { workspaceId: 1, channelId: 1, createdAt: -1 }
  },
  // If this message is a thread reply, threadId points to the Thread document.
  // Root messages have threadId = null.
  threadId: {
    type: Schema.Types.ObjectId,
    ref: 'Thread',
    default: null,
    // index: removed — covered by compound { threadId: 1, createdAt: 1 }
  },
  authorId: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    required: true,
  },
  // Denormalized sender snapshot — avoids populate on reads
  senderSnapshot: {
    name: { type: String },
    avatar: { type: String, default: null },
  },
  content: {
    type: String,
    maxlength: 10000,
    default: '',
  },
  htmlContent: {
    type: String,
    maxlength: 50000,
    default: '',
  },
  contentType: {
    type: String,
    enum: Object.values(MESSAGE_CONTENT_TYPES),
    default: MESSAGE_CONTENT_TYPES.TEXT,
  },
  // Links message to a FlowTask entity (task, comment, etc.)
  flowTaskRef: {
    type: flowTaskRefSchema,
    default: null,
  },
  // Structured metadata for activity/system messages (UI rendering context)
  activityMeta: {
    type: activityMetaSchema,
    default: null,
  },
  attachments: {
    type: [attachmentSchema],
    default: [],
    validate: {
      validator: (v) => v.length <= 10,
      message: 'Maximum 10 attachments per message',
    },
  },
  mentions: {
    type: [mentionSchema],
    default: [],
  },
  reactions: {
    type: [reactionSchema],
    default: [],
  },
  // ─── Delivery Status (DM-only) ───
  status: {
    type: String,
    enum: ['sending', 'sent', 'delivered', 'seen'],
    default: 'sent',
  },
  deliveredAt: {
    type: Date,
    default: null,
  },
  seenAt: {
    type: Date,
    default: null,
  },
  readBy: [{
    userId: { type: Schema.Types.ObjectId, ref: 'ChatUser' },
    readAt: { type: Date, default: Date.now },
  }],

  // Denormalized reply count (for root messages that start threads)
  replyCount: {
    type: Number,
    default: 0,
  },

  // ─── Edit tracking ───
  isEdited: {
    type: Boolean,
    default: false,
  },
  editHistory: {
    type: [editHistorySchema],
    default: [],
    validate: {
      validator: (v) => v.length <= 10,
      message: 'Maximum 10 edit history entries',
    },
  },

  // ─── Pinning ───
  isPinned: {
    type: Boolean,
    default: false,
  },
  pinnedBy: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    default: null,
  },
  pinnedAt: {
    type: Date,
    default: null,
  },

  // ─── Soft delete ───
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  deletedBy: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    default: null,
  },
  visibleTo: [{
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    index: true
  }],
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// ─── Indexes (all workspace-scoped) ──────────────────────────────────────────
// Primary query: channel messages ordered by time (cursor-based pagination)
messageSchema.index({ workspaceId: 1, channelId: 1, createdAt: -1 });
// Thread replies ordered by time
messageSchema.index({ workspaceId: 1, threadId: 1, createdAt: 1 }, { sparse: true });
// Author's messages (for user activity view)
messageSchema.index({ workspaceId: 1, authorId: 1, createdAt: -1 });
// Pinned messages per channel
messageSchema.index({ workspaceId: 1, channelId: 1, isPinned: 1 }, { sparse: true });
// FlowTask entity reference lookup (find messages for a specific task)
messageSchema.index(
  { workspaceId: 1, 'flowTaskRef.entityType': 1, 'flowTaskRef.entityId': 1 },
  { sparse: true },
);
// Full-text search
messageSchema.index({ content: 'text' });
// Workspace + time for global workspace queries
messageSchema.index({ workspaceId: 1, createdAt: -1 });
// Delivery status lookup for DM channels
messageSchema.index({ workspaceId: 1, channelId: 1, status: 1 }, { sparse: true });
// Partial index for active (non-deleted) messages
messageSchema.index(
  { workspaceId: 1, channelId: 1, createdAt: -1, isDeleted: 1 },
  { partialFilterExpression: { isDeleted: false } },
);
messageSchema.index({ workspaceId: 1, channelId: 1, visibleTo: 1 });

// ─── Virtuals ────────────────────────────────────────────────────────────────
messageSchema.virtual('author', {
  ref: 'ChatUser',
  localField: 'authorId',
  foreignField: '_id',
  justOne: true,
});

messageSchema.virtual('fileReferences', {
  ref: 'FileReference',
  localField: '_id',
  foreignField: 'messageId',
});

// ─── Instance Methods ────────────────────────────────────────────────────────
messageSchema.methods.addReaction = function (emoji, userId) {
  const existing = this.reactions.find((r) => r.emoji === emoji);
  if (existing) {
    if (!existing.userIds.some((id) => id.toString() === userId.toString())) {
      existing.userIds.push(userId);
      existing.count = existing.userIds.length;
    }
  } else {
    this.reactions.push({ emoji, userIds: [userId], count: 1 });
  }
  return this;
};

messageSchema.methods.removeReaction = function (emoji, userId) {
  const existing = this.reactions.find((r) => r.emoji === emoji);
  if (existing) {
    existing.userIds = existing.userIds.filter((id) => id.toString() !== userId.toString());
    existing.count = existing.userIds.length;
    if (existing.count === 0) {
      this.reactions = this.reactions.filter((r) => r.emoji !== emoji);
    }
  }
  return this;
};

const Message = model('Message', messageSchema);

export default Message;