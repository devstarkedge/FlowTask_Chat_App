import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const projectChannelSyncLockSchema = new Schema({
  scopeKey: { type: String, required: true, unique: true },
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  boardId: { type: String, required: true },
  leaseToken: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

projectChannelSyncLockSchema.index({ workspaceId: 1, boardId: 1 }, { unique: true });

export default model('ProjectChannelSyncLock', projectChannelSyncLockSchema);
