#!/usr/bin/env node

/**
 * Migration Script: Assign all existing data to the default "flowtask" workspace.
 *
 * This script:
 *  1. Connects to MongoDB
 *  2. Creates the default workspace if it doesn't exist
 *  3. Assigns all existing ChatUsers, Channels, Messages, Threads,
 *     ReadReceipts, FileAssets, FileReferences, ProcessedEvents to it
 *  4. Creates WorkspaceMembership records for all active ChatUsers
 *  5. Reports migration statistics
 *
 * Usage:
 *   node scripts/migrateToWorkspaces.js
 *
 * Safe to run multiple times (idempotent).
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ─── Models ──────────────────────────────────────────────────────────────────
import Workspace from '../modules/workspaces/Workspace.model.js';
import WorkspaceMembership from '../modules/workspaces/WorkspaceMembership.model.js';
import ChatUser from '../modules/users/ChatUser.model.js';
import Channel from '../modules/channels/Channel.model.js';
import Message from '../modules/messages/Message.model.js';
import Thread from '../modules/threads/Thread.model.js';
import ReadReceipt from '../modules/readReceipts/readReceipt.model.js';
import FileAsset from '../modules/files/FileAsset.model.js';
import FileReference from '../modules/files/FileReference.model.js';
import ProcessedEvent from '../modules/webhooks/ProcessedEvent.model.js';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/flowtask-chat';
const DEFAULT_SLUG = process.env.DEFAULT_WORKSPACE_SLUG || 'flowtask';
const DEFAULT_NAME = process.env.DEFAULT_WORKSPACE_NAME || 'FlowTask';

async function migrate() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  FlowTask Chat — Workspace Migration');
  console.log('═══════════════════════════════════════════════════════════\n');

  // 1. Connect to MongoDB
  console.log(`Connecting to MongoDB: ${MONGO_URI.replace(/\/\/.*@/, '//***@')}...`);
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const stats = {};

  try {
    // 2. Create or find the default workspace
    console.log(`[Step 1] Ensuring default workspace "${DEFAULT_SLUG}" exists...`);
    let workspace = await Workspace.findBySlug(DEFAULT_SLUG);

    if (!workspace) {
      // Find first admin user to be owner
      const adminUser = await ChatUser.findOne({ role: 'admin', isActive: true }).lean();

      workspace = await Workspace.create({
        name: DEFAULT_NAME,
        slug: DEFAULT_SLUG,
        description: 'Default workspace for FlowTask integration',
        owner: adminUser?._id || null,
        plan: 'enterprise',
        isActive: true,
        settings: {
          flowtaskIntegration: { enabled: true },
        },
      });
      console.log(`   ✅ Created workspace: ${workspace.name} (${workspace._id})`);
    } else {
      console.log(`   ✅ Workspace already exists: ${workspace.name} (${workspace._id})`);
    }

    const wsId = workspace._id;

    // 3. Migrate ChatUsers
    console.log('\n[Step 2] Migrating ChatUsers...');
    const userResult = await ChatUser.updateMany(
      { $or: [{ workspaceId: { $exists: false } }, { workspaceId: null }] },
      { $set: { workspaceId: wsId } },
    );
    stats.users = userResult.modifiedCount;
    console.log(`   ✅ Updated ${stats.users} users`);

    // 4. Migrate Channels
    console.log('\n[Step 3] Migrating Channels...');
    const channelResult = await Channel.updateMany(
      { $or: [{ workspaceId: { $exists: false } }, { workspaceId: null }] },
      { $set: { workspaceId: wsId } },
    );
    stats.channels = channelResult.modifiedCount;
    console.log(`   ✅ Updated ${stats.channels} channels`);

    // 5. Migrate Messages
    console.log('\n[Step 4] Migrating Messages...');
    const messageResult = await Message.updateMany(
      { $or: [{ workspaceId: { $exists: false } }, { workspaceId: null }] },
      { $set: { workspaceId: wsId } },
    );
    stats.messages = messageResult.modifiedCount;
    console.log(`   ✅ Updated ${stats.messages} messages`);

    // 6. Migrate Threads
    console.log('\n[Step 5] Migrating Threads...');
    const threadResult = await Thread.updateMany(
      { $or: [{ workspaceId: { $exists: false } }, { workspaceId: null }] },
      { $set: { workspaceId: wsId } },
    );
    stats.threads = threadResult.modifiedCount;
    console.log(`   ✅ Updated ${stats.threads} threads`);

    // 7. Migrate ReadReceipts
    console.log('\n[Step 6] Migrating ReadReceipts...');
    const receiptResult = await ReadReceipt.updateMany(
      { $or: [{ workspaceId: { $exists: false } }, { workspaceId: null }] },
      { $set: { workspaceId: wsId } },
    );
    stats.readReceipts = receiptResult.modifiedCount;
    console.log(`   ✅ Updated ${stats.readReceipts} read receipts`);

    // 8. Migrate FileAssets
    console.log('\n[Step 7] Migrating FileAssets...');
    const fileAssetResult = await FileAsset.updateMany(
      { $or: [{ workspaceId: { $exists: false } }, { workspaceId: null }] },
      { $set: { workspaceId: wsId } },
    );
    stats.fileAssets = fileAssetResult.modifiedCount;
    console.log(`   ✅ Updated ${stats.fileAssets} file assets`);

    // 9. Migrate FileReferences
    console.log('\n[Step 8] Migrating FileReferences...');
    const fileRefResult = await FileReference.updateMany(
      { $or: [{ workspaceId: { $exists: false } }, { workspaceId: null }] },
      { $set: { workspaceId: wsId } },
    );
    stats.fileReferences = fileRefResult.modifiedCount;
    console.log(`   ✅ Updated ${stats.fileReferences} file references`);

    // 10. Migrate ProcessedEvents
    console.log('\n[Step 9] Migrating ProcessedEvents...');
    const eventResult = await ProcessedEvent.updateMany(
      { $or: [{ workspaceId: { $exists: false } }, { workspaceId: null }] },
      { $set: { workspaceId: wsId } },
    );
    stats.processedEvents = eventResult.modifiedCount;
    console.log(`   ✅ Updated ${stats.processedEvents} processed events`);

    // 11. Create WorkspaceMembership records for all active users
    console.log('\n[Step 10] Creating WorkspaceMembership records...');
    const activeUsers = await ChatUser.find({
      workspaceId: wsId,
      isActive: true,
    }).select('_id role').lean();

    let membershipsCreated = 0;
    let membershipsSkipped = 0;

    for (const user of activeUsers) {
      const exists = await WorkspaceMembership.findOne({
        userId: user._id,
        workspaceId: wsId,
      }).lean();

      if (!exists) {
        // Map chat user role to workspace role
        let wsRole = 'member';
        if (user.role === 'admin') wsRole = 'admin';
        if (workspace.owner && workspace.owner.toString() === user._id.toString()) wsRole = 'owner';

        await WorkspaceMembership.create({
          userId: user._id,
          workspaceId: wsId,
          role: wsRole,
          isActive: true,
        });
        membershipsCreated++;
      } else {
        membershipsSkipped++;
      }
    }

    stats.membershipsCreated = membershipsCreated;
    stats.membershipsSkipped = membershipsSkipped;
    console.log(`   ✅ Created ${membershipsCreated} memberships (${membershipsSkipped} already existed)`);

    // 12. Update workspace member count
    console.log('\n[Step 11] Updating workspace member count...');
    const memberCount = await WorkspaceMembership.countDocuments({
      workspaceId: wsId,
      isActive: true,
    });
    await Workspace.findByIdAndUpdate(wsId, { memberCount });
    console.log(`   ✅ Member count: ${memberCount}`);

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  Migration Complete!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Workspace:         ${workspace.name} (${wsId})`);
    console.log(`  Users:             ${stats.users} migrated`);
    console.log(`  Channels:          ${stats.channels} migrated`);
    console.log(`  Messages:          ${stats.messages} migrated`);
    console.log(`  Threads:           ${stats.threads} migrated`);
    console.log(`  Read Receipts:     ${stats.readReceipts} migrated`);
    console.log(`  File Assets:       ${stats.fileAssets} migrated`);
    console.log(`  File References:   ${stats.fileReferences} migrated`);
    console.log(`  Processed Events:  ${stats.processedEvents} migrated`);
    console.log(`  Memberships:       ${stats.membershipsCreated} created, ${stats.membershipsSkipped} skipped`);
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
