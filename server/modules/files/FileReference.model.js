import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * FileReference — Links a FileAsset to its usage context (Message, Thread, etc.).
 * Allows a single file to be reused across different messages without duplicating storage.
 */
const fileReferenceSchema = new Schema({
  // ─── Workspace Scope (multi-tenant isolation) ─────────────────────────────
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true,
  },

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

// Workspace-scoped indexes
fileReferenceSchema.index({ workspaceId: 1, fileId: 1, createdAt: -1 });
fileReferenceSchema.index({ workspaceId: 1, channelId: 1 });

// Prevent exact duplicate references linking same file to same message within workspace
fileReferenceSchema.index(
  { workspaceId: 1, messageId: 1, fileId: 1 },
  { unique: true, partialFilterExpression: { messageId: { $type: 'objectId' } } }
);

fileReferenceSchema.index(
  { workspaceId: 1, threadId: 1, fileId: 1 },
  { unique: true, partialFilterExpression: { threadId: { $type: 'objectId' } } }
);

// Index messageId alone to accelerate population queries that lookup
// FileReference documents by messageId (populates use messageId $in [...])
fileReferenceSchema.index({ messageId: 1 });

const FileReference = model('FileReference', fileReferenceSchema);

export default FileReference;
