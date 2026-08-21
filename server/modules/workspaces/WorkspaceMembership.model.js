import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// FlowTask is the source of truth for this data. It intentionally belongs on
// the user+workspace relation, never on ChatUser: the same person can be an
// admin in one FlowTask workspace and an employee in another.
const flowTaskAccessSchema = new Schema({
  // Missing FlowTask access is invalid; never manufacture an employee role.
  role: { type: String, default: null, lowercase: true },
  roleId: { type: String, default: null },
  departmentIds: [{ type: String }],
  teamId: { type: String, default: null },
  accessType: {
    type: String,
    enum: ['full_department', 'selected_projects', 'assigned_tasks'],
    default: 'assigned_tasks',
  },
  allowedProjectIds: [{ type: String }],
  canViewAllProjects: { type: Boolean, default: false },
  canViewDepartmentProjects: { type: Boolean, default: false },
  canViewSelectedProjects: { type: Boolean, default: false },
  canViewPublicProjects: { type: Boolean, default: false },
  // Signed, workspace-scoped FlowTask custom-role permissions. ChatApp keeps
  // this with the membership so another workspace's custom role cannot leak
  // into permission decisions.
  rolePermissions: { type: Schema.Types.Mixed, default: null },
  syncedAt: { type: Date, default: null },
}, { _id: false });

/**
 * WorkspaceMembership — junction model linking ChatUsers to Workspaces.
 *
 * Enables many-to-many: a user can belong to multiple workspaces (like Slack),
 * and a workspace has many members. Each membership carries a workspace-level role.
 *
 * Workspace roles (distinct from channel roles):
 *   - owner:  Full workspace control, billing, settings, can delete workspace
 *   - admin:  Manage channels, members, integrations
 *   - member: Create channels, send messages, upload files
 *   - guest:  Read-only access to invited channels only
 */

const workspaceMembershipSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    required: true,
  },
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  // Workspace-level role (not the same as channel member role)
  role: {
    type: String,
    enum: ['owner', 'admin', 'member', 'guest'],
    default: 'member',
  },
  // When the user joined this workspace
  joinedAt: {
    type: Date,
    default: Date.now,
  },
  // Who invited this user (null for workspace creators / self-join via invite code)
  invitedBy: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    default: null,
  },
  // User can leave/be removed — soft state for audit trail
  isActive: {
    type: Boolean,
    default: true,
  },
  // Workspace-specific display name override (optional)
  displayName: {
    type: String,
    maxlength: 50,
    default: null,
  },
  flowTaskAccess: {
    type: flowTaskAccessSchema,
    default: null,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
// One membership per user per workspace (unique constraint)
workspaceMembershipSchema.index({ userId: 1, workspaceId: 1 }, { unique: true });
// All members of a workspace, sorted by role for listing
workspaceMembershipSchema.index({ workspaceId: 1, role: 1, isActive: 1 });
// User's workspaces (for "workspace switcher" query)
workspaceMembershipSchema.index({ userId: 1, isActive: 1 });
// Membership lookup by userId + workspaceId + isActive (auth middleware hot path)
workspaceMembershipSchema.index({ userId: 1, workspaceId: 1, isActive: 1 });

// ─── Static Methods ──────────────────────────────────────────────────────────

/**
 * Find all active workspace memberships for a user.
 * Used by workspace switcher and login flow.
 * @param {string} userId
 * @returns {Promise<WorkspaceMembership[]>}
 */
workspaceMembershipSchema.statics.findUserWorkspaces = function (userId) {
  return this.find({ userId, isActive: true })
    .populate('workspaceId', 'name slug logo description plan isActive memberCount inviteCode')
    .sort({ joinedAt: 1 })
    .lean();
};

/**
 * Find all active members of a workspace.
 * @param {string} workspaceId
 * @param {object} [options]
 * @param {number} [options.limit=100]
 * @param {number} [options.skip=0]
 * @returns {Promise<WorkspaceMembership[]>}
 */
workspaceMembershipSchema.statics.findWorkspaceMembers = function (workspaceId, { limit = 100, skip = 0 } = {}) {
  return this.find({ workspaceId, isActive: true })
    .populate('userId', 'name email avatar role onlineStatus flowTaskUserId')
    .sort({ role: 1, joinedAt: 1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

/**
 * Check if a user is an active member of a workspace.
 * @param {string} userId
 * @param {string} workspaceId
 * @returns {Promise<WorkspaceMembership|null>}
 */
workspaceMembershipSchema.statics.isMember = function (userId, workspaceId) {
  return this.findOne({ userId, workspaceId, isActive: true }).lean();
};

/**
 * Get a user's role in a workspace.
 * @param {string} userId
 * @param {string} workspaceId
 * @returns {Promise<string|null>}
 */
workspaceMembershipSchema.statics.getUserRole = async function (userId, workspaceId) {
  const membership = await this.findOne({ userId, workspaceId, isActive: true }, { role: 1 }).lean();
  return membership?.role || null;
};

/**
 * Add a user to a workspace (idempotent).
 * @param {string} userId
 * @param {string} workspaceId
 * @param {string} [role='member']
 * @param {string|null} [invitedBy=null]
 * @returns {Promise<WorkspaceMembership>}
 */
workspaceMembershipSchema.statics.addMember = async function (userId, workspaceId, role = 'member', invitedBy = null) {
  const { default: Workspace } = await import('./Workspace.model.js');
  const reactivated = await this.findOneAndUpdate(
    { userId, workspaceId, isActive: false },
    { $set: { role, isActive: true } },
    { returnDocument: 'after' },
  );
  if (reactivated) {
    await Workspace.updateOne({ _id: workspaceId }, { $inc: { memberCount: 1 } });
    return reactivated;
  }

  const active = await this.findOneAndUpdate(
    { userId, workspaceId, isActive: true },
    { $set: { role } },
    { returnDocument: 'after' },
  );
  if (active) return active;

  try {
    const membership = await this.create({
      userId,
      workspaceId,
      role,
      invitedBy,
      isActive: true,
      joinedAt: new Date(),
    });
    await Workspace.updateOne({ _id: workspaceId }, { $inc: { memberCount: 1 } });
    return membership;
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return this.findOneAndUpdate(
      { userId, workspaceId },
      { $set: { role, isActive: true } },
      { returnDocument: 'after' },
    );
  }
};

/**
 * Remove (deactivate) a user from a workspace.
 * @param {string} userId
 * @param {string} workspaceId
 * @returns {Promise<WorkspaceMembership|null>}
 */
workspaceMembershipSchema.statics.removeMember = async function (userId, workspaceId) {
  const membership = await this.findOneAndUpdate(
    { userId, workspaceId, isActive: true },
    { $set: { isActive: false } },
    { returnDocument: 'after' },
  );

  // Sync denormalized memberCount on Workspace
  if (membership) {
    const { default: Workspace } = await import('./Workspace.model.js');
    await Workspace.updateOne({ _id: workspaceId }, { $inc: { memberCount: -1 } });
  }

  return membership;
};

/**
 * Count active members in a workspace.
 * @param {string} workspaceId
 * @returns {Promise<number>}
 */
workspaceMembershipSchema.statics.countMembers = function (workspaceId) {
  return this.countDocuments({ workspaceId, isActive: true });
};

const WorkspaceMembership = model('WorkspaceMembership', workspaceMembershipSchema);

export default WorkspaceMembership;
