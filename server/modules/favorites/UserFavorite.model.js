import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * UserFavorite — unified per-user favorites for channels, private channels,
 * directories/projects, and direct messages.
 *
 * This is the single source of truth for "starred" / "favorited" items.
 * It replaces ad-hoc isStarred flags on individual documents and scales
 * cleanly because favorites are always user-specific.
 */

const userFavoriteSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'ChatUser',
      required: true,
      index: true,
    },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      required: true,
      enum: ['channel', 'private_channel', 'directory', 'project', 'dm'],
      index: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ─── Indexes ────────────────────────────────────────────────────────────────
// Unique per user + workspace + target (prevents duplicates)
userFavoriteSchema.index(
  { userId: 1, workspaceId: 1, targetType: 1, targetId: 1 },
  { unique: true },
);
// Fast lookup for all favorites of a user in a workspace
userFavoriteSchema.index({ userId: 1, workspaceId: 1, createdAt: -1 });

// ─── Statics ────────────────────────────────────────────────────────────────

/**
 * Get all favorites for a user in a workspace, sorted by most recently starred.
 */
userFavoriteSchema.statics.findByUserAndWorkspace = function (userId, workspaceId) {
  return this.find({ userId, workspaceId })
    .sort({ createdAt: -1 })
    .lean();
};

/**
 * Check if a specific target is favorited by a user.
 */
userFavoriteSchema.statics.isFavorited = function (userId, workspaceId, targetType, targetId) {
  return this.exists({ userId, workspaceId, targetType, targetId });
};

/**
 * Add a favorite. Returns the created document.
 * Throws if already favorited (unique index will also catch this).
 */
userFavoriteSchema.statics.addFavorite = async function (data) {
  const { userId, workspaceId, targetType, targetId } = data;

  // Idempotent: return existing if already favorited
  const existing = await this.findOne({ userId, workspaceId, targetType, targetId });
  if (existing) {
    return existing;
  }

  const fav = await this.create({ userId, workspaceId, targetType, targetId });
  return fav;
};

/**
 * Remove a favorite by its _id.
 * Returns the deleted document (or null if not found).
 */
userFavoriteSchema.statics.removeFavoriteById = async function (favoriteId) {
  return this.findByIdAndDelete(favoriteId);
};

/**
 * Remove a favorite by target identifiers.
 * Returns true if a document was deleted.
 */
userFavoriteSchema.statics.removeFavoriteByTarget = async function (
  userId,
  workspaceId,
  targetType,
  targetId,
) {
  const result = await this.findOneAndDelete({
    userId,
    workspaceId,
    targetType,
    targetId,
  });
  return !!result;
};

/**
 * Toggle favorite. Returns { favorited: boolean, favorite: object|null }.
 */
userFavoriteSchema.statics.toggleFavorite = async function (
  userId,
  workspaceId,
  targetType,
  targetId,
) {
  const existing = await this.findOne({ userId, workspaceId, targetType, targetId });

  if (existing) {
    await this.findByIdAndDelete(existing._id);
    return { favorited: false, favorite: null };
  }

  const fav = await this.create({ userId, workspaceId, targetType, targetId });
  return { favorited: true, favorite: fav };
};

const UserFavorite = model('UserFavorite', userFavoriteSchema);

export default UserFavorite;