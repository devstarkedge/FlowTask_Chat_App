import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * OrganizationMembership — junction linking users to organizations.
 *
 * Supports multi-org: a user can belong to multiple organizations.
 * Organization-level role is separate from workspace-level role.
 *
 * Org roles:
 *   - owner:  Full org control, billing, can create/delete workspaces
 *   - admin:  Manage workspaces, members, integrations
 *   - member: Join workspaces, participate normally
 */

const orgMembershipSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    required: true,
  },
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
  },
  role: {
    type: String,
    enum: ['owner', 'admin', 'member'],
    default: 'member',
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  },
  invitedBy: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    default: null,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
orgMembershipSchema.index({ userId: 1, organizationId: 1 }, { unique: true });
orgMembershipSchema.index({ organizationId: 1, role: 1, isActive: 1 });
orgMembershipSchema.index({ userId: 1, isActive: 1 });

// ─── Static Methods ──────────────────────────────────────────────────────────

orgMembershipSchema.statics.findUserOrgs = function (userId) {
  return this.find({ userId, isActive: true })
    .populate('organizationId', 'name slug plan isActive')
    .sort({ joinedAt: 1 })
    .lean();
};

orgMembershipSchema.statics.isMember = function (userId, organizationId) {
  return this.findOne({ userId, organizationId, isActive: true }).lean();
};

orgMembershipSchema.statics.addMember = async function (userId, organizationId, role = 'member', invitedBy = null) {
  return this.findOneAndUpdate(
    { userId, organizationId },
    {
      $set: { role, isActive: true },
      $setOnInsert: { joinedAt: new Date(), invitedBy },
    },
    { upsert: true, new: true },
  );
};

orgMembershipSchema.statics.removeMember = function (userId, organizationId) {
  return this.findOneAndUpdate(
    { userId, organizationId },
    { $set: { isActive: false } },
    { new: true },
  );
};

const OrganizationMembership = model('OrganizationMembership', orgMembershipSchema);

export default OrganizationMembership;
