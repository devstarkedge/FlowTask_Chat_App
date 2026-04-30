import mongoose from 'mongoose';
import { CHANNEL_MEMBER_ROLES } from '../../config/constants.js';

const { Schema, model } = mongoose;

/**
 * ChannelMember — separate collection for channel membership.
 *
 * Replaces the embedded `Channel.members[]` array to support channels
 * with 100k+ members without hitting the 16MB BSON document limit.
 *
 * Indexes are designed for three primary access patterns:
 *   1. List members of a channel (with roles/pagination)
 *   2. List channels a user belongs to (sorted by activity)
 *   3. Check if a user is a member of a specific channel
 */

const channelMemberSchema = new Schema({
  channelId: {
    type: Schema.Types.ObjectId,
    ref: 'Channel',
    required: true,
  },
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
  role: {
    type: String,
    enum: Object.values(CHANNEL_MEMBER_ROLES),
    default: CHANNEL_MEMBER_ROLES.MEMBER,
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  },
  notificationsEnabled: {
    type: Boolean,
    default: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
// Unique membership per channel+user
channelMemberSchema.index({ channelId: 1, userId: 1 }, { unique: true });
// All channels for a user in a workspace (sorted by joinedAt for sidebar)
channelMemberSchema.index({ userId: 1, workspaceId: 1, isActive: 1, joinedAt: 1 });
// All members of a channel (paginated, role-filtered)
channelMemberSchema.index({ channelId: 1, isActive: 1, role: 1 });
// Workspace-wide member listing
channelMemberSchema.index({ workspaceId: 1, channelId: 1 });

// ─── Statics ─────────────────────────────────────────────────────────────────
channelMemberSchema.statics.isMember = async function (channelId, userId) {
  const doc = await this.findOne({ channelId, userId, isActive: true }).lean();
  return !!doc;
};

channelMemberSchema.statics.getMemberRole = async function (channelId, userId) {
  const doc = await this.findOne({ channelId, userId, isActive: true }).select('role').lean();
  return doc?.role || null;
};

channelMemberSchema.statics.getMemberIds = async function (channelId) {
  const docs = await this.find({ channelId, isActive: true }).select('userId').lean();
  return docs.map((d) => d.userId.toString());
};

channelMemberSchema.statics.getChannelIdsForUser = async function (userId, workspaceId) {
  const docs = await this.find({ userId, workspaceId, isActive: true }).select('channelId').lean();
  return docs.map((d) => d.channelId.toString());
};

channelMemberSchema.statics.addMember = async function (channelId, userId, workspaceId, role = 'member') {
  return this.findOneAndUpdate(
    { channelId, userId },
    {
      $setOnInsert: { channelId, userId, joinedAt: new Date() },
      $set: { isActive: true, workspaceId, role },
    },
    { upsert: true, returnDocument: 'after' },
  );
};

channelMemberSchema.statics.removeMember = async function (channelId, userId) {
  return this.findOneAndUpdate(
    { channelId, userId },
    { $set: { isActive: false } },
    { returnDocument: 'after' },
  );
};

channelMemberSchema.statics.countActiveMembers = async function (channelId) {
  return this.countDocuments({ channelId, isActive: true });
};

const ChannelMember = model('ChannelMember', channelMemberSchema);

export default ChannelMember;
