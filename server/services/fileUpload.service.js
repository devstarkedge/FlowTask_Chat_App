import { v2 as cloudinary } from 'cloudinary';
import { createHash } from 'crypto';
import fs from 'fs';
import FileAsset from '../modules/files/FileAsset.model.js';
import env from '../config/environment.js';
import logger from '../utils/logger.js';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

logger.info('[Cloudinary] Config:', {
  cloud_name: env.CLOUDINARY_NAME ? 'SET' : 'MISSING',
  api_key: env.CLOUDINARY_API_KEY ? 'SET' : 'MISSING',
  has_secret: !!env.CLOUDINARY_API_SECRET
});

/**
 * Enterprise File Upload Service.
 * Features:
 * - Async Upload Queue (prevents server blocking)
 * - Duplicate Detection via SHA-256 checksums
 * - Clouninary automatic transformations
 * - Chunked upload for large files
 */
class FileUploadService {
  constructor() {
    this.uploadQueue = [];
    this.isProcessing = false;
  }

  /**
   * Generates a SHA-256 hash of a file for duplicate detection.
   */
  async generateChecksum(filePath) {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Queues a file for upload and immediately returns the FileAsset in 'uploading' state.
   */
  async queueUpload(file, userId) {
    const checksumHash = await this.generateChecksum(file.path);

    // Duplicate detection: reuse existing file asset
    const existingAsset = await FileAsset.findOne({ checksumHash });
    if (existingAsset) {
      // Clean up the temporary local file as it's a duplicate
      fs.unlink(file.path, () => {});
      return existingAsset;
    }

    // Determine resource type for Cloudinary
    const resourceType = file.mimetype.startsWith('image/') ? 'image' 
      : file.mimetype.startsWith('video/') ? 'video' 
      : 'raw';

    // Create a preliminary asset. Cloudinary details will be populated asynchronously.
    const asset = new FileAsset({
      publicId: `pending_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      secureUrl: '/placeholder-loading', // Frontend can show a loading state
      resourceType,
      mimeType: file.mimetype,
      fileSize: file.size,
      originalName: file.originalname,
      uploadedBy: userId,
      checksumHash,
      status: 'uploading'
    });

    await asset.save();

    // Push to processing queue
    this.uploadQueue.push({ assetId: asset._id, file });
    this.processQueue();

    return asset;
  }

  /**
   * Processes the upload queue sequentially.
   * Can be scaled to parallel processing depending on node limits.
   */
  async processQueue() {
    if (this.isProcessing || this.uploadQueue.length === 0) return;
    this.isProcessing = true;

    while (this.uploadQueue.length > 0) {
      const job = this.uploadQueue.shift();
      try {
        await this.handleUpload(job.assetId, job.file);
      } catch (error) {
        logger.error(`[FileUploadService] Upload failed for asset ${job.assetId}:`, error);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Handles the actual communication with Cloudinary.
   */
  async handleUpload(assetId, file) {
    const asset = await FileAsset.findById(assetId);
    if (!asset) {
      // Asset might have been deleted mid-upload
      fs.unlink(file.path, () => {});
      return;
    }

    try {
      const uploadOptions = {
        folder: asset.folderPath,
        resource_type: asset.resourceType === 'raw' ? 'auto' : asset.resourceType,
        use_filename: true,
      };

      // Advanced Transformations
      if (asset.resourceType === 'image') {
        uploadOptions.transformation = [
          { quality: 'auto', fetch_format: 'auto' } // q_auto,f_auto
        ];
      }

      let result;
      // Implement Chunked Upload for large files (e.g. > 10MB)
      if (file.size > 10 * 1024 * 1024) {
        result = await cloudinary.uploader.upload_large(file.path, uploadOptions);
      } else {
        result = await cloudinary.uploader.upload(file.path, uploadOptions);
      }

      // Update Asset state to available
      asset.publicId = result.public_id;
      asset.secureUrl = result.secure_url;
      asset.status = 'available';
      
      // Setup Preview/Thumbnails
      if (asset.resourceType === 'video') {
        asset.thumbnailUrl = result.secure_url.replace(/\.[^/.]+$/, ".jpg");
      } else if (asset.resourceType === 'image') {
        asset.thumbnailUrl = result.secure_url;
      }
      
      asset.metadata = {
        width: result.width,
        height: result.height,
        duration: result.duration,
        format: result.format
      };

      await asset.save();

      // Emit global event indicating the file is ready
      const { default: eventBus } = await import('./eventBus.js');
      eventBus.emit('file:uploaded', { assetId: asset._id, asset });

    } catch (error) {
      logger.error(`[FileUploadService] Cloudinary error for ${asset._id}:`, error);
      asset.status = 'deleted';
      await asset.save();
      throw error;
    } finally {
      // Always ensure local file is deleted post-upload
      fs.unlink(file.path, () => {});
    }
  }
}

export default new FileUploadService();
