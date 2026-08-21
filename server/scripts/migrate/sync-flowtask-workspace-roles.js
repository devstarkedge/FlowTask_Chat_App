#!/usr/bin/env node

/**
 * Reconcile persisted ChatApp roles for FlowTask-managed workspaces.
 *
 * The signed FlowTask role is already stored on each membership as
 * `flowTaskAccess.role`; this migration only corrects ChatApp's parallel
 * workspace role. It never changes ChatUser.role, workspace ownership,
 * memberships, channels, or messages.
 *
 * Default: dry run. Use --apply to write the reviewed changes.
 */
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import '../../modules/workspaces/Workspace.model.js';
import '../../modules/workspaces/WorkspaceMembership.model.js';
import { mapFlowTaskAccessToWorkspaceRole } from '../../modules/flowtask/flowTaskWorkspaceRoleMap.js';

const APPLY = process.argv.includes('--apply');

async function run() {
  try {
    await connectDatabase();
    const Workspace = mongoose.model('Workspace');
    const WorkspaceMembership = mongoose.model('WorkspaceMembership');

    const workspaces = await Workspace.find({ source: 'flowtask', isActive: true })
      .select('_id name')
      .lean();
    const workspaceIds = workspaces.map((workspace) => workspace._id);
    if (workspaceIds.length === 0) {
      console.log('No active FlowTask workspaces found.');
      return;
    }

    const memberships = await WorkspaceMembership.find({
      workspaceId: { $in: workspaceIds },
      isActive: true,
      'flowTaskAccess.role': { $type: 'string' },
    }).lean();

    const workspaceNames = new Map(workspaces.map((workspace) => [
      workspace._id.toString(), workspace.name,
    ]));
    let changed = 0;
    let alreadyCorrect = 0;
    let skipped = 0;

    console.log(`${APPLY ? 'Applying' : 'Dry run'}: inspecting ${memberships.length} FlowTask membership(s).`);
    for (const membership of memberships) {
      let workspaceRole;
      try {
        ({ workspaceRole } = mapFlowTaskAccessToWorkspaceRole(membership.flowTaskAccess));
      } catch (error) {
        skipped += 1;
        console.warn(`SKIP membership=${membership._id}: ${error.message}`);
        continue;
      }

      if (membership.role === workspaceRole) {
        alreadyCorrect += 1;
        continue;
      }

      changed += 1;
      console.log(
        `${APPLY ? 'UPDATE' : 'WOULD UPDATE'} workspace=${workspaceNames.get(membership.workspaceId.toString()) || membership.workspaceId}`
        + ` membership=${membership._id} ${membership.role} -> ${workspaceRole}`,
      );
      if (APPLY) {
        await WorkspaceMembership.updateOne(
          { _id: membership._id, isActive: true },
          { $set: { role: workspaceRole } },
        );
      }
    }

    console.log(JSON.stringify({
      mode: APPLY ? 'apply' : 'dry-run',
      inspected: memberships.length,
      changed,
      alreadyCorrect,
      skipped,
    }));
  } finally {
    await disconnectDatabase();
  }
}

run().catch((error) => {
  console.error('FlowTask workspace role migration failed:', error.message);
  process.exitCode = 1;
});
