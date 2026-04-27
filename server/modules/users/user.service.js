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
   * Pause notifications (manual DND)
   * Accepts: { duration?: string, endsAt?: ISOString }
   */
  async pauseNotifications(userId, { duration, endsAt } = {}) {
    const user = await userRepository.findById(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    let endDate = null;

    if (endsAt) {
      endDate = new Date(endsAt);
      if (isNaN(endDate.getTime())) {
        const error = new Error('Invalid endsAt datetime');
        error.statusCode = 400;
        throw error;
      }
      if (endDate <= new Date()) {
        const error = new Error('endsAt must be in the future');
        error.statusCode = 400;
        throw error;
      }
    } else if (typeof duration === 'string') {
      const map = { '30m': 30, '1h': 60, '2h': 120 };
      if (map[duration]) {
        endDate = new Date(Date.now() + map[duration] * 60 * 1000);
      } else if (duration === 'tomorrow') {
        // Best-effort: set to next day 08:00 UTC
        const now = new Date();
        const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 8, 0, 0));
        endDate = tomorrow;
      } else if (duration === 'next_week') {
        // Best-effort: next Monday 08:00 UTC
        const now = new Date();
        const day = now.getUTCDay(); // 0 (Sun) - 6 (Sat)
        const daysUntilMonday = ((8 - day) % 7) || 7;
        const nextMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday, 8, 0, 0));
        endDate = nextMonday;
      } else {
        const error = new Error('Unsupported duration');
        error.statusCode = 400;
        throw error;
      }
    } else if (typeof duration === 'number') {
      // duration in minutes
      endDate = new Date(Date.now() + Math.max(1, duration) * 60 * 1000);
    } else {
      const error = new Error('Either "duration" or "endsAt" must be provided');
      error.statusCode = 400;
      throw error;
    }

    // Persist manual DND
    user.chatPreferences = user.chatPreferences || {}
    user.chatPreferences.dnd = user.chatPreferences.dnd || {}
    user.chatPreferences.dnd.enabled = true
    user.chatPreferences.dnd.endAt = endDate
    await user.save()

    return user
  }

  /**
   * Resume notifications immediately (clear manual DND)
   */
  async resumeNotifications(userId) {
    const user = await userRepository.findById(userId)
    if (!user) {
      const error = new Error('User not found')
      error.statusCode = 404
      throw error
    }

    user.chatPreferences = user.chatPreferences || {}
    user.chatPreferences.dnd = user.chatPreferences.dnd || {}
    user.chatPreferences.dnd.enabled = false
    user.chatPreferences.dnd.endAt = null
    await user.save()

    return user
  }

  /**
   * Return current DND state for a user. If manual endAt has passed, clear it.
   */
  async getDndStatus(userId) {
    const user = await userRepository.findById(userId)
    if (!user) {
      const error = new Error('User not found')
      error.statusCode = 404
      throw error
    }

    const now = new Date()
    const manual = user.chatPreferences?.dnd
    if (manual && manual.enabled && manual.endAt && new Date(manual.endAt) <= now) {
      // Clear expired manual DND
      user.chatPreferences.dnd.enabled = false
      user.chatPreferences.dnd.endAt = null
      await user.save()
    }

    return {
      dnd: user.chatPreferences?.dnd || { enabled: false, endAt: null, vipUsers: [] },
      dndSchedule: user.chatPreferences?.dndSchedule || { enabled: false },
    }
  }

  /**
   * Save recurring DND schedule (daily hours)
   */
  async saveDndSchedule(userId, schedule) {
    // Normalize schedule object
    const allowed = {
      enabled: !!schedule.enabled,
      startHour: typeof schedule.startHour === 'number' ? schedule.startHour : (schedule.startHour ? Number(schedule.startHour) : 22),
      endHour: typeof schedule.endHour === 'number' ? schedule.endHour : (schedule.endHour ? Number(schedule.endHour) : 8),
      timezone: schedule.timezone || 'UTC',
    }

    await userRepository.updatePreferences(userId, { dndSchedule: allowed })
    const user = await userRepository.findById(userId)
    return user
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
    const q = query.trim();
    if (typeof workspaceId === 'undefined') {
      return userRepository.search(q, limit);
    }
    return userRepository.search(q, limit, workspaceId);
  }
}

export default new UserService();
