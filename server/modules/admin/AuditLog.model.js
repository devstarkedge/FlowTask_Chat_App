import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * AuditLog — immutable record of significant system actions.
 *
 * Used for compliance, debugging, and admin dashboards.
 * Entries auto-expire after 90 days via TTL index.
 */

const AUDIT_ACTIONS = [
  'CHANNEL_CREATED',
  'CHANNEL_UPDATED',
  'CHANNEL_ARCHIVED',
  'CHANNEL_DELETED',
  'MEMBER_ADDED',
  'MEMBER_REMOVED',
  'MEMBER_SYNCED',
  'ROLE_CHANGED',
  'PERMISSION_CHANGED',
  'CHANNEL_SYNCED',
  'USER_ACTIVATED',
  'WEBHOOK_PROCESSED',
  // Invitation lifecycle
  'INVITE_CREATED',
  'INVITE_ACCEPTED',
  'INVITE_DECLINED',
  'INVITE_EXPIRED',
  'INVITE_REVOKED',
  'INVITE_RESENT',
];

const auditLogSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    action: {
      type: String,
      enum: AUDIT_ACTIONS,
      required: true,
    },
    entityType: {
      type: String,
      enum: ['channel', 'user', 'workspace', 'member', 'invite'],
      required: true,
    },
    entityId: {
      type: String,
      required: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'ChatUser',
      default: null, // null = system action
    },
    actorName: {
      type: String,
      default: 'System',
    },
    details: {
      type: Schema.Types.Mixed,
      default: {},
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      index: { expires: 0 },
    },
  },
  {
    timestamps: false, // Use createdAt only
  },
);

// ─── Indexes ────────────────────────────────────────────────────────────────
auditLogSchema.index({ workspaceId: 1, createdAt: -1 });
auditLogSchema.index({ workspaceId: 1, action: 1, createdAt: -1 });
auditLogSchema.index({ workspaceId: 1, entityType: 1, entityId: 1 });
auditLogSchema.index({ workspaceId: 1, actorId: 1, createdAt: -1 });

const AuditLog = model('AuditLog', auditLogSchema);

export default AuditLog;
export { AUDIT_ACTIONS };
