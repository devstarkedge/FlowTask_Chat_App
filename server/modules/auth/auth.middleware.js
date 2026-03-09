import env from '../../config/environment.js';
import tokenService from './token.service.js';
import userRepository from '../users/user.repository.js';
import logger from '../../utils/logger.js';
import { UnauthorizedError, ForbiddenError } from '../../middleware/errorHandler.js';
import WorkspaceMembership from '../workspaces/WorkspaceMembership.model.js';

/**
 * Auth Middleware — JWT verification and RBAC for Express routes.
 *
 * Dual-auth strategy:
 *  - First tries to verify as a Chat-issued access token (JWT_SECRET)
 *  - Falls back to FlowTask token (FLOWTASK_JWT_SECRET) when FlowTask is enabled
 *  - Looks up user by _id (native) or flowTaskUserId (FlowTask)
 */

/**
 * JWT verification middleware.
 * Extracts Bearer token, verifies with dual-strategy,
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

    let chatUser = null;

    // Strategy 1: Try as Chat-issued access token
    try {
      const decoded = tokenService.verifyAccessToken(token);
      if (decoded?.id && decoded.type === 'access') {
        chatUser = await userRepository.findById(decoded.id);
      }
    } catch {
      // Not a Chat-issued token — continue to FlowTask fallback
    }

    // Strategy 2: Try as FlowTask-issued token (if enabled and Strategy 1 failed)
    if (!chatUser && env.FLOWTASK_ENABLED) {
      try {
        const decoded = tokenService.verifyFlowTaskToken(token);
        if (decoded?.id) {
          chatUser = await userRepository.findByFlowTaskId(decoded.id);
          // Store FlowTask-specific info
          req.flowTaskToken = token;
          req.flowTaskUserId = decoded.id;
        }
      } catch {
        // Not a valid FlowTask token either
      }
    }

    if (!chatUser) {
      throw new UnauthorizedError('Invalid or expired token');
    }

    if (!chatUser.isActive) {
      throw new UnauthorizedError('User account is deactivated');
    }

    // Attach to request (global identity — no workspaceId in JWT)
    req.user = chatUser;

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

      // Public non-DM channels are accessible to all workspace members
      if (channel.visibility === 'public' && channel.type !== 'dm') {
        req.channel = channel;
        return next();
      }

      // DM channels: allow access if user is a participant, even if
      // embedded members[] is out of sync with ChannelMember.
      if (channel.type === 'dm') {
        const userIdStr = req.user._id.toString();
        const isMember = channel.hasMember(req.user._id);
        const isParticipant = channel.dmParticipants?.some((id) => id.toString() === userIdStr);
        if (!isMember && !isParticipant) {
          return next(new ForbiddenError('Not a participant of this DM channel'));
        }
        req.channel = channel;
        return next();
      }

      // Other private channels: require membership
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
