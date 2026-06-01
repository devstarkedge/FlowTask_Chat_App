/**
 * Clean Corrupted Canvas Collaboration State
 * 
 * This script identifies and cleans up canvases with corrupted Yjs collaboration state
 * that causes "Unexpected end of array" errors during document loading.
 * 
 * Usage:
 *   node server/scripts/cleanCorruptedCanvasState.js [--dry-run] [--canvas-id=<id>]
 * 
 * Options:
 *   --dry-run       Show what would be cleaned without making changes
 *   --canvas-id     Clean specific canvas by ID
 */

import mongoose from 'mongoose';
import * as Y from 'yjs';
import Canvas from '../modules/canvas/canvas.model.js';
import env from '../config/environment.js';
import logger from '../utils/logger.js';

const isDryRun = process.argv.includes('--dry-run');
const specificCanvasId = process.argv.find(arg => arg.startsWith('--canvas-id='))?.split('=')[1];

async function validateYjsState(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return { valid: false, reason: 'Not a buffer' };
  }

  try {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(buffer));
    doc.destroy();
    return { valid: true };
  } catch (err) {
    return { valid: false, reason: err.message };
  }
}

async function cleanCorruptedCanvases() {
  try {
    await mongoose.connect(env.MONGO_URI);
    logger.info('[CLEAN] Connected to MongoDB');

    const query = specificCanvasId ? { _id: specificCanvasId } : {};
    const canvases = await Canvas.find(query).select('+collaborationState');

    logger.info(`[CLEAN] Found ${canvases.length} canvas(es) to check`);

    let corruptedCount = 0;
    let cleanedCount = 0;

    for (const canvas of canvases) {
      if (!canvas.collaborationState || canvas.collaborationState.length === 0) {
        continue;
      }

      const validation = await validateYjsState(canvas.collaborationState);
      
      if (!validation.valid) {
        corruptedCount++;
        logger.warn(`[CLEAN] Corrupted canvas found`, {
          canvasId: canvas._id,
          title: canvas.title,
          reason: validation.reason,
          stateSize: canvas.collaborationState.length,
        });

        if (!isDryRun) {
          // Clear the corrupted state - client will re-seed from canvas.content
          await Canvas.findByIdAndUpdate(canvas._id, {
            $set: { collaborationState: Buffer.alloc(0) },
          });
          cleanedCount++;
          logger.info(`[CLEAN] Cleaned canvas ${canvas._id}`);
        }
      }
    }

    logger.info('[CLEAN] Summary', {
      total: canvases.length,
      corrupted: corruptedCount,
      cleaned: cleanedCount,
      dryRun: isDryRun,
    });

    if (isDryRun && corruptedCount > 0) {
      logger.info('[CLEAN] Run without --dry-run to clean corrupted canvases');
    }

  } catch (err) {
    logger.error('[CLEAN] Error', { error: err.message, stack: err.stack });
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    logger.info('[CLEAN] Disconnected from MongoDB');
  }
}

cleanCorruptedCanvases()
  .then(() => {
    logger.info('[CLEAN] Done');
    process.exit(0);
  })
  .catch((err) => {
    logger.error('[CLEAN] Fatal error', { error: err.message });
    process.exit(1);
  });
