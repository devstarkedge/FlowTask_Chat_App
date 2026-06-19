import mongoose from 'mongoose';
import crypto from 'node:crypto';

const { Schema, model } = mongoose;

/**
 * WorkspaceInvite — tracks email-based invitations to workspaces.
 *
 * Flow:
 *   1. Admin sends invite to email
 *   2. Invite record created with unique token
 *   3. Email sent with invite link
 *   4. User clicks link → registers/logs in → joins workspace
 *   5. Invite marked as accepted
 *
 * Auto-expires after 7 days via TTL index.
 */
const workspaceInviteSchema = new Schema({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  channels: [{
    type: Schema.Types.ObjectId,
    ref: 'Channel',
  }],
  role: {
    type: String,
    enum: ['owner', 'admin', 'member', 'guest'],
    default: 'member',
  },
  invitedBy: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'expired', 'revoked'],
    default: 'pending',
  },
  token: {
    type: String,
    default: () => crypto.randomBytes(32).toString('hex'),
    unique: true,
  },
  acceptedAt: {
    type: Date,
    default: null,
  },
  acceptedBy: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    default: null,
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  },
}, {
  timestamps: true,
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
// Prevent duplicate pending invites for same email in same workspace
workspaceInviteSchema.index(
  { workspaceId: 1, email: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
);
// Token lookup for accepting invites — index created automatically via unique:true on the field
// TTL for auto-expiry (only pending invites not yet expired)
workspaceInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ─── Static Methods ──────────────────────────────────────────────────────────

/**
 * Find a valid (non-expired, pending) invite by token.
 */
workspaceInviteSchema.statics.findValidByToken = function (token) {
  return this.findOne({
    token,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  }).populate('workspaceId', 'name slug logo');
};

/**
 * Get all pending invites for a workspace.
 */
workspaceInviteSchema.statics.getPendingInvites = function (workspaceId) {
  return this.find({
    workspaceId,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean();
};

/**
 * Mark an invite as accepted.
 */
workspaceInviteSchema.statics.markAccepted = function (token, userId) {
  return this.findOneAndUpdate(
    { token, status: 'pending' },
    { $set: { status: 'accepted', acceptedAt: new Date(), acceptedBy: userId } },
    { returnDocument: 'after' },
  );
};

/**
 * Revoke a pending invite.
 */
workspaceInviteSchema.statics.revoke = function (inviteId, workspaceId) {
  return this.findOneAndUpdate(
    { _id: inviteId, workspaceId, status: 'pending' },
    { $set: { status: 'revoked' } },
    { returnDocument: 'after' },
  );
};

const WorkspaceInvite = model('WorkspaceInvite', workspaceInviteSchema);

export default WorkspaceInvite;
