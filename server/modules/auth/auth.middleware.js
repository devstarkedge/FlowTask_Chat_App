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
    } catch (err) {
      logger.debug('Chat-native token verify failed (will try FlowTask fallback)', {
        errorName: err.name,
        path: req.path,
      });
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
      } catch (err) {
        logger.warn('FlowTask token verify failed', {
          errorName: err.name,
          path: req.path,
          hint: err.name === 'TokenExpiredError'
            ? 'Token expired — user must re-login via FlowTask'
            : 'Secret mismatch? Verify FLOWTASK_JWT_SECRET (Chat) === CHAT_JWT_SECRET (FlowTask)',
        });
      }
    }

    if (!chatUser) {
      logger.warn('Auth failed: no matching user for token', {
        path: req.path,
        method: req.method,
        flowtaskEnabled: env.FLOWTASK_ENABLED,
        tokenPrefix: token.slice(0, 10) + '...',
      });
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
      if (!req.workspaceId) {
        return next(new ForbiddenError('Workspace context is required'));
      }

      const channelId = req.params.channelId || req.params.id;
      if (!channelId) {
        return next(new ForbiddenError('Channel ID required'));
      }

      // Import here to avoid circular dependency
      const { default: channelRepository } = await import('../channels/channel.repository.js');
      const { default: ChannelMember } = await import('../channels/ChannelMember.model.js');

      const channel = await channelRepository.findById(channelId, {
        workspaceId: req.workspaceId,
      });
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

      const isEmbeddedMember = channel.hasMember(req.user._id);

      // DM channels: must be participant
      if (channel.type === 'dm') {
        const userIdStr = req.user._id.toString();
        const flowTaskId = req.user.flowTaskUserId;
        const isParticipant = channel.dmParticipants?.some(
          (id) => id.toString() === userIdStr || id.toString() === flowTaskId
        );
        if (!isEmbeddedMember && !isParticipant) {
          return next(new ForbiddenError('Not a participant of this DM channel'));
        }
        req.channel = channel;
        return next();
      }

      // Other private channels: require membership
      const isPersistedMember = isEmbeddedMember
        ? true
        : await ChannelMember.isMember(channelId, req.user._id);

      if (!isPersistedMember) {
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
export function requireMessageAccess(options = { allowMissing: false }) {
  return async (req, res, next) => {
    try {
      if (!req.workspaceId) {
        return next(new ForbiddenError('Workspace context is required'));
      }

      const messageId = req.params.messageId || req.params.id;
      if (!messageId) {
        return next(new ForbiddenError('Message ID required'));
      }

      // Import here to avoid circular dependencies
      const { default: channelRepository } = await import('../channels/channel.repository.js');
      const { default: messageRepository } = await import('../messages/message.repository.js');

      const message = await messageRepository.findById(messageId, {
        workspaceId: req.workspaceId,
      });

      if (!message) {
        if (options.allowMissing) {
          return next();
        }
        const { NotFoundError } = await import('../../middleware/errorHandler.js');
        return next(new NotFoundError('Message not found'));
      }

      const channel = await channelRepository.findById(message.channelId, {
        workspaceId: req.workspaceId,
      });

      const { default: ChannelMember } = await import('../channels/ChannelMember.model.js');
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

      // DM channels: allow access if user is a participant
      if (channel.type === 'dm') {
        const userIdStr = req.user._id.toString();
        const flowTaskId = req.user.flowTaskUserId;
        const isMember = channel.hasMember(req.user._id);
        const isParticipant = channel.dmParticipants?.some(
          (id) => id.toString() === userIdStr || id.toString() === flowTaskId
        );
        if (!isMember && !isParticipant) {
          console.error(`[requireMessageAccess] 403: Not a participant of DM channel. channelId=${channelId}, userIdStr=${userIdStr}, flowTaskId=${flowTaskId}, dmParticipants=${channel.dmParticipants}`);
          return next(new ForbiddenError('Not a participant of this DM channel'));
        }
        req.message = message;
        req.channel = channel;
        return next();
      }

      // Check membership with embedded-members fallback to ChannelMember source of truth
      const channelId = message.channelId?._id?.toString?.() || message.channelId?.toString?.() || null;
      const isEmbeddedMember = channel.hasMember(req.user._id);
      const isPersistedMember = isEmbeddedMember
        ? true
        : channelId
          ? await ChannelMember.isMember(channelId, req.user._id)
          : false;

      if (!isPersistedMember) {
        console.error(`[requireMessageAccess] 403: Not a member of this channel. channelId=${channelId}, userId=${req.user._id}, isEmbedded=${isEmbeddedMember}`);
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
