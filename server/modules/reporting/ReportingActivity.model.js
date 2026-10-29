import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  channelId: { type: mongoose.Schema.Types.ObjectId, required: true },
  checkInMessageId: { type: mongoose.Schema.Types.ObjectId, required: true },
  attendanceSessionId: { type: String, required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, required: true },
  eventId: { type: String, required: true },
  eventType: { type: String, required: true },
  occurredAt: { type: Date, required: true },
  sequence: { type: Number, default: 0 },
  digest: { type: String, required: true },
  // User-entered work descriptions use the existing workspace encryption.
  payloadCipher: { type: String, required: true, select: false },
  legacy: { type: Boolean, default: false },
  legacyMessageId: { type: mongoose.Schema.Types.ObjectId, default: null },
}, { timestamps: true });
schema.index({ workspaceId: 1, channelId: 1, eventId: 1 }, { unique: true });
schema.index({ workspaceId: 1, checkInMessageId: 1, occurredAt: 1, sequence: 1, eventId: 1 });
export default mongoose.models.ReportingActivity || mongoose.model('ReportingActivity', schema);
