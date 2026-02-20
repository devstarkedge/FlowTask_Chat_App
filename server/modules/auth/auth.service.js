import jwt from 'jsonwebtoken';
import env from '../../config/environment.js';
import userRepository from '../users/user.repository.js';
import flowTaskService from '../flowtask/flowtask.service.js';
import logger from '../../utils/logger.js';
import { UnauthorizedError, ForbiddenError } from '../../middleware/errorHandler.js';

/**
 * Auth Service — handles authentication and user synchronization between FlowTask and Chat.
 *
 * Key principle: FlowTask JWT is the single source of auth truth.
 * Chat server verifies the SAME JWT (shared JWT_SECRET) and maintains
 * a local ChatUser record for chat-specific data.
 */

class AuthService {
  /**
   * Verify a FlowTask JWT and return the decoded payload.
   * @param {string} token
   * @returns {object} Decoded token payload { id, iat, exp }
   * @throws {UnauthorizedError} If token is invalid or expired
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, env.JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Token expired');
      }
      throw new UnauthorizedError('Invalid token');
    }
  }

  /**
   * Sync (or create) a ChatUser from FlowTask.
   * Called on first connection and periodically to keep data fresh.
   *
   * @param {string} token - FlowTask JWT
   * @returns {Promise<{chatUser: object, channels: object[]}>}
   */
  async syncUser(token) {
    // 1. Verify token locally
    const decoded = this.verifyToken(token);

    // 2. Fetch fresh user data from FlowTask
    let flowTaskUser;
    try {
      flowTaskUser = await flowTaskService.getCurrentUser(token);
    } catch (error) {
      logger.error('Failed to fetch FlowTask user during sync', {
        flowTaskUserId: decoded.id,
        error: error.message,
      });
      throw new UnauthorizedError('Failed to verify user with FlowTask');
    }

    // 3. Check if user is active and verified in FlowTask
    if (!flowTaskUser.isActive) {
      throw new UnauthorizedError('FlowTask account is deactivated');
    }

    // 4. Upsert ChatUser
    const chatUser = await userRepository.upsertFromFlowTask(flowTaskUser);

    logger.info('User synced', {
      chatUserId: chatUser._id,
      flowTaskUserId: chatUser.flowTaskUserId,
      name: chatUser.name,
      role: chatUser.role,
    });

    return { chatUser };
  }

  /**
   * Get or create a ChatUser from a FlowTask user ID.
   * Used when processing webhook events where we have a user ID but no token.
   *
   * @param {string} flowTaskUserId
   * @returns {Promise<object|null>} ChatUser or null if not found
   */
  async getOrCreateChatUser(flowTaskUserId) {
    let chatUser = await userRepository.findByFlowTaskId(flowTaskUserId);
    return chatUser;
  }

  /**
   * Validate that a user has one of the required roles.
   * Admin role always passes (matching FlowTask's authorize pattern).
   *
   * @param {object} user - ChatUser document
   * @param {string[]} requiredRoles
   * @throws {ForbiddenError} If user doesn't have required role
   */
  validateRole(user, requiredRoles) {
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // Admin always passes
    if (user.role === 'admin') return;

    const normalizedRoles = requiredRoles.map((r) => r.toLowerCase());
    if (!normalizedRoles.includes(user.role)) {
      throw new ForbiddenError(
        `Required role: ${requiredRoles.join(' or ')}. Current role: ${user.role}`,
      );
    }
  }

  /**
   * Verify that a user belongs to a specific department.
   * Used for department isolation checks.
   *
   * @param {object} user - ChatUser document
   * @param {string} departmentId
   * @returns {boolean}
   */
  isUserInDepartment(user, departmentId) {
    if (!user || !departmentId) return false;
    // Admin has access to all departments
    if (user.role === 'admin') return true;
    return user.departmentIds.includes(departmentId);
  }
}

export default new AuthService();
