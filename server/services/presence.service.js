import redisClient from '../config/redis.js';
import logger from '../utils/logger.js';
import userRepository from '../modules/users/user.repository.js';

export class PresenceService {
  /**
   * Called when a socket connects or an activity heartbeat is received.
   * Updates Redis session and marks user as 'active'.
   */
  static async heartbeat(userId, socketId) {
    if (!redisClient) {
      // Fallback for environments without Redis
      await userRepository.addSocketId(userId, socketId);
      await userRepository.updateOnlineStatus(userId, 'online');
      return true;
    }

    try {
      // 1. Update session timestamp
      await redisClient.hSet(`presence:sessions:${userId}`, socketId, Date.now());
      
      // 2. Refresh status to active
      const oldStatus = await redisClient.get(`presence:status:${userId}`);
      await redisClient.set(`presence:status:${userId}`, 'active', { EX: 900 }); // 15 min TTL
      
      // Also sync to Mongo for persistence (optional, but good for fallback)
      if (oldStatus !== 'active') {
        await userRepository.updateOnlineStatus(userId, 'online');
      }

      return oldStatus !== 'active'; // Returns true if status changed
    } catch (err) {
      logger.error('PresenceService heartbeat failed', { error: err.message, userId });
      return false;
    }
  }

  /**
   * Called when the client specifically reports it has been idle.
   */
  static async markIdle(userId, socketId) {
    if (!redisClient) {
      await userRepository.updateOnlineStatus(userId, 'away');
      return true;
    }

    try {
      // Refresh session timestamp to keep socket alive, but mark status as away
      await redisClient.hSet(`presence:sessions:${userId}`, socketId, Date.now());
      
      const oldStatus = await redisClient.get(`presence:status:${userId}`);
      if (oldStatus !== 'away') {
        await redisClient.set(`presence:status:${userId}`, 'away', { EX: 900 });
        await userRepository.updateOnlineStatus(userId, 'away');
        return true;
      }
      return false;
    } catch (err) {
      logger.error('PresenceService markIdle failed', { error: err.message, userId });
      return false;
    }
  }

  /**
   * Called on socket disconnect.
   */
  static async removeSession(userId, socketId) {
    if (!redisClient) {
      const user = await userRepository.removeSocketId(userId, socketId);
      if (user && user.socketIds && user.socketIds.length === 0) {
        await userRepository.updateOnlineStatus(userId, 'offline');
        return true; // user is offline
      }
      return false;
    }

    try {
      await redisClient.hDel(`presence:sessions:${userId}`, socketId);
      const remaining = await redisClient.hLen(`presence:sessions:${userId}`);
      
      if (remaining === 0) {
        // Technically we should do a 10s grace period.
        // For simplicity in this iteration, we mark offline immediately
        // In a production system we'd use a background job.
        await redisClient.set(`presence:status:${userId}`, 'offline');
        await userRepository.updateOnlineStatus(userId, 'offline');
        return true; // user is offline
      }
      return false;
    } catch (err) {
      logger.error('PresenceService removeSession failed', { error: err.message, userId });
      return false;
    }
  }
}
