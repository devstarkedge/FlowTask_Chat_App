import env from '../config/environment.js';
import tokenService from '../modules/auth/token.service.js';
import userRepository from '../modules/users/user.repository.js';
import channelRepository from '../modules/channels/channel.repository.js';
import logger from '../utils/logger.js';
import { logSocketReconnect } from '../utils/performanceLogger.js';
import { SOCKET_EVENTS } from '../config/constants.js';

/**
 * Socket.IO Manager — handles WebSocket connections, authentication, and room management.
 *
 * Room topology matches FlowTask's pattern (spec §2.2):
 *   user-{chatUserId}          — personal notifications
 *   channel-{channelId}        — per-channel messages
 *   department-{departmentId}  — department-scoped events
 *   typing-{channelId}         — ephemeral typing indicators
 *
 * Enterprise optimizations:
 *   - Scoped presence broadcast (only to user's channels, not global)
 *   - Server-side typing throttle (max 1 emit per 2s per user/channel)
 *   - Socket reconnect logging for monitoring
 */

let io = null;

// Server-side typing throttle state: Map<`${userId}-${channelId}`, lastEmitTimestamp>
const typingThrottleMap = new Map();
const TYPING_THROTTLE_MS = 2000;

/**
 * Initialize Socket.IO with the HTTP server.
 * @param {import('http').Server} httpServer
 * @param {object} corsOptions
 * @returns {import('socket.io').Server}
 */
export async function initializeSocket(httpServer, corsOptions) {
  const { Server } = await import('socket.io');

  io = new Server(httpServer, {
    cors: corsOptions,
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e6, // 1MB
    transports: ['websocket', 'polling'],
    perMessageDeflate: {
      threshold: 1024, // Only compress messages > 1KB
    },
  });

  // ─── Authentication Middleware ──────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const { token, userId } = socket.handshake.auth;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Dual-auth token verification
      let chatUser = null;

      // Strategy 1: Try as Chat-issued access token
      try {
        const decoded = tokenService.verifyAccessToken(token);
        if (decoded?.id && decoded.type === 'access') {
          chatUser = await userRepository.findById(decoded.id);
        }
      } catch {
        // Not a Chat-issued token
      }

      // Strategy 2: Try as FlowTask token (if enabled)
      if (!chatUser && env.FLOWTASK_ENABLED) {
        try {
          const decoded = tokenService.verifyFlowTaskToken(token);
          if (decoded?.id) {
            chatUser = await userRepository.findByFlowTaskId(decoded.id);
            socket.flowTaskUserId = decoded.id;
          }
        } catch {
          // Not a valid FlowTask token either
        }
      }

      if (!chatUser) {
        return next(new Error('Invalid or expired token'));
      }

      if (!chatUser.isActive) {
        return next(new Error('User account is deactivated'));
      }

      // Attach user to socket
      socket.chatUser = chatUser;
      // flowTaskUserId is set inside Strategy 2 try-block when applicable

      next();
    } catch (error) {
      logger.warn('Socket authentication failed', {
        error: error.message,
        ip: socket.handshake.address,
      });
      next(new Error('Authentication failed'));
    }
  });

  // ─── Connection Handler ────────────────────────────────────────────────
  io.on('connection', async (socket) => {
    const user = socket.chatUser;
    const userId = user._id.toString();

    logger.info('Socket connected', {
      userId,
      flowTaskUserId: user.flowTaskUserId,
      name: user.name,
      socketId: socket.id,
    });

    // Register socket and set user online
    await userRepository.addSocketId(userId, socket.id);

    // ─── Auto-join rooms ─────────────────────────────────────────────
    // Personal room
    socket.join(`user-${userId}`);

    // Department rooms
    for (const deptId of user.departmentIds) {
      socket.join(`department-${deptId}`);
    }

    // Channel rooms (all channels user belongs to)
    let userChannelIds = [];
    try {
      const channels = await channelRepository.findByMember(userId);
      for (const channel of channels) {
        socket.join(`channel-${channel._id}`);
        userChannelIds.push(channel._id.toString());
      }
    } catch (error) {
      logger.error('Failed to join channel rooms', {
        userId,
        error: error.message,
      });
    }

    // Broadcast presence — SCOPED to user's channels only (not global io.emit)
    const presencePayload = {
      userId,
      flowTaskUserId: user.flowTaskUserId,
      name: user.name,
      avatar: user.avatar,
    };
    for (const channelId of userChannelIds) {
      io.to(`channel-${channelId}`).emit(SOCKET_EVENTS.USER_ONLINE, presencePayload);
    }

    // ─── Client Events ───────────────────────────────────────────────

    // Join a specific channel room (on channel open) — with membership verification
    socket.on('channel:join', async (channelId) => {
      try {
        // Admin bypasses membership check
        if (user.role === 'admin') {
          socket.join(`channel-${channelId}`);
          return;
        }
        const channel = await channelRepository.findById(channelId);
        if (!channel) {
          socket.emit('error', { message: 'Channel not found' });
          return;
        }
        // Public non-DM channels are accessible to all authenticated users
        if (channel.visibility === 'public' && channel.type !== 'dm') {
          socket.join(`channel-${channelId}`);
          return;
        }
        // Check membership
        if (!channel.hasMember(user._id)) {
          socket.emit('error', { message: 'Not a member of this channel' });
          return;
        }
        socket.join(`channel-${channelId}`);
      } catch (error) {
        logger.error('Socket channel:join failed', { userId, channelId, error: error.message });
        socket.emit('error', { message: 'Failed to join channel' });
      }
    });

    // Leave a channel room (on channel close)
    socket.on('channel:leave', (channelId) => {
      socket.leave(`channel-${channelId}`);
    });

    // Typing indicators — server-side throttled (max 1 emit per 2s per user/channel)
    socket.on('typing:start', ({ channelId }) => {
      const throttleKey = `${userId}-${channelId}`;
      const now = Date.now();
      const lastEmit = typingThrottleMap.get(throttleKey) || 0;

      if (now - lastEmit < TYPING_THROTTLE_MS) {
        return; // Skip — throttled
      }
      typingThrottleMap.set(throttleKey, now);

      socket.to(`channel-${channelId}`).emit(SOCKET_EVENTS.TYPING_START, {
        channelId,
        userId,
        name: user.name,
      });
    });

    socket.on('typing:stop', ({ channelId }) => {
      const throttleKey = `${userId}-${channelId}`;
      typingThrottleMap.delete(throttleKey);

      socket.to(`channel-${channelId}`).emit(SOCKET_EVENTS.TYPING_STOP, {
        channelId,
        userId,
      });
    });

    // ─── Disconnection ───────────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      logger.info('Socket disconnected', { userId, socketId: socket.id, reason });
      logSocketReconnect(userId, socket.id, reason);

      const updatedUser = await userRepository.removeSocketId(userId, socket.id);

      // Only broadcast offline if all sockets are gone (multi-tab support)
      // Scoped to user's channels instead of global broadcast
      if (updatedUser && updatedUser.socketIds.length === 0) {
        const offlinePayload = {
          userId,
          flowTaskUserId: user.flowTaskUserId,
          lastSeenAt: updatedUser.lastSeenAt,
        };
        for (const channelId of userChannelIds) {
          io.to(`channel-${channelId}`).emit(SOCKET_EVENTS.USER_OFFLINE, offlinePayload);
        }
      }
    });
  });

  // Periodically clean up stale typing throttle entries (every 30s)
  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of typingThrottleMap.entries()) {
      if (now - timestamp > 10000) {
        typingThrottleMap.delete(key);
      }
    }
  }, 30000);

  logger.info('Socket.IO initialized');
  return io;
}

// ─── Emit Helpers ────────────────────────────────────────────────────────────

/**
 * Emit event to a specific user (all their sockets/tabs).
 */
export function emitToUser(userId, event, data) {
  if (!io) return;
  io.to(`user-${userId}`).emit(event, data);
}

/**
 * Emit event to a channel room.
 */
export function emitToChannel(channelId, event, data) {
  if (!io) return;
  io.to(`channel-${channelId}`).emit(event, data);
}

/**
 * Emit event to a department room.
 */
export function emitToDepartment(departmentId, event, data) {
  if (!io) return;
  io.to(`department-${departmentId}`).emit(event, data);
}

/**
 * Emit event to all connected clients.
 */
export function emitToAll(event, data) {
  if (!io) return;
  io.emit(event, data);
}

/**
 * Make a specific socket join a channel room.
 */
export function joinChannelRoom(userId, channelId) {
  if (!io) return;
  const room = `user-${userId}`;
  const sockets = io.in(room).fetchSockets();
  sockets.then((socketList) => {
    for (const socket of socketList) {
      socket.join(`channel-${channelId}`);
    }
  });
}

/**
 * Get Socket.IO instance.
 */
export function getIO() {
  return io;
}

/**
 * Get connection count.
 */
export function getConnectionCount() {
  if (!io) return 0;
  return io.engine?.clientsCount || 0;
}
