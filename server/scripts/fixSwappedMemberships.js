/**
 * fixSwappedMemberships.js
 *
 * Dev-only script to clean up corrupted WorkspaceMembership documents
 * caused by the (workspaceId, userId) → (userId, workspaceId) parameter
 * swap bug in workspace.repository.js.
 *
 * What it does:
 *   1. Drops ALL WorkspaceMembership documents
 *   2. For each active Workspace, recreates an 'owner' membership from Workspace.owner
 *   3. Resyncs Workspace.memberCount
 *
 * Usage:
 *   node --experimental-modules server/scripts/fixSwappedMemberships.js
 *
 * WARNING: This deletes all membership data. Only use in development.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('[FATAL] MONGO_URI is required');
  process.exit(1);
}

async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.\n');

  const db = mongoose.connection.db;
  const membershipsCol = db.collection('workspacememberships');
  const workspacesCol = db.collection('workspaces');

  // 1. Count existing memberships
  const beforeCount = await membershipsCol.countDocuments();
  console.log(`Found ${beforeCount} WorkspaceMembership documents.`);

  // 2. Drop all memberships
  if (beforeCount > 0) {
    await membershipsCol.deleteMany({});
    console.log(`Deleted ${beforeCount} corrupted membership documents.\n`);
  }

  // 3. Find all active workspaces with an owner
  const workspaces = await workspacesCol.find({ isActive: true }).toArray();
  console.log(`Found ${workspaces.length} active workspace(s).\n`);

  let created = 0;
  for (const ws of workspaces) {
    if (!ws.owner) {
      console.warn(`  ⚠ Workspace "${ws.name}" (${ws._id}) has no owner — skipping.`);
      continue;
    }

    // Recreate owner membership
    const now = new Date();
    await membershipsCol.updateOne(
      { userId: ws.owner, workspaceId: ws._id },
      {
        $set: { role: 'owner', isActive: true },
        $setOnInsert: { joinedAt: now, invitedBy: null, createdAt: now, updatedAt: now },
      },
      { upsert: true },
    );

    // Reset memberCount to 1 (owner)
    await workspacesCol.updateOne(
      { _id: ws._id },
      { $set: { memberCount: 1 } },
    );

    console.log(`  ✓ Workspace "${ws.name}" — owner membership recreated for user ${ws.owner}`);
    created++;
  }

  console.log(`\nDone. Recreated ${created} owner membership(s).`);
  console.log('Existing users will need to re-join their workspaces via invite code.\n');

  await mongoose.disconnect();
  console.log('Disconnected. Script complete.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
