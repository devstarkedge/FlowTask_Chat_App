/**
 * Migration Script: Hash existing plaintext invite tokens
 * 
 * This script migrates existing pending invites from plaintext tokens
 * to hashed tokens (SHA-256). Old tokens will become invalid.
 * 
 * Usage:
 *   node server/scripts/migrateInviteTokenHash.js
 * 
 * For production with existing invites, consider a grace period
 * where both plain and hashed tokens are accepted.
 */

import mongoose from 'mongoose';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from server/.env
dotenv.config({ path: join(__dirname, '..', '.env') });

// Hash function matching the one in WorkspaceInvite.model.js
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function migrate() {
  console.log('🔄 Starting invite token hash migration...\n');

  // Connect to MongoDB
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌ MONGO_URI not found in environment variables');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB\n');

  // Get the WorkspaceInvite model
  const WorkspaceInvite = mongoose.model('WorkspaceInvite');

  // Find all invites with plaintext tokens but no tokenHash
  const invites = await WorkspaceInvite.find({
    token: { $exists: true, $ne: null },
    $or: [
      { tokenHash: { $exists: false } },
      { tokenHash: null },
    ],
  });

  console.log(`📋 Found ${invites.length} invite(s) to migrate\n`);

  if (invites.length === 0) {
    console.log('✅ No invites to migrate. Migration complete!');
    await mongoose.disconnect();
    return;
  }

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const invite of invites) {
    try {
      // Hash the existing token
      const tokenHash = hashToken(invite.token);

      // Update the invite with the hash
      await WorkspaceInvite.updateOne(
        { _id: invite._id },
        { $set: { tokenHash } }
      );

      migrated++;
      console.log(`  ✓ Migrated invite ${invite._id} (email: ${invite.email})`);
    } catch (error) {
      errors++;
      console.error(`  ✗ Failed to migrate invite ${invite._id}:`, error.message);
    }
  }

  console.log(`\n📊 Migration Summary:`);
  console.log(`  • Migrated: ${migrated}`);
  console.log(`  • Skipped: ${skipped}`);
  console.log(`  • Errors: ${errors}`);
  console.log(`  • Total: ${invites.length}`);

  // Note about old tokens
  console.log(`\n⚠️  Important Notes:`);
  console.log(`  • Old plaintext tokens are still in the database but no longer used`);
  console.log(`  • Existing email invite links with old tokens will NOT work`);
  console.log(`  • Users will need to request new invites`);
  console.log(`  • For production: consider implementing a grace period`);

  await mongoose.disconnect();
  console.log('\n✅ Migration complete!');
}

// Run migration
migrate().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
