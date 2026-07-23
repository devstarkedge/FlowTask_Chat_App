import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const flowTaskAuthAttemptSchema = new Schema({
  attemptId: { type: String, required: true, unique: true },
  tokenDigest: { type: String, required: true },
  requestId: { type: String, required: true },
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'processing',
    index: true,
  },
  responseStatus: { type: Number, default: null },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

flowTaskAuthAttemptSchema.statics.claim = async function ({ attemptId, tokenDigest, requestId }) {
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
  try {
    const doc = await this.create({ attemptId, tokenDigest, requestId, expiresAt });
    return { acquired: true, doc };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await this.findOne({ attemptId }).lean();
    return { acquired: false, doc: existing };
  }
};

flowTaskAuthAttemptSchema.statics.markCompleted = function (attemptId, responseStatus = 200) {
  return this.updateOne(
    { attemptId },
    {
      $set: {
        status: 'completed',
        responseStatus,
        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
      },
    },
  );
};

flowTaskAuthAttemptSchema.statics.markFailed = function (attemptId, responseStatus = 500) {
  return this.updateOne(
    { attemptId },
    {
      $set: {
        status: 'failed',
        responseStatus,
        expiresAt: new Date(Date.now() + 15 * 1000),
      },
    },
  );
};

export default model('FlowTaskAuthAttempt', flowTaskAuthAttemptSchema);
