import jwt from 'jsonwebtoken';
import env from '../config/environment.js';
import userRepository from '../modules/users/user.repository.js';
import channelRepository from '../modules/channels/channel.repository.js';
import logger from '../utils/logger.js';
import { SOCKET_EVENTS } from '../config/constants.js';

/**
 * Socket.IO Manager — handles WebSocket connections, authentication, and room management.
 *
 * Room topology matches FlowTask's pattern (spec §2.2):
 *   user-{chatUserId}          — personal notifications
 *   channel-{channelId}        — per-channel messages
 *   department-{departmentId}  — department-scoped events
 *   typing-{channelId}         — ephemeral typing indicators
 */

let io = null;

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

      // Verify JWT (same secret as FlowTask)
      const decoded = jwt.verify(token, env.JWT_SECRET);
      if (!decoded?.id) {
        return next(new Error('Invalid token payload'));
      }

      // Find or sync ChatUser
      let chatUser = await userRepository.findByFlowTaskId(decoded.id);
      if (!chatUser) {
        // User hasn't been synced yet — reject until auth/sync is called
        return next(new Error('User not synced to chat. Call POST /api/chat/auth/sync first.'));
      }

      if (!chatUser.isActive) {
        return next(new Error('User account is deactivated'));
      }

      // Attach user to socket
      socket.chatUser = chatUser;
      socket.flowTaskUserId = decoded.id;

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
    try {
      const channels = await channelRepository.findByMember(userId);
      for (const channel of channels) {
        socket.join(`channel-${channel._id}`);
      }
    } catch (error) {
      logger.error('Failed to join channel rooms', {
        userId,
        error: error.message,
      });
    }

    // Broadcast presence
    io.emit(SOCKET_EVENTS.USER_ONLINE, {
      userId,
      flowTaskUserId: user.flowTaskUserId,
      name: user.name,
      avatar: user.avatar,
    });

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

    // Typing indicators (ephemeral, no persistence)
    socket.on('typing:start', ({ channelId }) => {
      socket.to(`channel-${channelId}`).emit(SOCKET_EVENTS.TYPING_START, {
        channelId,
        userId,
        name: user.name,
      });
    });

    socket.on('typing:stop', ({ channelId }) => {
      socket.to(`channel-${channelId}`).emit(SOCKET_EVENTS.TYPING_STOP, {
        channelId,
        userId,
      });
    });

    // ─── Disconnection ───────────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      logger.info('Socket disconnected', { userId, socketId: socket.id, reason });

      const updatedUser = await userRepository.removeSocketId(userId, socket.id);

      // Only broadcast offline if all sockets are gone (multi-tab support)
      if (updatedUser && updatedUser.socketIds.length === 0) {
        io.emit(SOCKET_EVENTS.USER_OFFLINE, {
          userId,
          flowTaskUserId: user.flowTaskUserId,
          lastSeenAt: updatedUser.lastSeenAt,
        });
      }
    });
  });

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
