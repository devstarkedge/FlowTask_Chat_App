#!/usr/bin/env node
/**
 * fix-guest-memberships.js
 *
 * One-time migration: finds all WorkspaceInvites with inviteType='guest' and
 * status='accepted', then corrects the corresponding WorkspaceMembership to
 * role='guest' if it was incorrectly set to 'member'.
 *
 * Safe to run multiple times — only updates memberships where role != 'guest'.
 *
 * Usage:
 *   node server/scripts/migrate/fix-guest-memberships.js
 *   node server/scripts/migrate/fix-guest-memberships.js --dry-run
 */
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import '../../modules/workspaces/WorkspaceInvite.model.js';
import '../../modules/workspaces/WorkspaceMembership.model.js';

const IS_DRY_RUN = process.argv.includes('--dry-run');

async function run() {
  try {
    console.log('Connecting to database…');
    await connectDatabase();
    console.log(`Connected to: ${mongoose.connection.name}`);
    if (IS_DRY_RUN) console.log('\n⚠  DRY RUN — no changes will be written.\n');

    const WorkspaceInvite = mongoose.model('WorkspaceInvite');
    const WorkspaceMembership = mongoose.model('WorkspaceMembership');

    // Find all accepted guest invites
    const guestInvites = await WorkspaceInvite.find({
      inviteType: 'guest',
      status: 'accepted',
      acceptedBy: { $ne: null },
    }).lean();

    console.log(`Found ${guestInvites.length} accepted guest invite(s) to inspect.\n`);

    let fixed = 0;
    let alreadyCorrect = 0;
    let noMembership = 0;

    for (const invite of guestInvites) {
      const membership = await WorkspaceMembership.findOne({
        userId: invite.acceptedBy,
        workspaceId: invite.workspaceId,
      }).lean();

      if (!membership) {
        console.log(`  ⚠  No membership found for invite ${invite._id} (user: ${invite.acceptedBy})`);
        noMembership++;
        continue;
      }

      if (membership.role === 'guest') {
        alreadyCorrect++;
        continue;
      }

      // Fix: update role to guest
      console.log(
        `  → Fixing membership ${membership._id}: role '${membership.role}' → 'guest'` +
        ` (user: ${invite.acceptedBy}, workspace: ${invite.workspaceId})`
      );

      if (!IS_DRY_RUN) {
        await WorkspaceMembership.updateOne(
          { _id: membership._id },
          { $set: { role: 'guest' } }
        );
      }

      fixed++;
    }

    console.log('\n─────────────────────────────────────────');
    console.log('Migration complete.');
    console.log(`  Fixed:           ${fixed}`);
    console.log(`  Already correct: ${alreadyCorrect}`);
    console.log(`  No membership:   ${noMembership}`);
    console.log(`  Total inspected: ${guestInvites.length}`);
    if (IS_DRY_RUN) console.log('\n  (Dry run — no changes written)');
    console.log('─────────────────────────────────────────');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

run();
