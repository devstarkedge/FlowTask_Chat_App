import cron from 'node-cron';
import { v2 as cloudinary } from 'cloudinary';
import FileReference from '../modules/files/FileReference.model.js';
import FileAsset from '../modules/files/FileAsset.model.js';
import logger from '../utils/logger.js';

/**
 * Enterprise File Cleanup Service
 * Automatically deletes files from Cloudinary and the database
 * if they have no FileReferences (orphaned) for over 24 hours.
 */
class FileCleanupService {
  constructor() {
    this.isConfigured = false;
  }

  init() {
    if (this.isConfigured) return;
    // Run every day at 3 AM
    this.cleanupJob = cron.schedule('0 3 * * *', this.runCleanup.bind(this), {
      scheduled: true
    });
    this.isConfigured = true;
    logger.info('FileCleanupService initialized. Scheduled for 03:00 daily.');
  }

  async runCleanup() {
    logger.info('[FileCleanupService] Starting orphaned file cleanup...');
    try {
      // Find files that have no references and are older than 24 hours
      // (24h buffer ensures we don't delete files that were just uploaded and are about to be referenced)
      const orphanedAssets = await FileAsset.aggregate([
        {
          $lookup: {
            from: 'filereferences', // Mongoose usually lowercase and pluralizes: filereferences
            localField: '_id',
            foreignField: 'fileId',
            as: 'references'
          }
        },
        {
          $match: {
            references: { $size: 0 },
            createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
          }
        }
      ]);

      for (const asset of orphanedAssets) {
        if (asset.storageProvider === 'cloudinary' && asset.publicId && !asset.publicId.startsWith('pending_')) {
          try {
            await cloudinary.uploader.destroy(asset.publicId, {
              resource_type: asset.resourceType === 'raw' ? 'auto' : asset.resourceType
            });
          } catch (cloudErr) {
            logger.error(`[FileCleanupService] Failed to delete from cloudinary: ${asset.publicId}`, cloudErr);
            continue; // Skip DB delete if cloud delete fails, try again next run
          }
        }

        // Delete from DB
        await FileAsset.findByIdAndDelete(asset._id);
        logger.info(`[FileCleanupService] Deleted orphaned asset: ${asset._id} (ID: ${asset.publicId})`);
      }
      logger.info(`[FileCleanupService] Cleanup finished. Deleted ${orphanedAssets.length} files.`);
    } catch (error) {
      logger.error('[FileCleanupService] Cleanup failed:', error);
    }
  }

  /**
   * Forcibly queue a file reference evaluation.
   * Can be hooked into message deletion to immediately clean up if desired,
   * but the daily cron is usually preferred for performance.
   */
  async checkAssetOrphaned(assetId) {
    const refs = await FileReference.countDocuments({ fileId: assetId });
    if (refs === 0) {
      // It's orphaned. We can just leave it for the cron job or delete immediately.
      // E.g. update status to 'deleted'
      await FileAsset.findByIdAndUpdate(assetId, { status: 'deleted' });
    }
  }
}

export default new FileCleanupService();
