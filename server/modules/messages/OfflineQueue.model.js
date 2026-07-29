import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const offlineQueueSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'ChatUser',
      required: true,
      index: true,
    },
    clientMessageId: {
      type: String,
      required: true,
      unique: true,
    },
    channelId: {
      type: Schema.Types.ObjectId,
      ref: 'Channel',
      required: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'sending', 'failed'],
      default: 'pending',
    },
    retryCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

const OfflineQueue = mongoose.models.OfflineQueue || model('OfflineQueue', offlineQueueSchema);
export default OfflineQueue;
