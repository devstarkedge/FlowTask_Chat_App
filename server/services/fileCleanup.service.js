import cron from 'node-cron';
import { v2 as cloudinary } from 'cloudinary';
import FileReference from '../modules/files/FileReference.model.js';
import FileAsset from '../modules/files/FileAsset.model.js';
import logger from '../utils/logger.js';

/**
 * Enterprise File Cleanup Service.
 *
 * Improvements over original:
 *   - Batched Cloudinary deletes (up to 100 per API call) — 10–50× fewer network requests
 *   - Cleanup of permanently failed uploads
 *   - Structured logging with execution metrics
 *   - Graceful error isolation per batch
 */

const BATCH_SIZE = 100; // Cloudinary max per delete_resources call
const ORPHAN_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const FAILED_THRESHOLD_MS = 2 * 60 * 60 * 1000;  // 2 hours

class FileCleanupService {
  constructor() {
    this.isConfigured = false;
  }

  init() {
    if (this.isConfigured) return;
    // Run every day at 3 AM
    this.cleanupJob = cron.schedule('0 3 * * *', this.runCleanup.bind(this), {
      scheduled: true,
    });
    this.isConfigured = true;
    logger.info('FileCleanupService initialized', { schedule: '03:00 daily' });
  }

  async runCleanup() {
    const startTime = performance.now();
    logger.info('File cleanup starting');

    let orphanedDeleted = 0;
    let failedDeleted = 0;

    try {
      // ── 1. Orphaned assets (no references, older than 24h) ──────────────
      const orphanedAssets = await FileAsset.aggregate([
        {
          $lookup: {
            from: 'filereferences',
            localField: '_id',
            foreignField: 'fileId',
            as: 'references',
          },
        },
        {
          $match: {
            references: { $size: 0 },
            createdAt: { $lt: new Date(Date.now() - ORPHAN_THRESHOLD_MS) },
          },
        },
      ]);

      orphanedDeleted = await this._batchDeleteAssets(orphanedAssets, 'orphaned');

      // ── 2. Permanently failed uploads (older than 2h) ──────────────────
      const failedAssets = await FileAsset.find({
        status: 'failed',
        updatedAt: { $lt: new Date(Date.now() - FAILED_THRESHOLD_MS) },
      });

      failedDeleted = await this._batchDeleteAssets(failedAssets, 'failed');

    } catch (error) {
      logger.error('File cleanup encountered an error', { error: error.message });
    }

    const durationMs = Math.round(performance.now() - startTime);
    logger.info('File cleanup complete', {
      metric: 'cron_execution',
      job: 'file_cleanup',
      orphanedDeleted,
      failedDeleted,
      durationMs,
    });
  }

  /**
   * Batch-delete assets from Cloudinary and MongoDB.
   * Groups assets by resourceType and issues one API call per batch of 100.
   */
  async _batchDeleteAssets(assets, reason) {
    if (assets.length === 0) return 0;

    // Group by resourceType for batched Cloudinary delete
    const grouped = {};
    for (const asset of assets) {
      const resType = asset.resourceType || 'image';
      if (!grouped[resType]) grouped[resType] = [];
      grouped[resType].push(asset);
    }

    let totalDeleted = 0;

    for (const [resourceType, group] of Object.entries(grouped)) {
      // Split into batches of BATCH_SIZE
      for (let i = 0; i < group.length; i += BATCH_SIZE) {
        const batch = group.slice(i, i + BATCH_SIZE);

        // Only delete from Cloudinary if the asset actually has a cloud ID
        const cloudinaryIds = batch
          .filter((a) => a.storageProvider === 'cloudinary' && a.publicId && !a.publicId.startsWith('pending_'))
          .map((a) => a.publicId);

        if (cloudinaryIds.length > 0) {
          try {
            await cloudinary.api.delete_resources(cloudinaryIds, {
              resource_type: resourceType === 'raw' ? 'raw' : resourceType,
            });
          } catch (cloudErr) {
            logger.error('Cloudinary batch delete failed', {
              resourceType,
              count: cloudinaryIds.length,
              reason,
              error: cloudErr.message,
            });
            // Don't delete from DB if cloud delete failed — retry next run
            continue;
          }
        }

        // Delete from DB
        const batchIds = batch.map((a) => a._id);
        await FileAsset.deleteMany({ _id: { $in: batchIds } });
        totalDeleted += batchIds.length;

        logger.info('Batch deleted assets', {
          reason,
          resourceType,
          count: batchIds.length,
        });
      }
    }

    return totalDeleted;
  }

  /**
   * Forcibly queue a file reference evaluation.
   * Can be hooked into message deletion to immediately clean up if desired,
   * but the daily cron is usually preferred for performance.
   */
  async checkAssetOrphaned(assetId) {
    const refs = await FileReference.countDocuments({ fileId: assetId });
    if (refs === 0) {
      await FileAsset.findByIdAndUpdate(assetId, { status: 'deleted' });
    }
  }
}

export default new FileCleanupService();
