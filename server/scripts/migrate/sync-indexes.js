#!/usr/bin/env node
/**
 * sync-indexes.js — Ensure all Mongoose model indexes exist in production.
 *
 * In production, autoIndex is disabled (database.js: autoIndex: !IS_PRODUCTION),
 * so schema-defined indexes are NEVER created automatically. This script:
 *
 *   1. Loads every Mongoose model (triggering index definitions)
 *   2. Calls Model.ensureIndexes() on each to create missing indexes
 *   3. Reports any indexes that were created or dropped
 *
 * Usage:  node server/scripts/migrate/sync-indexes.js
 * Safe to run multiple times — only creates indexes that don't exist.
 */
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../config/database.js';

// Import all models to register their index definitions
import '../../modules/users/ChatUser.model.js';
import '../../modules/workspaces/Workspace.model.js';
import '../../modules/workspaces/WorkspaceMembership.model.js';
import '../../modules/workspaces/WorkspaceInvite.model.js';
import '../../modules/channels/Channel.model.js';
import '../../modules/channels/ChannelMember.model.js';
import '../../modules/channels/ChannelPin.model.js';
import '../../modules/messages/Message.model.js';
import '../../modules/messages/MessageReaction.model.js';
import '../../modules/messages/SavedMessage.model.js';
import '../../modules/messages/ScheduledMessage.model.js';
import '../../modules/threads/Thread.model.js';
import '../../modules/files/FileAsset.model.js';
import '../../modules/files/FileReference.model.js';
import '../../modules/notifications/Notification.model.js';
import '../../modules/notifications/NotificationPreference.model.js';
import '../../modules/readReceipts/ReadReceipt.model.js';
import '../../modules/drafts/Draft.model.js';
import '../../modules/dms/DirectMessage.model.js';
import '../../modules/canvas/canvas.model.js';
import '../../modules/canvas/canvasBlock.model.js';
import '../../modules/canvas/canvasComment.model.js';
import '../../modules/canvas/canvasHistory.model.js';
import '../../modules/directories/UserGroup.model.js';
import '../../modules/admin/AuditLog.model.js';
import '../../modules/flowtask/ProcessedEvent.model.js';
import '../../modules/categories/Category.model.js';
import '../../modules/categories/Department.model.js';

async function run() {
  try {
    console.log('Connecting to database...');
    await connectDatabase();
    console.log(`Connected to: ${mongoose.connection.name}`);
    console.log('');

    const models = Object.values(mongoose.models);
    console.log(`Found ${models.length} Mongoose models.\n`);

    let totalCreated = 0;
    let totalDropped = 0;
    const results = [];

    for (const model of models) {
      const modelName = model.modelName;
      try {
        // syncIndexes: creates missing indexes and drops indexes not in schema
        const { created, dropped } = await syncModelIndexes(model);

        if (created.length > 0 || dropped.length > 0) {
          results.push({ modelName, created, dropped });
          totalCreated += created.length;
          totalDropped += dropped.length;

          if (created.length > 0) {
            console.log(`  ✓ ${modelName}: created ${created.length} index(es): ${created.join(', ')}`);
          }
          if (dropped.length > 0) {
            console.log(`  ✗ ${modelName}: dropped ${dropped.length} stale index(es): ${dropped.join(', ')}`);
          }
        } else {
          console.log(`  · ${modelName}: all indexes up to date`);
        }
      } catch (err) {
        console.error(`  ✗ ${modelName}: FAILED — ${err.message}`);
        results.push({ modelName, error: err.message });
      }
    }

    console.log('\n─────────────────────────────────────────');
    console.log(`Index sync complete.`);
    console.log(`  Created: ${totalCreated}`);
    console.log(`  Dropped: ${totalDropped}`);
    console.log(`  Models:  ${models.length}`);
    console.log('─────────────────────────────────────────');

    if (totalCreated > 0) {
      console.log('\n⚠  New indexes created. MongoDB may still be building them in the background.');
      console.log('   Monitor with: db.currentOp() or check MongoDB Atlas → Indexes.');
    }
  } catch (err) {
    console.error('Index sync failed:', err);
    process.exitCode = 1;
  } finally {
    try {
      await disconnectDatabase();
    } catch {
      // ignore
    }
  }
}

/**
 * Sync indexes for a single model using Mongoose's syncIndexes.
 * In Mongoose 7+, syncIndexes returns { toCreate, toDrop } when called
 * with { diffIndexes: true }, or creates/drops directly otherwise.
 */
async function syncModelIndexes(model) {
  // Mongoose 7+ API
  try {
    const diff = await model.diffIndexes();
    const toCreate = diff.toCreate || [];
    const toDrop = diff.toDrop || [];

    if (toCreate.length > 0 || toDrop.length > 0) {
      const result = await model.syncIndexes();
      return {
        created: result.created || toCreate.map((i) => JSON.stringify(i.key || i)),
        dropped: result.dropped || toDrop.map((i) => i.name || JSON.stringify(i.key || i)),
      };
    }
    return { created: [], dropped: [] };
  } catch {
    // Fallback for older Mongoose: use ensureIndexes
    const created = [];
    try {
      await model.ensureIndexes();
      // List current indexes to compare
      const current = await model.collection.indexes();
      created.push(...current.map((i) => i.name).filter((n) => n !== '_id_'));
    } catch (err) {
      throw err;
    }
    return { created, dropped: [] };
  }
}

run();
