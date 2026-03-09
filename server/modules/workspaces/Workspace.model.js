import mongoose from 'mongoose';
import crypto from 'crypto';

const { Schema, model } = mongoose;

/**
 * Workspace — the top-level tenant boundary for multi-tenant isolation.
 *
 * Every workspace is a standalone tenant (like Slack workspaces).
 * All data (channels, messages, files) is scoped to a workspace.
 * Users have global identity and join workspaces via WorkspaceMembership.
 *
 * Examples:
 *   - FlowTask platform → Workspace slug: "flowtask"
 *   - External company ACME → Workspace slug: "acme"
 *
 * Resolution methods:
 *   - X-Workspace-Id header
 *   - Subdomain extraction (acme.chatapp.com → slug "acme")
 */

const workspaceSettingsSchema = new Schema({
  // Default visibility for new channels in this workspace
  defaultChannelVisibility: {
    type: String,
    enum: ['public', 'private'],
    default: 'public',
  },
  // Allow guest (read-only) access to specific channels
  allowGuestAccess: {
    type: Boolean,
    default: false,
  },
  // Maximum members allowed (-1 = unlimited)
  maxMembers: {
    type: Number,
    default: -1,
  },
  // Feature flags for this workspace
  features: {
    threads: { type: Boolean, default: true },
    reactions: { type: Boolean, default: true },
    fileUploads: { type: Boolean, default: true },
    customEmoji: { type: Boolean, default: false },
    videoCall: { type: Boolean, default: false },
  },
  // FlowTask integration specific settings
  flowtaskIntegration: {
    enabled: { type: Boolean, default: false },
    apiUrl: { type: String, default: '' },
    webhookSecret: { type: String, default: '', select: false },
  },
}, { _id: false });

const workspaceSchema = new Schema({
  // Display name of the workspace
  name: {
    type: String,
    required: true,
    maxlength: 100,
    trim: true,
  },
  // URL-safe identifier, globally unique (used in subdomains/paths)
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    maxlength: 50,
    trim: true,
    match: [/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, 'Slug must contain only lowercase letters, numbers, and hyphens'],
  },
  // Workspace logo URL (Cloudinary or external)
  logo: {
    type: String,
    default: null,
  },
  // Description shown on workspace profile / invite pages
  description: {
    type: String,
    maxlength: 500,
    default: '',
  },
  // The user who created this workspace (always has owner role)
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    default: null,
  },
  // Subscription plan tier
  plan: {
    type: String,
    enum: ['free', 'pro', 'enterprise'],
    default: 'free',
  },
  // Workspace-level configuration
  settings: {
    type: workspaceSettingsSchema,
    default: () => ({}),
  },
  // Soft-delete support
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  // Invite code for joining this workspace
  inviteCode: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  // Denormalized member count for listing pages
  memberCount: {
    type: Number,
    default: 0,
  },
  // ─── Billing (Stripe-ready) ───────────────────────────────────────────
  billing: {
    stripeCustomerId: { type: String, default: null, sparse: true },
    stripeSubscriptionId: { type: String, default: null, sparse: true },
    billingStatus: {
      type: String,
      enum: ['active', 'trialing', 'past_due', 'canceled', 'unpaid'],
      default: 'active',
    },
    billingEmail: { type: String, default: null },
    planExpiresAt: { type: Date, default: null },
    trialEndsAt: { type: Date, default: null },
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
// slug is already unique — primary lookup path
// owner for "my workspaces" queries
workspaceSchema.index({ owner: 1 });
// Active workspaces sorted by name for listing
workspaceSchema.index({ isActive: 1, name: 1 });
workspaceSchema.index({ 'billing.stripeCustomerId': 1 }, { sparse: true });
workspaceSchema.index({ 'billing.stripeSubscriptionId': 1 }, { sparse: true });

// ─── Instance Methods ────────────────────────────────────────────────────────

/**
 * Generate a random invite code for this workspace.
 * @returns {string} 8-char alphanumeric code
 */
workspaceSchema.methods.generateInviteCode = function () {
  this.inviteCode = crypto.randomBytes(6).toString('base64url').slice(0, 8);
  return this.inviteCode;
};

// ─── Static Methods ──────────────────────────────────────────────────────────

/**
 * Find workspace by slug.
 * @param {string} slug
 * @returns {Promise<Workspace|null>}
 */
workspaceSchema.statics.findBySlug = function (slug) {
  if (!slug) return null;
  return this.findOne({ slug: slug.toLowerCase(), isActive: true });
};

/**
 * Find workspace by invite code.
 * @param {string} code
 * @returns {Promise<Workspace|null>}
 */
workspaceSchema.statics.findByInviteCode = function (code) {
  if (!code) return null;
  return this.findOne({ inviteCode: code, isActive: true });
};

const Workspace = model('Workspace', workspaceSchema);

export default Workspace;
