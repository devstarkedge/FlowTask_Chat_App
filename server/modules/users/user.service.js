import userRepository from './user.repository.js';
import logger from '../../utils/logger.js';

/**
 * User Service — business logic for user operations.
 * Handles profile retrieval, custom status, presence, and search.
 */

class UserService {
  /**
   * Get a user's public profile by ID.
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async getProfile(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    // Clean up expired custom status
    if (user.customStatus?.expiresAt && user.customStatus.expiresAt < new Date()) {
      await userRepository.clearCustomStatus(userId);
      user.customStatus = { emoji: null, text: null, expiresAt: null };
    }

    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: user.role,
      departmentIds: user.departmentIds,
      teamId: user.teamId,
      onlineStatus: user.onlineStatus,
      lastSeenAt: user.lastSeenAt,
      customStatus: user.customStatus || {},
      createdAt: user.createdAt,
    };
  }

  /**
   * Set custom status for a user.
   * @param {string} userId
   * @param {{ emoji?: string, text?: string, duration?: number }} statusData
   * @returns {Promise<object>}
   */
  async setCustomStatus(userId, statusData) {
    const { emoji, text, duration } = statusData;

    const update = {
      emoji: emoji || null,
      text: text || null,
      expiresAt: null,
    };

    // Calculate expiry from duration (in minutes)
    if (duration && duration > 0) {
      update.expiresAt = new Date(Date.now() + duration * 60 * 1000);
    }

    const user = await userRepository.setCustomStatus(userId, update);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    logger.info('User custom status updated', { userId, statusLength: (update.text || '').length });
    return user;
  }

  /**
   * Clear custom status for a user.
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async clearCustomStatus(userId) {
    const user = await userRepository.clearCustomStatus(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }
    return user;
  }

  /**
   * Set user's online status manually (online, away, dnd).
   * @param {string} userId
   * @param {string} status
   * @returns {Promise<object>}
   */
  async setOnlineStatus(userId, status) {
    const validStatuses = ['online', 'away', 'dnd'];
    if (!validStatuses.includes(status)) {
      const error = new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }

    const user = await userRepository.setOnlineStatus(userId, status);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    return user;
  }

  /**
   * Get all currently online users.
   * @param {string} [workspaceId]
   * @returns {Promise<Array>}
   */
  async getOnlineUsers(workspaceId) {
    return userRepository.findOnline(workspaceId);
  }

  /**
   * Search users by name or email.
   * @param {string} query
   * @param {number} [limit=20]
   * @param {string} [workspaceId]
   * @returns {Promise<Array>}
   */
  async searchUsers(query, limit = 20, workspaceId) {
    if (!query || query.trim().length < 1) {
      return [];
    }
    return userRepository.search(query.trim(), limit, workspaceId);
  }
}

export default new UserService();
