import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * ChannelPin — per-user channel pinning/starring preferences.
 *
 * Allows users to pin or star channels for quick access in the sidebar.
 * Pins appear at the top of the channel list in the order specified by pinnedOrder.
 */

const channelPinSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'ChatUser',
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
    isPinned: {
      type: Boolean,
      default: false,
    },
    isStarred: {
      type: Boolean,
      default: false,
    },
    pinnedOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// ─── Indexes ────────────────────────────────────────────────────────────────
// Unique per user + channel + workspace
channelPinSchema.index(
  { userId: 1, channelId: 1, workspaceId: 1 },
  { unique: true },
);
// Fast lookup for all pins for a user in a workspace
channelPinSchema.index({ userId: 1, workspaceId: 1, isPinned: 1 });
channelPinSchema.index({ userId: 1, workspaceId: 1, isStarred: 1 });

// ─── Statics ────────────────────────────────────────────────────────────────

/**
 * Get all pins for a user in a workspace.
 */
channelPinSchema.statics.getPinsForUser = function (userId, workspaceId) {
  return this.find({
    userId,
    workspaceId,
    $or: [{ isPinned: true }, { isStarred: true }],
  })
    .sort({ pinnedOrder: 1 })
    .lean();
};

/**
 * Toggle pin state for a channel.
 * Creates the document if it doesn't exist.
 */
channelPinSchema.statics.togglePin = async function (userId, channelId, workspaceId) {
  const existing = await this.findOne({ userId, channelId, workspaceId });
  if (existing) {
    existing.isPinned = !existing.isPinned;
    if (!existing.isPinned && !existing.isStarred) {
      await existing.deleteOne();
      return { isPinned: false, isStarred: false, deleted: true };
    }
    await existing.save();
    return { isPinned: existing.isPinned, isStarred: existing.isStarred };
  }

  // Get next order
  const maxOrder = await this.findOne(
    { userId, workspaceId, isPinned: true },
    { pinnedOrder: 1 },
    { sort: { pinnedOrder: -1 } },
  );
  const nextOrder = (maxOrder?.pinnedOrder || 0) + 1;

  const pin = await this.create({
    userId,
    channelId,
    workspaceId,
    isPinned: true,
    pinnedOrder: nextOrder,
  });
  return { isPinned: pin.isPinned, isStarred: pin.isStarred };
};

/**
 * Toggle star state for a channel.
 */
channelPinSchema.statics.toggleStar = async function (userId, channelId, workspaceId) {
  const existing = await this.findOne({ userId, channelId, workspaceId });
  if (existing) {
    existing.isStarred = !existing.isStarred;
    if (!existing.isPinned && !existing.isStarred) {
      await existing.deleteOne();
      return { isPinned: false, isStarred: false, deleted: true };
    }
    await existing.save();
    return { isPinned: existing.isPinned, isStarred: existing.isStarred };
  }

  const pin = await this.create({
    userId,
    channelId,
    workspaceId,
    isStarred: true,
  });
  return { isPinned: pin.isPinned, isStarred: pin.isStarred };
};

/**
 * Set (not toggle) the starred state for a channel — absolute value.
 * Used when syncing from the favorites system (UserFavorite) so both
 * representations of "starred" stay in sync across platforms.
 */
channelPinSchema.statics.setStarred = async function (userId, channelId, workspaceId, isStarred) {
  const shouldStar = !!isStarred;
  const existing = await this.findOne({ userId, channelId, workspaceId });

  if (existing) {
    existing.isStarred = shouldStar;
    if (!existing.isPinned && !existing.isStarred) {
      await existing.deleteOne();
      return { isPinned: false, isStarred: false, deleted: true };
    }
    await existing.save();
    return { isPinned: existing.isPinned, isStarred: existing.isStarred };
  }

  if (!shouldStar) {
    return { isPinned: false, isStarred: false, deleted: true };
  }

  const pin = await this.create({
    userId,
    channelId,
    workspaceId,
    isStarred: true,
  });
  return { isPinned: pin.isPinned, isStarred: pin.isStarred };
};

const ChannelPin = model('ChannelPin', channelPinSchema);

export default ChannelPin;
