import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * ChatUpload — files uploaded directly within the chat application.
 *
 * IMPORTANT: This is ONLY for files uploaded by users in chat.
 * FlowTask attachments are NEVER copied here — only URL metadata is stored
 * within Message.attachments with source = 'flowtask_link'.
 */

const chatUploadSchema = new Schema({
  channelId: {
    type: Schema.Types.ObjectId,
    ref: 'Channel',
    required: true,
    index: true,
  },
  messageId: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
  },
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    required: true,
  },
  fileName: {
    type: String,
    required: true,
  },
  originalName: {
    type: String,
    required: true,
  },
  mimeType: {
    type: String,
    required: true,
  },
  fileSize: {
    type: Number,
    required: true,
  },
  url: {
    type: String,
    required: true,
  },
  thumbnailUrl: {
    type: String,
    default: null,
  },
  // Storage key for cleanup/deletion
  storageKey: {
    type: String,
    required: true,
  },
}, {
  timestamps: true,
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
chatUploadSchema.index({ uploadedBy: 1, createdAt: -1 });
chatUploadSchema.index({ messageId: 1 }, { sparse: true });

const ChatUpload = model('ChatUpload', chatUploadSchema);

export default ChatUpload;
