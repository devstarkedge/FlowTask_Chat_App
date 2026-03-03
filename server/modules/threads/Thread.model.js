import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Thread — represents a threaded discussion linked to a message and optionally a FlowTask entity.
 *
 * Mapping:
 *  - A FlowTask Card (task) maps to a Thread in the project's channel.
 *  - The rootMessageId points to the first message that started the thread.
 *  - participantIds tracks who has replied (for notification routing).
 *
 * Thread lifecycle:
 *  - Created when a FlowTask task event arrives, or when a user replies to a message.
 *  - Locked when the linked task is deleted (prevent new replies).
 *  - Resolved when task is marked complete (visual indicator, not locked).
 */

const flowTaskRefSchema = new Schema({
  taskId: { type: String, default: null },
  projectId: { type: String, default: null },
}, { _id: false });

const threadSchema = new Schema({
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
    // index: removed — covered by compound { workspaceId: 1, channelId: 1, lastReplyAt: -1 }
  },
  rootMessageId: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    required: true,
    unique: true,
  },
  // Links thread to a FlowTask task for event routing
  flowTaskRef: {
    type: flowTaskRefSchema,
    default: null,
  },
  title: {
    type: String,
    maxlength: 200,
    default: '',
  },
  participantIds: [{
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
  }],
  // ─── Denormalized counters ───
  replyCount: {
    type: Number,
    default: 0,
  },
  lastReplyAt: {
    type: Date,
    default: null,
  },
  lastReplyBy: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    default: null,
  },
  // ─── Thread state ───
  isLocked: {
    type: Boolean,
    default: false,
  },
  lockedAt: {
    type: Date,
    default: null,
  },
  lockedReason: {
    type: String,
    default: null,
  },
  isResolved: {
    type: Boolean,
    default: false,
  },
  resolvedAt: {
    type: Date,
    default: null,
  },
  resolvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    default: null,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// ─── Indexes (all workspace-scoped) ──────────────────────────────────────────
// Find thread by FlowTask task ID within workspace (idempotent thread creation)
threadSchema.index(
  { workspaceId: 1, 'flowTaskRef.taskId': 1 },
  { sparse: true, unique: true },
);
// Channel threads sorted by latest activity within workspace
threadSchema.index({ workspaceId: 1, channelId: 1, lastReplyAt: -1 });
// User's threads within workspace
threadSchema.index({ workspaceId: 1, participantIds: 1 });

// ─── Instance Methods ────────────────────────────────────────────────────────
threadSchema.methods.addParticipant = function (userId) {
  const idStr = userId.toString();
  if (!this.participantIds.some((p) => p.toString() === idStr)) {
    this.participantIds.push(userId);
  }
  return this;
};

threadSchema.methods.lock = function (reason = 'Task deleted') {
  this.isLocked = true;
  this.lockedAt = new Date();
  this.lockedReason = reason;
  return this;
};

threadSchema.methods.resolve = function (userId) {
  this.isResolved = true;
  this.resolvedAt = new Date();
  this.resolvedBy = userId;
  return this;
};

// ─── Static Methods ──────────────────────────────────────────────────────────
threadSchema.statics.findByTaskId = function (taskId, workspaceId) {
  const filter = { 'flowTaskRef.taskId': taskId };
  if (workspaceId) filter.workspaceId = workspaceId;
  return this.findOne(filter);
};

const Thread = model('Thread', threadSchema);

export default Thread;
