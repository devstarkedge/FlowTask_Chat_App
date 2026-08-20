import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const directMessageSchema = new Schema({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true,
  },
  memberIds: {
    type: [{ type: Schema.Types.ObjectId, ref: 'ChatUser', required: true }],
    validate: {
      validator: (arr) => Array.isArray(arr) && (arr.length === 1 || arr.length === 2),
      message: 'DirectMessage must have 1 (self-DM) or 2 members',
    },
    required: true,
  },
  dmKey: {
    type: String,
    required: true,
  },
  legacyChannelId: {
    type: Schema.Types.ObjectId,
    ref: 'Channel',
    default: null,
  },
  lastMessageId: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
  },
  lastActivityAt: {
    type: Date,
    default: Date.now,
  },
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

directMessageSchema.index({ workspaceId: 1, dmKey: 1 }, { unique: true });
directMessageSchema.index({ workspaceId: 1, memberIds: 1 });
directMessageSchema.index(
  { workspaceId: 1, legacyChannelId: 1 },
  { unique: true, sparse: true },
);

directMessageSchema.statics.buildDmKey = function (memberIds) {
  return [...memberIds].map((id) => id.toString()).sort().join(':');
};

// Mongoose 7+ no longer passes a next() callback into pre hooks — hooks
// resolve via return value/thrown error instead (see ChatUser.model.js for
// the async equivalent). This used to be `function (next) { ... next() }`,
// which threw "next is not a function" and aborted every DM creation.
directMessageSchema.pre('validate', function () {
  if (Array.isArray(this.memberIds) && this.memberIds.length > 0) {
    this.memberIds = [...this.memberIds]
      .map((id) => id.toString())
      .sort();
    this.dmKey = this.constructor.buildDmKey(this.memberIds);
  }
});

const DirectMessage = model('DirectMessage', directMessageSchema);

export default DirectMessage;
