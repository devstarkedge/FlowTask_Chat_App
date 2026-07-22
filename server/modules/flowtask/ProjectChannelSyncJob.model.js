import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const boardResultSchema = new Schema({
  boardId: { type: String, required: true },
  boardName: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'skipped'],
    required: true,
  },
  created: { type: Boolean, default: false },
  retryable: { type: Boolean, default: false },
  error: { type: String, default: null },
}, { _id: false });

const projectChannelSyncJobSchema = new Schema({
  scopeKey: { type: String, required: true, unique: true },
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  chatUserId: { type: Schema.Types.ObjectId, ref: 'ChatUser', required: true },
  flowTaskUserId: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'partial', 'failed'],
    default: 'pending',
    index: true,
  },
  generation: { type: Number, default: 1 },
  reason: { type: String, default: 'login' },
  requestId: { type: String, default: null },
  requestedAt: { type: Date, default: Date.now },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  heartbeatAt: { type: Date, default: null },
  nextAttemptAt: { type: Date, default: Date.now },
  attempts: { type: Number, default: 0 },
  totalBoards: { type: Number, default: 0 },
  completedBoards: { type: Number, default: 0 },
  failedBoards: { type: Number, default: 0 },
  retryBoardIds: [{ type: String }],
  boardResults: [boardResultSchema],
  lastError: { type: String, default: null },
  leaseToken: { type: String, default: null },
  leaseExpiresAt: { type: Date, default: null },
}, { timestamps: true });

projectChannelSyncJobSchema.index({ workspaceId: 1, flowTaskUserId: 1 }, { unique: true });
projectChannelSyncJobSchema.index({ status: 1, nextAttemptAt: 1 });
projectChannelSyncJobSchema.index({ status: 1, leaseExpiresAt: 1 });

export default model('ProjectChannelSyncJob', projectChannelSyncJobSchema);
