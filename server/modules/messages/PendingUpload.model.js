import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const pendingUploadSchema = new Schema(
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
    uploadId: {
      type: String,
      required: true,
      unique: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['uploading', 'paused', 'completed', 'failed', 'cancelled'],
      default: 'uploading',
    },
    progress: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

const PendingUpload = mongoose.models.PendingUpload || model('PendingUpload', pendingUploadSchema);
export default PendingUpload;
