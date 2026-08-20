import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * WorkspaceMapping — permanent 1:1 link between a ChatApp Workspace and its
 * counterpart Workspace in FlowTask (a separate MongoDB deployment — no
 * cross-DB joins possible, so each side keeps its own copy of the mapping).
 *
 * This replaces the old "at most one active source:'flowtask' Workspace,
 * ever" singleton (formerly enforced by a partial-unique index on
 * Workspace.source — see Workspace.model.js) with a real per-tenant mapping:
 * every FlowTask workspace that opens ChatApp for the first time gets its
 * own ChatApp workspace, linked here by FlowTask's real workspace id.
 *
 * FlowTask never learns/stores ChatApp's id proactively — it always sends
 * its OWN workspace id (as a JWT claim on SSO login, and as
 * payload.workspaceId / X-FlowTask-Workspace on every webhook). ChatApp is
 * the side that resolves that id to a local workspace, via this collection,
 * on every receipt (see workspace.service.js#findOrCreateFlowTaskWorkspace
 * and webhooks/webhook.controller.js#resolveWebhookWorkspace).
 */
const workspaceMappingSchema = new Schema({
  chatWorkspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  // FlowTask's own workspace ObjectId, stored as a plain string — it is not
  // a local ref/populate target, just an opaque external identifier.
  flowTaskWorkspaceId: { type: String, required: true, match: /^[0-9a-fA-F]{24}$/ },
  flowTaskWorkspaceSlug: { type: String, default: null },
  flowTaskWorkspaceName: { type: String, default: null },
  status: { type: String, enum: ['active', 'revoked'], default: 'active' },
  // Unused until Phase 2's reverse (ChatApp→FlowTask) sync exists, but the
  // field is added now so it doesn't require a later migration.
  syncOrigin: { type: String, enum: ['user_initiated', 'sync_provisioned'], required: true, default: 'user_initiated' },
  createdByChatUserId: { type: Schema.Types.ObjectId, ref: 'ChatUser', default: null },
  lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: true });

workspaceMappingSchema.index({ flowTaskWorkspaceId: 1 }, { unique: true });
workspaceMappingSchema.index({ chatWorkspaceId: 1 }, { unique: true });

/**
 * Find the active mapping for a given FlowTask workspace id.
 * @param {string} flowTaskWorkspaceId
 */
workspaceMappingSchema.statics.findByFlowTaskWorkspaceId = function (flowTaskWorkspaceId) {
  return this.findOne({ flowTaskWorkspaceId, status: 'active' });
};

const WorkspaceMapping = model('WorkspaceMapping', workspaceMappingSchema);

export default WorkspaceMapping;
