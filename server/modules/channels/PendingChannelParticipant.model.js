import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const pendingChannelParticipantSchema = new Schema({
  channelId: { type: Schema.Types.ObjectId, ref: 'Channel', required: true },
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  flowTaskUserId: { type: String, required: true, trim: true },
  normalizedEmail: { type: String, default: '', lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  avatar: { type: String, default: null },
  role: { type: String, default: 'employee' },
  sources: [{ type: String }],
  isActive: { type: Boolean, default: true },
  convertedToUserId: { type: Schema.Types.ObjectId, ref: 'ChatUser', default: null },
  convertedAt: { type: Date, default: null },
}, { timestamps: true });

pendingChannelParticipantSchema.index(
  { channelId: 1, flowTaskUserId: 1 },
  { unique: true },
);
pendingChannelParticipantSchema.index(
  { workspaceId: 1, normalizedEmail: 1, isActive: 1 },
);
pendingChannelParticipantSchema.index(
  { workspaceId: 1, flowTaskUserId: 1, isActive: 1 },
);

export default model('PendingChannelParticipant', pendingChannelParticipantSchema);
