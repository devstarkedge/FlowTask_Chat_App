import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Organization — the top-level tenant boundary.
 *
 * Hierarchy:
 *   Organization
 *   └── Workspaces
 *       ├── Members
 *       ├── Channels
 *       ├── Messages
 *       ├── Files
 *       └── Notifications
 *
 * Every entity in the system is scoped to an organization.
 * This prevents cross-tenant data leakage at the highest level.
 *
 * An organization can have multiple workspaces (like Slack Enterprise Grid).
 */

const orgSettingsSchema = new Schema({
  // Maximum workspaces allowed (-1 = unlimited)
  maxWorkspaces: {
    type: Number,
    default: 5,
  },
  // Maximum total members across all workspaces (-1 = unlimited)
  maxTotalMembers: {
    type: Number,
    default: -1,
  },
  // Default plan for new workspaces
  defaultWorkspacePlan: {
    type: String,
    enum: ['free', 'pro', 'enterprise'],
    default: 'free',
  },
  // Whether to allow workspace self-creation by members
  allowWorkspaceCreation: {
    type: Boolean,
    default: true,
  },
  // SSO enforcement
  ssoRequired: {
    type: Boolean,
    default: false,
  },
  // Custom branding
  branding: {
    primaryColor: { type: String, default: '#1264A3' },
    logoUrl: { type: String, default: null },
    faviconUrl: { type: String, default: null },
  },
}, { _id: false });

const organizationSchema = new Schema({
  name: {
    type: String,
    required: true,
    maxlength: 100,
    trim: true,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    maxlength: 50,
    trim: true,
    match: [/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, 'Slug must contain only lowercase letters, numbers, and hyphens'],
  },
  // The user who created this organization (always has owner role)
  ownerId: {
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
  settings: {
    type: orgSettingsSchema,
    default: () => ({}),
  },
  // Soft-delete support
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  // Denormalized counts
  workspaceCount: {
    type: Number,
    default: 0,
  },
  memberCount: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
organizationSchema.index({ ownerId: 1 });
organizationSchema.index({ isActive: 1, name: 1 });

// ─── Static Methods ──────────────────────────────────────────────────────────

organizationSchema.statics.findBySlug = function (slug) {
  if (!slug) return null;
  return this.findOne({ slug: slug.toLowerCase(), isActive: true });
};

const Organization = model('Organization', organizationSchema);

export default Organization;
