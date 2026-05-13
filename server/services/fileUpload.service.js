import { v2 as cloudinary } from 'cloudinary';
import { createHash } from 'crypto';
import fs from 'fs';
import FileAsset from '../modules/files/FileAsset.model.js';
import env from '../config/environment.js';
import logger from '../utils/logger.js';
import { logUploadFailure } from '../utils/performanceLogger.js';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

logger.info('Cloudinary config status', {
  cloud_name: env.CLOUDINARY_CLOUD_NAME ? 'SET' : 'MISSING',
  api_key: env.CLOUDINARY_API_KEY ? 'SET' : 'MISSING',
  has_secret: !!env.CLOUDINARY_API_SECRET,
});

/**
 * Enterprise File Upload Service.
 *
 * Features:
 *   - Async upload queue (prevents server blocking)
 *   - Duplicate detection via SHA-256 checksums
 *   - Retry with exponential backoff for transient Cloudinary failures
 *   - Chunked upload for large files (>10MB)
 *   - Crash recovery: re-queues stuck uploads on startup
 *   - Automatic image optimization (q_auto, f_auto)
 *   - Structured logging with upload metrics
 */

// ─── Retry Config ────────────────────────────────────────────────────────────
const UPLOAD_RETRY = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY_MS: 1000,
  BACKOFF_FACTOR: 3, // 1s, 3s, 9s
};

class FileUploadService {
  constructor() {
    this.uploadQueue = [];
    this.isProcessing = false;
  }

  /**
   * Recover stuck uploads from a previous crash.
   * Finds FileAssets left in 'uploading' state and marks them as failed
   * since local temp files won't survive a restart.
   */
  async recoverStuckUploads() {
    try {
      const stuckUploads = await FileAsset.find({ status: 'uploading' });
      if (stuckUploads.length === 0) return;

      let recoveredCount = 0;
      for (const asset of stuckUploads) {
        // Check if local file still exists (unlikely after restart, but possible)
        const localPath = asset.metadata?.localPath;
        if (localPath && fs.existsSync(localPath)) {
          // Re-queue for upload
          this.uploadQueue.push({
            assetId: asset._id,
            file: {
              path: localPath,
              size: asset.fileSize,
              mimetype: asset.mimeType,
              originalname: asset.originalName,
            },
          });
          recoveredCount++;
        } else {
          // Can't recover without the file — mark as failed
          asset.status = 'failed';
          await asset.save();
        }
      }

      logger.info('Upload recovery complete', {
        metric: 'upload_recovery',
        total: stuckUploads.length,
        requeued: recoveredCount,
        markedFailed: stuckUploads.length - recoveredCount,
      });

      // Process any re-queued uploads
      if (recoveredCount > 0) {
        this.processQueue();
      }
    } catch (error) {
      logger.error('Upload recovery failed', { error: error.message });
    }
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
  async queueUpload(file, userId, workspaceId) {
    const checksumHash = await this.generateChecksum(file.path);

    // Duplicate detection: reuse existing file asset
    const existingAsset = await FileAsset.findOne({ checksumHash, workspaceId, status: 'available' });
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
      workspaceId,
      checksumHash,
      status: 'uploading',
      metadata: { localPath: file.path }, // persisted for crash recovery
    });

    await asset.save();

    // Push to processing queue
    this.uploadQueue.push({ assetId: asset._id, file });
    this.processQueue();

    return asset;
  }

  /**
   * Processes the upload queue sequentially.
   */
  async processQueue() {
    if (this.isProcessing || this.uploadQueue.length === 0) return;
    this.isProcessing = true;

    while (this.uploadQueue.length > 0) {
      const job = this.uploadQueue.shift();
      try {
        await this.handleUpload(job.assetId, job.file);
      } catch (error) {
        logger.error('Upload queue job failed', {
          metric: 'upload_failure',
          assetId: job.assetId?.toString(),
          error: error.message,
        });
        logUploadFailure(job.assetId?.toString(), error);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Determine if an error is retryable (transient).
   */
  _isRetryableError(error) {
    // Network errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return true;
    }
    // Cloudinary 5xx errors
    if (error.http_code && error.http_code >= 500) {
      return true;
    }
    // Rate limit (429)
    if (error.http_code === 429) {
      return true;
    }
    return false;
  }

  /**
   * Upload a file to Cloudinary with retry logic.
   * @returns {object} Cloudinary upload result
   */
  async _uploadWithRetry(filePath, uploadOptions, fileSize) {
    let lastError = null;

    for (let attempt = 1; attempt <= UPLOAD_RETRY.MAX_ATTEMPTS; attempt++) {
      try {
        let result;
        if (fileSize > 10 * 1024 * 1024) {
          result = await cloudinary.uploader.upload_large(filePath, uploadOptions);
        } else {
          result = await cloudinary.uploader.upload(filePath, uploadOptions);
        }
        return result;
      } catch (error) {
        lastError = error;

        if (attempt < UPLOAD_RETRY.MAX_ATTEMPTS && this._isRetryableError(error)) {
          const delay = UPLOAD_RETRY.BASE_DELAY_MS * Math.pow(UPLOAD_RETRY.BACKOFF_FACTOR, attempt - 1);
          logger.warn('Cloudinary upload retry', {
            metric: 'upload_retry',
            attempt,
            maxAttempts: UPLOAD_RETRY.MAX_ATTEMPTS,
            delayMs: delay,
            error: error.message,
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          break;
        }
      }
    }

    throw lastError;
  }

  /**
   * Handles the actual upload to Cloudinary with retry and metrics.
   */
  async handleUpload(assetId, file) {
    const startTime = performance.now();
    const asset = await FileAsset.findById(assetId);

    if (!asset) {
      // Asset might have been deleted mid-upload
      fs.unlink(file.path, () => {});
      return;
    }

    try {
      const uploadOptions = {
        folder: asset.folderPath,
        resource_type: asset.resourceType, // explicit: 'image' | 'video' | 'raw'
        use_filename: true,
      };

      // Image optimization
      if (asset.resourceType === 'image') {
        uploadOptions.transformation = [
          { quality: 'auto', fetch_format: 'auto' },
        ];
      }

      // Upload with retry
      const result = await this._uploadWithRetry(file.path, uploadOptions, file.size);

      // Update Asset state to available
      asset.publicId = result.public_id;
      asset.secureUrl = result.secure_url;
      asset.status = 'available';
      
      // Setup Preview/Thumbnails
      if (asset.resourceType === 'video') {
        asset.thumbnailUrl = result.secure_url.replace(/\.[^/.]+$/, '.jpg');
      } else if (asset.resourceType === 'image') {
        asset.thumbnailUrl = result.secure_url;
      }
      
      asset.metadata = {
        width: result.width,
        height: result.height,
        duration: result.duration,
        format: result.format,
      };

      await asset.save();

      const durationMs = Math.round(performance.now() - startTime);
      logger.info('File uploaded successfully', {
        metric: 'upload_complete',
        assetId: asset._id.toString(),
        resourceType: asset.resourceType,
        fileSize: asset.fileSize,
        durationMs,
      });

      // Emit global event indicating the file is ready
      const { default: eventBus } = await import('./eventBus.js');
      eventBus.emit('file:uploaded', { assetId: asset._id, asset });

    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);
      logger.error('Cloudinary upload failed permanently', {
        metric: 'upload_failure',
        assetId: asset._id.toString(),
        error: error.message,
        durationMs,
        attempts: UPLOAD_RETRY.MAX_ATTEMPTS,
      });

      asset.status = 'failed';
      await asset.save();
      throw error;
    } finally {
      // Always ensure local file is deleted post-upload
      fs.unlink(file.path, () => {});
    }
  }
}

export default new FileUploadService();
