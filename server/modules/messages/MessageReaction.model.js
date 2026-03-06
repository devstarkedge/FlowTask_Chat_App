import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * MessageReaction — separate collection for message reactions.
 *
 * Replaces the embedded `Message.reactions[]` array so that
 * high-engagement messages (thousands of reactions) don't bloat
 * the parent document.
 *
 * One document per (messageId, emoji, userId) — unique constraint.
 */

const messageReactionSchema = new Schema({
  messageId: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    required: true,
  },
  channelId: {
    type: Schema.Types.ObjectId,
    ref: 'Channel',
    required: true,
  },
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  emoji: {
    type: String,
    required: true,
    maxlength: 32,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'ChatUser',
    required: true,
  },
}, {
  timestamps: true,
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
// Unique: one reaction per emoji per user per message
messageReactionSchema.index({ messageId: 1, emoji: 1, userId: 1 }, { unique: true });
// All reactions for a message (for rendering)
messageReactionSchema.index({ messageId: 1 });
// User's reactions (for "your reactions" view)
messageReactionSchema.index({ userId: 1, workspaceId: 1 });

// ─── Statics ─────────────────────────────────────────────────────────────────

/**
 * Toggle a reaction: add if not present, remove if already exists.
 * Returns { added: boolean, reaction: doc | null }.
 */
messageReactionSchema.statics.toggle = async function (messageId, emoji, userId, channelId, workspaceId) {
  const existing = await this.findOne({ messageId, emoji, userId });
  if (existing) {
    await this.deleteOne({ _id: existing._id });
    return { added: false, reaction: null };
  }
  try {
    const reaction = await this.create({ messageId, emoji, userId, channelId, workspaceId });
    return { added: true, reaction };
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate key — another request created it concurrently; treat as already added
      return { added: false, reaction: null };
    }
    throw err;
  }
};

/**
 * Get aggregated reactions for a message: [{ emoji, count, userIds }]
 */
messageReactionSchema.statics.getForMessage = async function (messageId) {
  return this.aggregate([
    { $match: { messageId: new mongoose.Types.ObjectId(messageId) } },
    {
      $group: {
        _id: '$emoji',
        count: { $sum: 1 },
        userIds: { $push: '$userId' },
      },
    },
    { $project: { emoji: '$_id', count: 1, userIds: 1, _id: 0 } },
    { $sort: { count: -1 } },
  ]);
};

/**
 * Get aggregated reactions for multiple messages (batch).
 */
messageReactionSchema.statics.getForMessages = async function (messageIds) {
  const objectIds = messageIds.map((id) => new mongoose.Types.ObjectId(id));
  const results = await this.aggregate([
    { $match: { messageId: { $in: objectIds } } },
    {
      $group: {
        _id: { messageId: '$messageId', emoji: '$emoji' },
        count: { $sum: 1 },
        userIds: { $push: '$userId' },
      },
    },
    {
      $group: {
        _id: '$_id.messageId',
        reactions: {
          $push: {
            emoji: '$_id.emoji',
            count: '$count',
            userIds: '$userIds',
          },
        },
      },
    },
  ]);

  // Return as Map<messageId, reactions[]>
  const map = new Map();
  for (const r of results) {
    map.set(r._id.toString(), r.reactions);
  }
  return map;
};

const MessageReaction = model('MessageReaction', messageReactionSchema);

export default MessageReaction;
