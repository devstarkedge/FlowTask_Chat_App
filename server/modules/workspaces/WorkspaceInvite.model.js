import mongoose from 'mongoose';
import crypto from 'node:crypto';

const { Schema, model } = mongoose;

/**
 * WorkspaceInvite — tracks email-based invitations to workspaces.
 *
 * Flow:
 *   1. Admin sends invite to email
 *   2. Invite record created with unique token (hashed in DB)
 *   3. Email sent with invite link (plain token in URL)
 *   4. User clicks link → registers/logs in → joins workspace
 *   5. Invite marked as accepted
 *
 * Auto-expires after 7 days via TTL index.
 */

/**
 * Hash a token using SHA-256.
 * @param {string} token - Plain text token
 * @returns {string} Hashed token
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const workspaceInviteSchema = new Schema({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
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
  inviteType: {
    type: String,
    enum: ['member', 'guest'],
    default: 'member',
  },
  invitedBy: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'expired', 'revoked', 'email_failed'],
    default: 'pending',
  },
  tokenHash: {
    type: String,
    unique: true,
    sparse: true,
    required: true,
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
  resendCount: {
    type: Number,
    default: 0,
  },
  lastResentAt: {
    type: Date,
    default: null,
  },
  revokedAt: {
    type: Date,
    default: null,
  },
  revokedBy: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    default: null,
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
// Token hash lookup for accepting invites
workspaceInviteSchema.index({ tokenHash: 1 }, { unique: true, sparse: true });
// Email + status for invite lookups by email
workspaceInviteSchema.index({ email: 1, status: 1 });
// TTL for auto-expiry (only pending invites not yet expired)
workspaceInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Performance: status + workspace lookups
workspaceInviteSchema.index({ status: 1, workspaceId: 1 });
// Performance: invitedBy lookups
workspaceInviteSchema.index({ invitedBy: 1 });

// ─── Static Methods ──────────────────────────────────────────────────────────

/**
 * Find a valid (non-expired, pending) invite by token.
 * @param {string} token - Plain text token from URL
 */
workspaceInviteSchema.statics.findValidByToken = function (token) {
  const tokenHash = hashToken(token);
  return this.findOne({
    tokenHash,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  }).populate('workspaceId', 'name slug logo plan');
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
 * @param {string} token - Plain text token
 * @param {string} userId - User ID accepting the invite
 */
workspaceInviteSchema.statics.markAccepted = function (token, userId) {
  const tokenHash = hashToken(token);
  return this.findOneAndUpdate(
    { tokenHash, status: 'pending' },
    { $set: { status: 'accepted', acceptedAt: new Date(), acceptedBy: userId } },
    { returnDocument: 'after' },
  );
};

/**
 * Revoke a pending invite.
 */
workspaceInviteSchema.statics.revoke = function (inviteId, workspaceId, revokedBy) {
  return this.findOneAndUpdate(
    { _id: inviteId, workspaceId, status: 'pending' },
    { $set: { status: 'revoked', revokedAt: new Date(), revokedBy } },
    { returnDocument: 'after' },
  );
};

/**
 * Resend a pending invite with a new token.
 * Returns the updated invite and the plain token for email delivery.
 */
workspaceInviteSchema.statics.resend = function (inviteId, workspaceId) {
  const { token, tokenHash } = this.generateTokenPair();
  const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  
  return this.findOneAndUpdate(
    { _id: inviteId, workspaceId, status: 'pending' },
    { 
      $set: { 
        tokenHash,
        expiresAt: newExpiresAt,
        lastResentAt: new Date(),
      },
      $inc: { resendCount: 1 },
    },
    { returnDocument: 'after' },
  ).then(invite => ({ invite, newToken: token }));
};

/**
 * Get all invites for a workspace with filters and pagination.
 */
workspaceInviteSchema.statics.findAll = function (workspaceId, { status, inviteType, page = 1, limit = 20 }) {
  const filter = { workspaceId };
  if (status) filter.status = status;
  if (inviteType) filter.inviteType = inviteType;
  
  const skip = (page - 1) * limit;
  
  return Promise.all([
    this.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('invitedBy', 'name email')
      .populate('acceptedBy', 'name email')
      .lean(),
    this.countDocuments(filter),
  ]).then(([invites, total]) => ({
    invites,
    total,
    page,
    pages: Math.ceil(total / limit),
  }));
};

// ─── Static: generate token pair ────────────────────────────────────────────
/**
 * Generate a plain token and its SHA-256 hash.
 * The plain token is returned for email delivery; only the hash is stored.
 * @returns {{ token: string, tokenHash: string }}
 */
workspaceInviteSchema.statics.generateTokenPair = function () {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  return { token, tokenHash };
};

const WorkspaceInvite = model('WorkspaceInvite', workspaceInviteSchema);

export default WorkspaceInvite;