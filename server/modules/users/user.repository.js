import ChatUser from './ChatUser.model.js';
import { BOT } from '../../config/constants.js';

/**
 * User Repository — data access layer for ChatUser documents.
 * Supports both native (email/password) and FlowTask SSO users.
 * Users have global identity; workspace scoping is via WorkspaceMembership.
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

  /**
   * Find multiple users by IDs.
   * @param {string[]} ids
   * @returns {Promise<ChatUser[]>}
   */
  async findByIds(ids) {
    return ChatUser.find({ _id: { $in: ids } }).exec();
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
    }, { returnDocument: 'after' }).exec();
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
    }, { returnDocument: 'after' }).exec();
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
    }, { returnDocument: 'after' }).exec();
  }

  /**
   * Clear all refresh tokens (full logout from all devices).
   * @param {string} userId
   * @returns {Promise<ChatUser|null>}
   */
  async clearAllRefreshTokens(userId) {
    return ChatUser.findByIdAndUpdate(userId, {
      $set: { refreshTokens: [] },
    }, { returnDocument: 'after' }).exec();
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

    const filter = { flowTaskUserId: _id.toString() };

    return ChatUser.findOneAndUpdate(
      filter,
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
      { upsert: true, returnDocument: 'after' },
    );
  }

  async setOnlineStatus(userId, status) {
    const update = { onlineStatus: status };
    if (status === 'online' || status === 'away') {
      update.manualPresence = status;
    }
    if (status === 'offline') {
      update.lastSeenAt = new Date();
    }
    return ChatUser.findByIdAndUpdate(userId, update, { returnDocument: 'after' }).exec();
  }

  /**
   * Add a socket ID to a user's active connections.
   * @param {string} userId
   * @param {string} socketId
   * @returns {Promise<ChatUser|null>}
   */
  async addSocketId(userId, socketId) {
    const user = await ChatUser.findById(userId);
    const newStatus = user && user.manualPresence === 'away' ? 'away' : 'online';

    return ChatUser.findByIdAndUpdate(
      userId,
      {
        $addToSet: { socketIds: socketId },
        $set: { onlineStatus: newStatus },
      },
      { returnDocument: 'after' },
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
      { returnDocument: 'after' },
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
    return ChatUser.findByIdAndUpdate(userId, { $set: setFields }, { returnDocument: 'after' }).exec();
  }

  /**
   * Add a web-push subscription to a user's preferences (avoid duplicates by endpoint).
   * @param {string} userId
   * @param {object} subscription
   * @returns {Promise<ChatUser|null>}
   */
  async addPushSubscription(userId, subscription) {
    if (!subscription || !subscription.endpoint) return null;
    // Remove any existing subscription with the same endpoint to avoid duplicates
    // caused by fluctuating fields like expirationTime failing $addToSet exact matches
    await ChatUser.findByIdAndUpdate(userId, {
      $pull: { 'chatPreferences.pushSubscriptions': { endpoint: subscription.endpoint } }
    }).exec();

    // Add the new subscription
    return ChatUser.findByIdAndUpdate(
      userId,
      { $push: { 'chatPreferences.pushSubscriptions': subscription } },
      { returnDocument: 'after' },
    ).exec();
  }

  /**
   * Remove a push subscription by endpoint.
   * @param {string} userId
   * @param {string} endpoint
   * @returns {Promise<ChatUser|null>}
   */
  async removePushSubscription(userId, endpoint) {
    if (!endpoint) return null;
    return ChatUser.findByIdAndUpdate(
      userId,
      { $pull: { 'chatPreferences.pushSubscriptions': { endpoint } } },
      { returnDocument: 'after' },
    ).exec();
  }

  /**
   * Get push subscriptions for a user.
   * @param {string} userId
   * @returns {Promise<Array>}
   */
  async getPushSubscriptions(userId) {
    const user = await ChatUser.findById(userId).select('chatPreferences.pushSubscriptions').lean();
    return user?.chatPreferences?.pushSubscriptions || [];
  }

  /**
   * Find user by department.
   * @param {string} departmentId
   * @returns {Promise<ChatUser[]>}
   */
  async findByDepartment(departmentId) {
    return ChatUser.findActiveByDepartment(departmentId);
  }

  /**
   * Get all active users by role.
   * @param {string} role
   * @param {string} [workspaceId] - If provided, scopes via WorkspaceMembership
   * @returns {Promise<ChatUser[]>}
   */
  async findByRole(role, workspaceId) {
    if (workspaceId) {
      const { default: WorkspaceMembership } = await import('../workspaces/WorkspaceMembership.model.js');
      const memberships = await WorkspaceMembership.find({ workspaceId, isActive: true }).lean();
      const memberIds = memberships.map((m) => m.userId);
      return ChatUser.find({ _id: { $in: memberIds }, role, isActive: true }).exec();
    }
    return ChatUser.find({ role, isActive: true }).exec();
  }

  /**
   * Get all online users (for presence sidebar).
   * @param {string} [workspaceId] - If provided, scopes via WorkspaceMembership
   * @returns {Promise<ChatUser[]>}
   */
  async findOnline(workspaceId) {
    const baseFilter = {
      onlineStatus: { $in: ['online', 'away', 'dnd'] },
      isActive: true,
    };
    if (workspaceId) {
      const { default: WorkspaceMembership } = await import('../workspaces/WorkspaceMembership.model.js');
      const memberships = await WorkspaceMembership.find({ workspaceId, isActive: true }).lean();
      const memberIds = memberships.map((m) => m.userId);
      baseFilter._id = { $in: memberIds };
    }
    return ChatUser.find(baseFilter)
      .select('name email avatar onlineStatus flowTaskUserId')
      .lean();
  }

  /**
   * Search users by name or email.
   * @param {string} query
   * @param {number} [limit=10]
   * @param {string} [workspaceId] - If provided, scopes via WorkspaceMembership
   * @returns {Promise<ChatUser[]>}
   */
  async search(query, limit = 10, workspaceId) {
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const baseFilter = {
      isActive: true,
      $or: [
        { name: regex },
        { email: regex },
      ],
    };
    if (workspaceId) {
      const { default: WorkspaceMembership } = await import('../workspaces/WorkspaceMembership.model.js');
      const memberships = await WorkspaceMembership.find({ workspaceId, isActive: true }).lean();
      const memberIds = memberships.map((m) => m.userId);
      baseFilter._id = { $in: memberIds };
    }
    return ChatUser.find(baseFilter)
      .limit(limit)
      .select('name email avatar flowTaskUserId onlineStatus')
      .lean();
  }

  /**
   * Get all active users for a workspace (via WorkspaceMembership).
   * Supports optional search filtering by name or email.
   *
   * @param {string} workspaceId - Required workspace scope
   * @param {string} [searchQuery] - Optional name/email filter
   * @returns {Promise<object[]>}
   */
  async findAllForWorkspace(workspaceId, searchQuery) {
    if (!workspaceId) {
      throw new Error('findAllForWorkspace requires a valid workspaceId');
    }
    const { default: WorkspaceMembership } = await import('../workspaces/WorkspaceMembership.model.js');
    const memberships = await WorkspaceMembership.find({ workspaceId, isActive: true }).lean();
    const memberIds = memberships.map((m) => m.userId);

    const filter = { _id: { $in: memberIds }, isActive: true };

    if (searchQuery && searchQuery.trim().length >= 1) {
      const regex = new RegExp(searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: regex }, { email: regex }];
    }

    return ChatUser.find(filter)
      .select('name email avatar flowTaskUserId onlineStatus role')
      .sort({ name: 1 })
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
      { returnDocument: 'after' },
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
      { returnDocument: 'after' },
    ).exec();
  }

  /**
   * Get or create the system bot user (cached after first call).
   * @returns {Promise<ChatUser>}
   */
  async ensureBotUser() {
    if (this._botUser) return this._botUser;

    this._botUser = await ChatUser.findOne({ flowTaskUserId: BOT.SYSTEM_USER_ID }).exec();
    if (this._botUser) return this._botUser;

    this._botUser = await ChatUser.create({
      authProvider: 'flowtask',
      flowTaskUserId: BOT.SYSTEM_USER_ID,
      name: BOT.DISPLAY_NAME,
      email: 'bot@flowtask.system',
      role: 'bot',
      isActive: true,
      emailVerified: true,
      avatar: BOT.AVATAR,
    });
    return this._botUser;
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
      { returnDocument: 'after' },
    ).exec();
  }
}

export default new UserRepository();
