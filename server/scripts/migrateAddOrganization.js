import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Migration: Add Organization Layer
 *
 * Creates a default Organization and links all existing Workspaces to it.
 * Also adds organizationId field to key collections.
 *
 * This is a non-destructive migration — safe to run multiple times.
 *
 * Usage: node scripts/migrateAddOrganization.js
 */

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('[FATAL] MONGO_URI required');
  process.exit(1);
}

async function migrate() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  // 1. Create default organization if it doesn't exist
  const orgsCollection = db.collection('organizations');
  let defaultOrg = await orgsCollection.findOne({ slug: 'default' });
  if (!defaultOrg) {
    const result = await orgsCollection.insertOne({
      name: 'Default Organization',
      slug: 'default',
      plan: 'enterprise',
      isActive: true,
      workspaceCount: 0,
      memberCount: 0,
      settings: {
        maxWorkspaces: -1,
        maxTotalMembers: -1,
        defaultWorkspacePlan: 'free',
        allowWorkspaceCreation: true,
        ssoRequired: false,
        branding: { primaryColor: '#1264A3' },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    defaultOrg = await orgsCollection.findOne({ _id: result.insertedId });
    console.log(`Created default organization: ${defaultOrg._id}`);
  } else {
    console.log(`Default organization already exists: ${defaultOrg._id}`);
  }

  const orgId = defaultOrg._id;

  // 2. Add organizationId to all existing workspaces
  const wsResult = await db.collection('workspaces').updateMany(
    { organizationId: { $exists: false } },
    { $set: { organizationId: orgId } },
  );
  console.log(`Updated ${wsResult.modifiedCount} workspaces with organizationId`);

  // Update workspace count
  const wsCount = await db.collection('workspaces').countDocuments({ organizationId: orgId });
  await orgsCollection.updateOne({ _id: orgId }, { $set: { workspaceCount: wsCount } });

  // 3. Create org memberships for all existing workspace owners
  const workspaces = await db.collection('workspaces').find({ organizationId: orgId }).toArray();
  const orgMemberships = db.collection('organizationmemberships');
  let membersAdded = 0;

  for (const ws of workspaces) {
    if (!ws.owner) continue;
    try {
      const existing = await orgMemberships.findOne({
        userId: ws.owner,
        organizationId: orgId,
      });
      if (!existing) {
        await orgMemberships.insertOne({
          userId: ws.owner,
          organizationId: orgId,
          role: 'owner',
          joinedAt: ws.createdAt || new Date(),
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        membersAdded++;
      }
    } catch (err) {
      console.error(`Failed to add owner membership for workspace ${ws._id}:`, err.message);
    }
  }

  // Also add all workspace members to org
  const wsMemberships = await db.collection('workspacememberships').find({ isActive: true }).toArray();
  for (const wm of wsMemberships) {
    try {
      const existing = await orgMemberships.findOne({
        userId: wm.userId,
        organizationId: orgId,
      });
      if (!existing) {
        await orgMemberships.insertOne({
          userId: wm.userId,
          organizationId: orgId,
          role: 'member',
          joinedAt: wm.joinedAt || new Date(),
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        membersAdded++;
      }
    } catch (err) {
      console.error(`Failed to add member org membership for user ${wm.userId}:`, err.message);
    }
  }

  // Update member count
  const memberCount = await orgMemberships.countDocuments({ organizationId: orgId, isActive: true });
  await orgsCollection.updateOne({ _id: orgId }, { $set: { memberCount } });

  console.log(`Added ${membersAdded} org memberships`);
  console.log(`Organization member count: ${memberCount}`);

  // 4. Create indexes
  await orgMemberships.createIndex({ userId: 1, organizationId: 1 }, { unique: true });
  await orgMemberships.createIndex({ organizationId: 1, role: 1, isActive: 1 });

  console.log('Migration complete!');
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
