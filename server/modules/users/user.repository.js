import ChatUser from './ChatUser.model.js';

/**
 * User Repository — data access layer for ChatUser documents.
 * Supports both native (email/password) and FlowTask SSO users.
 */

class UserRepository {
  // ─── Generic ─────────────────────────────────────────────────────────

  /**
   * Create a new ChatUser.
   * @param {object} data
   * @returns {Promise<ChatUser>}
   */
  async create(data) {
    const user = new ChatUser(data);
    return user.save();
  }

  /**
   * Find user by ChatUser _id.
   * @param {string} id
   * @returns {Promise<ChatUser|null>}
   */
  async findById(id) {
    return ChatUser.findById(id).exec();
  }

  // ─── Native Auth ─────────────────────────────────────────────────────

  /**
   * Create a native (email/password) user.
   * @param {{ name: string, email: string, password: string }} data
   * @returns {Promise<ChatUser>}
   */
  async createNativeUser({ name, email, password }) {
    const user = new ChatUser({
      authProvider: 'native',
      name,
      email,
      password,
      role: 'employee',
    });
    return user.save();
  }

  /**
   * Find user by email — includes password for login verification.
   * @param {string} email
   * @returns {Promise<ChatUser|null>}
   */
  async findByEmail(email) {
    return ChatUser.findOne({ email: email.toLowerCase() })
      .select('+password +loginAttempts +lockUntil')
      .exec();
  }

  /**
   * Find by email (without sensitive fields).
   * @param {string} email
   * @returns {Promise<ChatUser|null>}
   */
  async findByEmailPublic(email) {
    return ChatUser.findOne({ email: email.toLowerCase() }).exec();
  }

  /**
   * Find user by verification token.
   * @param {string} token
   * @returns {Promise<ChatUser|null>}
   */
  async findByVerificationToken(token) {
    return ChatUser.findOne({
      verificationToken: token,
      verificationExpiry: { $gt: new Date() },
    }).select('+verificationToken +verificationExpiry').exec();
  }

  /**
   * Mark user email as verified, clear verification token.
   * @param {string} userId
   * @returns {Promise<ChatUser|null>}
   */
  async verifyEmail(userId) {
    return ChatUser.findByIdAndUpdate(userId, {
      $set: { emailVerified: true },
      $unset: { verificationToken: 1, verificationExpiry: 1 },
    }, { new: true }).exec();
  }

  /**
   * Find user by password reset token.
   * @param {string} token
   * @returns {Promise<ChatUser|null>}
   */
  async findByResetToken(token) {
    return ChatUser.findOne({
      passwordResetToken: token,
      passwordResetExpiry: { $gt: new Date() },
    }).select('+passwordResetToken +passwordResetExpiry +password').exec();
  }

  // ─── Refresh Tokens ──────────────────────────────────────────────────

  /**
   * Add a hashed refresh token to the user's token list.
   * @param {string} userId
   * @param {{ tokenHash: string, expiresAt: Date, userAgent: string }} tokenData
   * @returns {Promise<ChatUser|null>}
   */
  async addRefreshToken(userId, tokenData) {
    return ChatUser.findByIdAndUpdate(userId, {
      $push: { refreshTokens: tokenData },
    }, { new: true }).exec();
  }

  /**
   * Remove a specific refresh token by hash.
   * @param {string} userId
   * @param {string} tokenHash
   * @returns {Promise<ChatUser|null>}
   */
  async removeRefreshToken(userId, tokenHash) {
    return ChatUser.findByIdAndUpdate(userId, {
      $pull: { refreshTokens: { tokenHash } },
    }, { new: true }).exec();
  }

  /**
   * Clear all refresh tokens (full logout from all devices).
   * @param {string} userId
   * @returns {Promise<ChatUser|null>}
   */
  async clearAllRefreshTokens(userId) {
    return ChatUser.findByIdAndUpdate(userId, {
      $set: { refreshTokens: [] },
    }, { new: true }).exec();
  }

  /**
   * Remove expired refresh tokens for a user.
   * @param {string} userId
   * @returns {Promise<void>}
   */
  async pruneExpiredRefreshTokens(userId) {
    await ChatUser.findByIdAndUpdate(userId, {
      $pull: { refreshTokens: { expiresAt: { $lt: new Date() } } },
    });
  }

  // ─── FlowTask ────────────────────────────────────────────────────────

  /**
   * Find user by FlowTask user ID.
   * @param {string} flowTaskUserId
   * @returns {Promise<ChatUser|null>}
   */
  async findByFlowTaskId(flowTaskUserId) {
    return ChatUser.findByFlowTaskId(flowTaskUserId);
  }

  /**
   * Find or create a ChatUser from FlowTask user data.
   * Upserts to handle race conditions during initial sync.
   *
   * @param {object} flowTaskUser - User data from FlowTask API
   * @returns {Promise<ChatUser>}
   */
  async upsertFromFlowTask(flowTaskUser) {
    const { _id, name, email, role, department, team, avatar } = flowTaskUser;

    const departmentIds = Array.isArray(department)
      ? department.map((d) => (typeof d === 'object' ? d._id || d : d).toString())
      : department ? [department.toString()] : [];

    return ChatUser.findOneAndUpdate(
      { flowTaskUserId: _id.toString() },
      {
        $set: {
          authProvider: 'flowtask',
          name,
          email,
          role: role?.toLowerCase() || 'employee',
          departmentIds,
          teamId: team ? (typeof team === 'object' ? team._id || team : team).toString() : null,
          avatar: avatar || null,
          isActive: true,
          emailVerified: true, // FlowTask users are pre-verified
        },
        $setOnInsert: {
          flowTaskUserId: _id.toString(),
          onlineStatus: 'offline',
          chatPreferences: {},
        },
      },
      { upsert: true, new: true },
    );
  }

  /**
   * Update user's online status.
   * @param {string} userId - ChatUser _id
   * @param {string} status - 'online' | 'away' | 'dnd' | 'offline'
   * @returns {Promise<ChatUser|null>}
   */
  async setOnlineStatus(userId, status) {
    const update = { onlineStatus: status };
    if (status === 'offline') {
      update.lastSeenAt = new Date();
    }
    return ChatUser.findByIdAndUpdate(userId, update, { new: true }).exec();
  }

  /**
   * Add a socket ID to a user's active connections.
   * @param {string} userId
   * @param {string} socketId
   * @returns {Promise<ChatUser|null>}
   */
  async addSocketId(userId, socketId) {
    return ChatUser.findByIdAndUpdate(
      userId,
      {
        $addToSet: { socketIds: socketId },
        $set: { onlineStatus: 'online' },
      },
      { new: true },
    );
  }

  /**
   * Remove a socket ID from a user's active connections.
   * If no more sockets remain, set status to offline.
   * @param {string} userId
   * @param {string} socketId
   * @returns {Promise<ChatUser|null>}
   */
  async removeSocketId(userId, socketId) {
    const user = await ChatUser.findByIdAndUpdate(
      userId,
      { $pull: { socketIds: socketId } },
      { new: true },
    );

    if (user && user.socketIds.length === 0) {
      user.onlineStatus = 'offline';
      user.lastSeenAt = new Date();
      await user.save();
    }

    return user;
  }

  /**
   * Update user's chat preferences.
   * @param {string} userId
   * @param {object} preferences - Partial preferences update
   * @returns {Promise<ChatUser|null>}
   */
  async updatePreferences(userId, preferences) {
    const setFields = {};
    for (const [key, value] of Object.entries(preferences)) {
      setFields[`chatPreferences.${key}`] = value;
    }
    return ChatUser.findByIdAndUpdate(userId, { $set: setFields }, { new: true }).exec();
  }

  /**
   * Get all active users in a department.
   * @param {string} departmentId
   * @returns {Promise<ChatUser[]>}
   */
  async findByDepartment(departmentId) {
    return ChatUser.findActiveByDepartment(departmentId);
  }

  /**
   * Get all active users by role.
   * @param {string} role
   * @returns {Promise<ChatUser[]>}
   */
  async findByRole(role) {
    return ChatUser.find({ role, isActive: true }).exec();
  }

  /**
   * Get all online users (for presence sidebar).
   * @returns {Promise<ChatUser[]>}
   */
  async findOnline() {
    return ChatUser.find({
      onlineStatus: { $in: ['online', 'away', 'dnd'] },
      isActive: true,
    })
      .select('name email avatar onlineStatus flowTaskUserId')
      .lean();
  }

  /**
   * Search users by name or email.
   * @param {string} query
   * @param {number} [limit=10]
   * @returns {Promise<ChatUser[]>}
   */
  async search(query, limit = 10) {
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    return ChatUser.find({
      isActive: true,
      $or: [
        { name: regex },
        { email: regex },
      ],
    })
      .limit(limit)
      .select('name email avatar flowTaskUserId onlineStatus')
      .lean();
  }

  /**
   * Deactivate a user.
   * @param {string} flowTaskUserId
   * @returns {Promise<ChatUser|null>}
   */
  async deactivate(flowTaskUserId) {
    return ChatUser.findOneAndUpdate(
      { flowTaskUserId },
      { isActive: false, onlineStatus: 'offline', socketIds: [] },
      { new: true },
    );
  }

  /**
   * Find multiple users by FlowTask IDs.
   * @param {string[]} flowTaskUserIds
   * @returns {Promise<ChatUser[]>}
   */
  async findByFlowTaskIds(flowTaskUserIds) {
    return ChatUser.find({
      flowTaskUserId: { $in: flowTaskUserIds },
    }).exec();
  }

  /**
   * Clear all socket IDs and set all users offline.
   * Called on server startup to recover from crashes that left stale socket state.
   * @returns {Promise<{modifiedCount: number}>}
   */
  async clearAllSocketIds() {
    const result = await ChatUser.updateMany(
      { $or: [{ socketIds: { $ne: [] } }, { onlineStatus: { $ne: 'offline' } }] },
      { $set: { socketIds: [], onlineStatus: 'offline', lastSeenAt: new Date() } },
    );
    return { modifiedCount: result.modifiedCount };
  }

  /**
   * Set custom status for a user.
   * @param {string} userId
   * @param {{ emoji?: string, text?: string, expiresAt?: Date }} status
   * @returns {Promise<ChatUser|null>}
   */
  async setCustomStatus(userId, status) {
    return ChatUser.findByIdAndUpdate(
      userId,
      { $set: { customStatus: status } },
      { new: true },
    ).exec();
  }

  /**
   * Clear custom status for a user.
   * @param {string} userId
   * @returns {Promise<ChatUser|null>}
   */
  async clearCustomStatus(userId) {
    return ChatUser.findByIdAndUpdate(
      userId,
      { $set: { customStatus: { emoji: null, text: null, expiresAt: null } } },
      { new: true },
    ).exec();
  }
}

export default new UserRepository();
