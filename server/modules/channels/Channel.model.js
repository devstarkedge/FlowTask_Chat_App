import mongoose from "mongoose";
import {
  CHANNEL_TYPES,
  CHANNEL_VISIBILITY,
  CHANNEL_MEMBER_ROLES,
} from "../../config/constants.js";

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

const channelMemberSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "ChatUser",
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
  },
  { _id: false },
);

const flowTaskRefSchema = new Schema(
  {
    entityType: {
      type: String,
      enum: ["board", "department", "team"],
      required: true,
    },
    entityId: {
      type: String,
      required: true,
    },
  },
  { _id: false },
);

const channelSchema = new Schema(
  {
    // ─── Workspace Scope (multi-tenant isolation) ─────────────────────────
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      maxlength: 80,
    },
    slug: {
      type: String,
      required: true,
      // unique per workspace — compound index below replaces global unique
      lowercase: true,
      maxlength: 80,
    },
    type: {
      type: String,
      enum: Object.values(CHANNEL_TYPES),
      required: true,
      // index: removed — covered by compound { type: 1, isArchived: 1 }
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
      default: "",
    },
    topic: {
      type: String,
      maxlength: 250,
      default: "",
    },
    members: [channelMemberSchema],

    visibility: {
      type: String,
      enum: Object.values(CHANNEL_VISIBILITY),
      default: CHANNEL_VISIBILITY.PUBLIC,
    },
    // For DM channels: participant FlowTask user IDs for quick lookup
    dmParticipants: [
      {
        type: String,
      },
    ],
    // Deterministic key for one-to-one DM uniqueness within a workspace.
    dmKey: {
      type: String,
      default: null,
    },
    isArchived: {
      type: Boolean,
      default: false,
      // index: removed — covered by compound { type: 1, isArchived: 1 }
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
      ref: "ChatUser",
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
      // index: removed — covered by compound { members.userId: 1, lastMessageAt: -1 }
    },
    lastMessagePreview: {
      type: String,
      maxlength: 200,
      default: "",
    },
    pinnedMessageIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Message",
      },
    ],
    // Whether this channel is system-managed (created by FlowTask integration)
    systemManaged: {
      type: Boolean,
      default: false,
    },
    // Admin override rules for system-managed channels
    adminOverrides: {
      allowRename: { type: Boolean, default: false },
      allowArchive: { type: Boolean, default: false },
      allowMemberEdit: { type: Boolean, default: false },
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    // ─── Department categorization (from FlowTask board.department) ───
    departmentRef: {
      departmentId: { type: String, default: null },
      departmentName: { type: String, default: null },
    },
    isAI: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ─── Compound Indexes (all workspace-scoped) ────────────────────────────────
// Workspace-scoped unique slug (replaces global unique)
channelSchema.index({ workspaceId: 1, slug: 1 }, { unique: true });
// Fast lookup by FlowTask entity within a workspace
channelSchema.index(
  { workspaceId: 1, "flowTaskRef.entityType": 1, "flowTaskRef.entityId": 1 },
  {
    unique: true,
    partialFilterExpression: {
      "flowTaskRef.entityType": { $type: "string" },
      "flowTaskRef.entityId": { $type: "string" },
    },
  },
);
// User's channel list sorted by recent activity within workspace
channelSchema.index({ workspaceId: 1, "members.userId": 1, lastMessageAt: -1 });
// DM participant lookup within workspace
channelSchema.index({ workspaceId: 1, dmParticipants: 1 }, { sparse: true });
// Ensure single DM per participant pair per workspace
channelSchema.index(
  { workspaceId: 1, dmKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: CHANNEL_TYPES.DM,
      dmKey: { $type: "string" },
    },
  },
);
// Type + archive filter within workspace
channelSchema.index({ workspaceId: 1, type: 1, isArchived: 1 });
// Department-scoped channel lookup
channelSchema.index({ workspaceId: 1, 'departmentRef.departmentId': 1 }, { sparse: true });

// ─── Pre-save hooks ──────────────────────────────────────────────────────────
channelSchema.pre("save", function () {
  if (this.isModified("members")) {
    this.memberCount = this.members.length;
  }
  
});

// ─── Instance Methods ────────────────────────────────────────────────────────
channelSchema.methods.hasMember = function (userId) {
  return this.members.some((m) => m.userId.toString() === userId.toString());
};

channelSchema.methods.getMemberRole = function (userId) {
  const member = this.members.find(
    (m) => m.userId.toString() === userId.toString(),
  );
  return member?.role || null;
};

channelSchema.methods.isOwner = function (userId) {
  return this.getMemberRole(userId) === CHANNEL_MEMBER_ROLES.OWNER;
};

// ─── Static Methods ──────────────────────────────────────────────────────────
channelSchema.statics.findByFlowTaskRef = function (
  entityType,
  entityId,
  workspaceId,
) {
  // Normalize entityId: allow string, ObjectId, or full board object
  let normalizedId = entityId;
  try {
    if (normalizedId && typeof normalizedId === 'object') {
      if (normalizedId._id) normalizedId = normalizedId._id.toString();
      else if (normalizedId.id) normalizedId = normalizedId.id.toString();
      else {
        // Fall back to toString if it yields a sensible representation
        const s = normalizedId.toString();
        normalizedId = s && s !== '[object Object]' ? s : null;
      }
    }
  } catch (err) {
    normalizedId = null;
  }

  const filter = {
    "flowTaskRef.entityType": entityType,
    "flowTaskRef.entityId": normalizedId,
  };
  if (workspaceId) filter.workspaceId = workspaceId;
  return this.findOne(filter);
};

channelSchema.statics.findUserChannels = function (
  userId,
  includeArchived = false,
  workspaceId,
) {
  const filter = { "members.userId": userId };
  if (!includeArchived) filter.isArchived = false;
  if (workspaceId) filter.workspaceId = workspaceId;
  return this.find(filter).sort({ lastMessageAt: -1 });
};

channelSchema.statics.findDMChannel = function (participantIds, workspaceId) {
  const sorted = [...participantIds].sort();
  const filter = {
    type: CHANNEL_TYPES.DM,
    dmParticipants: { $all: sorted, $size: sorted.length },
  };
  if (workspaceId) filter.workspaceId = workspaceId;
  return this.findOne(filter);
};

const Channel = model("Channel", channelSchema);

export default Channel;
