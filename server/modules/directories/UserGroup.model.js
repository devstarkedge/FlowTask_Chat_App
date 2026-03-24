import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * UserGroup — workspace-scoped groups of users.
 *
 * Example: "Frontend Team" with handle @frontend, containing 6 members.
 * Used in the Directories → User Groups tab.
 */
const userGroupSchema = new Schema({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  handle: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 50,
  },
  description: {
    type: String,
    default: '',
    maxlength: 500,
  },
  members: [{
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
  }],
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
userGroupSchema.index({ workspaceId: 1, handle: 1 }, { unique: true });
userGroupSchema.index({ workspaceId: 1, isActive: 1 });

// ─── Static Methods ──────────────────────────────────────────────────────────

userGroupSchema.statics.findByWorkspace = function (workspaceId, { search, sort = 'name' } = {}) {
  const filter = { workspaceId, isActive: true };
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: regex }, { handle: regex }];
  }
  const sortOption = sort === 'name' ? { name: 1 } : { createdAt: -1 };
  return this.find(filter).sort(sortOption).lean();
};

userGroupSchema.statics.findByIdWithMembers = function (groupId) {
  return this.findOne({ _id: groupId, isActive: true })
    .populate('members', 'name email avatar role onlineStatus')
    .populate('createdBy', 'name email avatar')
    .lean();
};

const UserGroup = model('UserGroup', userGroupSchema);

export default UserGroup;
