import mongoose from 'mongoose';
import {
  CHANNEL_TYPES,
  CHANNEL_VISIBILITY,
  CHANNEL_MEMBER_ROLES,
} from '../../config/constants.js';

const { Schema, model } = mongoose;

/**
 * Channel — the primary organizational unit for chat.
 *
 * Mapping to FlowTask entities (spec §4.1):
 *   Board (Project) → Channel (type: project)
 *   Department      → Channel (type: department)
 *   Team            → Channel (type: team)
 *   System singletons (general, admin, managers, announcements)
 *
 * Channel membership is synced from FlowTask via events.
 * DM channels are chat-owned and not mapped to FlowTask entities.
 */

const channelMemberSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    required: true,
  },
  role: {
    type: String,
    enum: Object.values(CHANNEL_MEMBER_ROLES),
    default: CHANNEL_MEMBER_ROLES.MEMBER,
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  },
  // Per-member notification preferences
  notificationsEnabled: {
    type: Boolean,
    default: true,
  },
}, { _id: false });

const flowTaskRefSchema = new Schema({
  entityType: {
    type: String,
    enum: ['board', 'department', 'team'],
    required: true,
  },
  entityId: {
    type: String,
    required: true,
  },
}, { _id: false });

const channelSchema = new Schema({
  name: {
    type: String,
    required: true,
    maxlength: 100,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    maxlength: 80,
  },
  type: {
    type: String,
    enum: Object.values(CHANNEL_TYPES),
    required: true,
    index: true,
  },
  // Reference to the FlowTask entity this channel represents.
  // Null for DM and system channels without a direct entity mapping.
  flowTaskRef: {
    type: flowTaskRefSchema,
    default: null,
  },
  description: {
    type: String,
    maxlength: 500,
    default: '',
  },
  topic: {
    type: String,
    maxlength: 250,
    default: '',
  },
  members: [channelMemberSchema],

  visibility: {
    type: String,
    enum: Object.values(CHANNEL_VISIBILITY),
    default: CHANNEL_VISIBILITY.PUBLIC,
  },
  // For DM channels: participant FlowTask user IDs for quick lookup
  dmParticipants: [{
    type: String,
  }],
  isArchived: {
    type: Boolean,
    default: false,
    index: true,
  },
  archivedAt: {
    type: Date,
    default: null,
  },
  archivedReason: {
    type: String,
    default: null,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    default: null,
  },
  // ─── Denormalized fields for sidebar performance ───
  memberCount: {
    type: Number,
    default: 0,
  },
  lastMessageAt: {
    type: Date,
    default: null,
    index: true,
  },
  lastMessagePreview: {
    type: String,
    maxlength: 200,
    default: '',
  },
  pinnedMessageIds: [{
    type: Schema.Types.ObjectId,
    ref: 'Message',
  }],
  metadata: {
    type: Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// ─── Compound Indexes ────────────────────────────────────────────────────────
// Fast lookup by FlowTask entity (e.g., find channel for board X)
channelSchema.index(
  { 'flowTaskRef.entityType': 1, 'flowTaskRef.entityId': 1 },
  { sparse: true, unique: true },
);
// User's channel list sorted by recent activity
channelSchema.index({ 'members.userId': 1, lastMessageAt: -1 });
// DM participant lookup
channelSchema.index({ dmParticipants: 1 }, { sparse: true });
// Type + archive filter
channelSchema.index({ type: 1, isArchived: 1 });

// ─── Pre-save hooks ──────────────────────────────────────────────────────────
channelSchema.pre('save', function (next) {
  if (this.isModified('members')) {
    this.memberCount = this.members.length;
  }
  next();
});

// ─── Instance Methods ────────────────────────────────────────────────────────
channelSchema.methods.hasMember = function (userId) {
  return this.members.some((m) => m.userId.toString() === userId.toString());
};

channelSchema.methods.getMemberRole = function (userId) {
  const member = this.members.find((m) => m.userId.toString() === userId.toString());
  return member?.role || null;
};

channelSchema.methods.isOwner = function (userId) {
  return this.getMemberRole(userId) === CHANNEL_MEMBER_ROLES.OWNER;
};

// ─── Static Methods ──────────────────────────────────────────────────────────
channelSchema.statics.findByFlowTaskRef = function (entityType, entityId) {
  return this.findOne({
    'flowTaskRef.entityType': entityType,
    'flowTaskRef.entityId': entityId,
  });
};

channelSchema.statics.findUserChannels = function (userId, includeArchived = false) {
  const filter = { 'members.userId': userId };
  if (!includeArchived) filter.isArchived = false;
  return this.find(filter).sort({ lastMessageAt: -1 });
};

channelSchema.statics.findDMChannel = function (participantIds) {
  const sorted = [...participantIds].sort();
  return this.findOne({
    type: CHANNEL_TYPES.DM,
    dmParticipants: { $all: sorted, $size: sorted.length },
  });
};

const Channel = model('Channel', channelSchema);

export default Channel;
