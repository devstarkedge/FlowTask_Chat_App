import jwt from 'jsonwebtoken';
import env from '../../config/environment.js';
import userRepository from '../users/user.repository.js';
import logger from '../../utils/logger.js';
import { UnauthorizedError, ForbiddenError } from '../../middleware/errorHandler.js';

/**
 * Auth Middleware — JWT verification and RBAC for Express routes.
 *
 * Mirrors FlowTask's auth middleware pattern:
 *  - protect: verifies JWT, attaches req.user (ChatUser) and req.flowTaskToken
 *  - authorize: role-based access control (admin always passes)
 *  - requireChannelAccess: checks channel membership
 */

/**
 * JWT verification middleware.
 * Extracts Bearer token, verifies with shared JWT_SECRET,
 * looks up ChatUser, attaches to req.user.
 */
export async function protect(req, res, next) {
  try {
    let token;

    // Extract Bearer token from Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      throw new UnauthorizedError('No authentication token provided');
    }

    // Verify JWT (same secret as FlowTask)
    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Token expired');
      }
      throw new UnauthorizedError('Invalid token');
    }

    if (!decoded?.id) {
      throw new UnauthorizedError('Invalid token payload');
    }

    // Look up ChatUser
    const chatUser = await userRepository.findByFlowTaskId(decoded.id);
    if (!chatUser) {
      throw new UnauthorizedError(
        'User not synced to chat. Call POST /api/chat/auth/sync first.',
      );
    }

    if (!chatUser.isActive) {
      throw new UnauthorizedError('User account is deactivated');
    }

    // Attach to request
    req.user = chatUser;
    req.flowTaskToken = token;
    req.flowTaskUserId = decoded.id;

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Role-based access control middleware factory.
 * Admin role always passes (matching FlowTask's authorize pattern).
 *
 * @param {...string} roles - Allowed roles
 * @returns {Function} Express middleware
 */
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    // Admin always passes
    if (req.user.role === 'admin') {
      return next();
    }

    const normalizedRoles = roles.map((r) => r.toLowerCase());
    if (!normalizedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(`Access denied. Required role: ${roles.join(' or ')}`),
      );
    }

    next();
  };
}

/**
 * Middleware to verify the user is a member of the requested channel.
 * Expects channelId in req.params.channelId or req.params.id.
 */
export function requireChannelAccess() {
  return async (req, res, next) => {
    try {
      const channelId = req.params.channelId || req.params.id;
      if (!channelId) {
        return next(new ForbiddenError('Channel ID required'));
      }

      // Import here to avoid circular dependency
      const { default: channelRepository } = await import('../channels/channel.repository.js');

      const channel = await channelRepository.findById(channelId);
      if (!channel) {
        return next(new ForbiddenError('Channel not found'));
      }

      // Admin can access all channels
      if (req.user.role === 'admin') {
        req.channel = channel;
        return next();
      }

      // Public channels are accessible to all
      if (channel.visibility === 'public' && channel.type !== 'dm') {
        req.channel = channel;
        return next();
      }

      // Check membership
      if (!channel.hasMember(req.user._id)) {
        return next(new ForbiddenError('Not a member of this channel'));
      }

      req.channel = channel;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware to verify the user has access to the channel a message belongs to.
 * Loads the message, resolves its channelId, then checks membership.
 * Attaches req.message and req.channel on success.
 */
export function requireMessageAccess() {
  return async (req, res, next) => {
    try {
      const messageId = req.params.id || req.params.messageId;
      if (!messageId) {
        return next(new ForbiddenError('Message ID required'));
      }

      const { default: messageRepository } = await import('../messages/message.repository.js');
      const { default: channelRepository } = await import('../channels/channel.repository.js');

      const message = await messageRepository.findById(messageId);
      if (!message) {
        const { NotFoundError } = await import('../../middleware/errorHandler.js');
        return next(new NotFoundError('Message not found'));
      }

      const channel = await channelRepository.findById(message.channelId);
      if (!channel) {
        const { NotFoundError } = await import('../../middleware/errorHandler.js');
        return next(new NotFoundError('Channel not found'));
      }

      // Admin can access all
      if (req.user.role === 'admin') {
        req.message = message;
        req.channel = channel;
        return next();
      }

      // Public non-DM channels are accessible to all
      if (channel.visibility === 'public' && channel.type !== 'dm') {
        req.message = message;
        req.channel = channel;
        return next();
      }

      // Check membership
      if (!channel.hasMember(req.user._id)) {
        return next(new ForbiddenError('Not a member of this channel'));
      }

      req.message = message;
      req.channel = channel;
      next();
    } catch (error) {
      next(error);
    }
  };
}
