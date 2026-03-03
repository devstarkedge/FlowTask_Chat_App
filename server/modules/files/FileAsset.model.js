import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * FileAsset — Enterprise file model serving as single source of truth.
 * Separates the file storage logic from the context of where the file is used.
 */
const fileAssetSchema = new Schema({
  // ─── Workspace Scope (multi-tenant isolation) ─────────────────────────────
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true,
  },

  publicId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  }, // Cloudinary or other provider's unique ID
  secureUrl: { 
    type: String, 
    required: true 
  },
  resourceType: { 
    type: String, 
    enum: ['image', 'video', 'raw', 'auto'],
    required: true 
  },
  mimeType: { 
    type: String, 
    required: true 
  },
  fileSize: { 
    type: Number, 
    required: true 
  },
  originalName: { 
    type: String, 
    required: true 
  },
  uploadedBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'ChatUser', 
    required: true 
  },
  storageProvider: { 
    type: String, 
    default: 'cloudinary' 
  },
  folderPath: { 
    type: String, 
    default: 'enterprise_attachments' 
  },
  checksumHash: { 
    type: String, 
    required: true, 
    index: true 
  }, // SHA-256 hash to prevent duplicate uploads
  thumbnailUrl: { 
    type: String, 
    default: null 
  },
  metadata: { 
    type: Schema.Types.Mixed, 
    default: {} 
  }, // Dimensions, duration, etc.
  status: {
    type: String,
    enum: ['uploading', 'available', 'archived', 'deleted'],
    default: 'available',
  }
}, {
  timestamps: true,
});

// Workspace-scoped indexes
fileAssetSchema.index({ workspaceId: 1, uploadedBy: 1, createdAt: -1 });
fileAssetSchema.index({ workspaceId: 1, checksumHash: 1 });
fileAssetSchema.index({ workspaceId: 1, status: 1 });

const FileAsset = model('FileAsset', fileAssetSchema);

export default FileAsset;
