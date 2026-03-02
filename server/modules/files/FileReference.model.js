import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * FileReference — Links a FileAsset to its usage context (Message, Thread, etc.).
 * Allows a single file to be reused across different messages without duplicating storage.
 */
const fileReferenceSchema = new Schema({
  fileId: { 
    type: Schema.Types.ObjectId, 
    ref: 'FileAsset', 
    required: true,
    // index: removed — covered by compound { fileId: 1, createdAt: -1 }
  },
  channelId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Channel', 
    index: true 
  },
  messageId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Message',
    // index: removed — covered by compound { messageId: 1, fileId: 1 }
    sparse: true
  },
  threadId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Thread',
    // index: removed — covered by compound { threadId: 1, fileId: 1 }
    sparse: true
  },
  referencedBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'ChatUser', 
    required: true 
  },
  contextType: { 
    type: String, 
    enum: ['channel', 'dm', 'thread'], 
    required: true 
  },
}, {
  timestamps: true,
});

// To easily lookup references for a file
fileReferenceSchema.index({ fileId: 1, createdAt: -1 });

// Prevent exact duplicate references linking same file to same message
// Using partialFilterExpression instead of sparse so null values are completely ignored by the unique constraint
fileReferenceSchema.index(
  { messageId: 1, fileId: 1 },
  { unique: true, partialFilterExpression: { messageId: { $type: 'objectId' } } }
);

fileReferenceSchema.index(
  { threadId: 1, fileId: 1 },
  { unique: true, partialFilterExpression: { threadId: { $type: 'objectId' } } }
);

const FileReference = model('FileReference', fileReferenceSchema);

export default FileReference;
