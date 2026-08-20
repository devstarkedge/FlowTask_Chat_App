#!/usr/bin/env node

/**
 * One-time backfill: link the single existing ChatApp workspace (the old
 * "source:'flowtask'" singleton) to its FlowTask workspace counterpart.
 *
 * Context: before this integration became workspace-aware, ChatApp enforced
 * "at most one active source:'flowtask' Workspace, ever" via a partial
 * unique index on Workspace.source. That index is now removed (see
 * Workspace.model.js) in favor of a real per-tenant WorkspaceMapping. This
 * script makes the pre-existing pairing explicit by (1) syncing indexes so
 * the old constraint is actually dropped from Mongo, and (2) writing the
 * first WorkspaceMapping row — so every FUTURE FlowTask workspace can get
 * its own distinct ChatApp workspace without disturbing the one that's
 * already live.
 *
 * The two apps are separate MongoDB deployments — this script cannot look
 * up FlowTask's workspace id itself, so the operator supplies it (visible
 * in FlowTask's own admin UI / DB). Not run automatically at boot, for the
 * same reason.
 *
 * Safe to run multiple times (idempotent — upsert via $setOnInsert).
 *
 * Usage:
 *   FLOWTASK_WORKSPACE_ID=<24-hex-id> node server/scripts/migrateChatWorkspaceMapping.js
 *   node server/scripts/migrateChatWorkspaceMapping.js --flowtask-workspace-id=<id>
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import Workspace from '../modules/workspaces/Workspace.model.js';
import WorkspaceMapping from '../modules/flowtask/WorkspaceMapping.model.js';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/flowtask-chat';

function parseCliArg(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

async function migrate() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ChatApp — FlowTask Workspace Mapping Migration');
  console.log('═══════════════════════════════════════════════════════════\n');

  const flowTaskWorkspaceId = process.env.FLOWTASK_WORKSPACE_ID || parseCliArg('flowtask-workspace-id');
  if (!flowTaskWorkspaceId || !/^[0-9a-fA-F]{24}$/.test(flowTaskWorkspaceId)) {
    console.error('ERROR: FLOWTASK_WORKSPACE_ID (24-hex FlowTask Workspace _id) is required.');
    console.error('Set it as an env var, or pass --flowtask-workspace-id=<id>.');
    process.exit(1);
  }

  console.log(`Connecting to MongoDB: ${MONGO_URI.replace(/\/\/.*@/, '//***@')}...`);
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  try {
    // 1. Drop the old partial-unique index on {source:1} (replaced by
    //    WorkspaceMapping's unique indexes) and apply the current schema's
    //    indexes.
    console.log('[Step 1] Syncing Workspace indexes (drops the old FlowTask-singleton index)...');
    const indexChanges = await Workspace.syncIndexes();
    console.log(`   ✅ Indexes synced. Changes: ${JSON.stringify(indexChanges)}`);

    // 2. Find the singleton via the OLD lookup logic — its one legitimate
    //    remaining use, purely for this one-time migration.
    console.log('\n[Step 2] Locating the existing FlowTask-linked workspace...');
    const candidates = await Workspace.find({
      $or: [{ source: 'flowtask' }, { 'settings.flowtaskIntegration.enabled': true }],
      isActive: true,
    });

    if (candidates.length !== 1) {
      console.error(
        `ERROR: Expected exactly one FlowTask-linked ChatApp workspace to migrate (found ${candidates.length}). ` +
        'This script only handles the simple single-existing-workspace case; if you already have multiple, ' +
        'resolve the correct pairing manually instead of guessing.',
      );
      process.exit(1);
    }

    const workspace = candidates[0];
    console.log(`   ✅ Found workspace: ${workspace.name} (${workspace._id})`);

    // 3. Upsert the mapping row.
    console.log('\n[Step 3] Upserting WorkspaceMapping...');
    const existing = await WorkspaceMapping.findOne({ flowTaskWorkspaceId });
    if (existing) {
      console.log(`   ✅ Mapping already exists: flowTaskWorkspaceId=${flowTaskWorkspaceId} → chatWorkspaceId=${existing.chatWorkspaceId}`);
    } else {
      const mapping = await WorkspaceMapping.findOneAndUpdate(
        { flowTaskWorkspaceId },
        {
          $setOnInsert: {
            flowTaskWorkspaceId,
            chatWorkspaceId: workspace._id,
            syncOrigin: 'user_initiated',
            createdByChatUserId: workspace.owner,
          },
        },
        { upsert: true, new: true },
      );
      console.log(`   ✅ Created mapping: flowTaskWorkspaceId=${flowTaskWorkspaceId} → chatWorkspaceId=${mapping.chatWorkspaceId}`);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  Migration Complete!');
    console.log('═══════════════════════════════════════════════════════════\n');
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

migrate();
