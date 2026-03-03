import env from '../config/environment.js';
import tokenService from '../modules/auth/token.service.js';
import userRepository from '../modules/users/user.repository.js';
import channelRepository from '../modules/channels/channel.repository.js';
import logger from '../utils/logger.js';
import { logSocketReconnect } from '../utils/performanceLogger.js';
import { SOCKET_EVENTS, buildRoomName } from '../config/constants.js';

/**
 * Socket.IO Manager — handles WebSocket connections, authentication, and room management.
 *
 * Room topology:
 *   ws:{workspaceId}:user:{chatUserId}     — personal notifications (all tabs)
 *   ws:{workspaceId}:channel:{channelId}   — per-channel messages
 *   ws:{workspaceId}:dept:{departmentId}   — department-scoped events
 *
 * Enterprise features:
 *   - Scoped presence broadcast (only to user's channels, not global)
 *   - Server-side typing throttle (max 1 emit per 2s per user/channel)
 *   - Per-socket event rate limiting (prevents abuse)
 *   - Stale socket cleanup on server start (crash recovery)
 *   - Proper error handling in joinChannelRoom
 *   - Fresh channel list on disconnect (no stale closure)
 *   - Socket reconnect logging for monitoring
 *   - Redis adapter ready (conditional on REDIS_URL)
 */

let io = null;

// ─── Typing Throttle ─────────────────────────────────────────────────────────
const typingThrottleMap = new Map();
const TYPING_THROTTLE_MS = 2000;

// ─── Socket Rate Limiting ────────────────────────────────────────────────────
const socketRateLimits = new Map(); // Map<socketId, { count, windowStart }>
const RATE_LIMIT_WINDOW_MS = 60000;  // 1 minute
const RATE_LIMIT_MAX_EVENTS = 100;   // Max events per window per socket

// ─── Interval Tracking (for cleanup on shutdown) ─────────────────────────────
let throttleCleanupTimer = null;
let rateLimitCleanupTimer = null;

/**
 * Check if a socket has exceeded its event rate limit.
 * @param {string} socketId
 * @returns {boolean} true if rate limited
 */
function isSocketRateLimited(socketId) {
  const now = Date.now();
  let entry = socketRateLimits.get(socketId);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    socketRateLimits.set(socketId, entry);
  }

  entry.count++;

  if (entry.count > RATE_LIMIT_MAX_EVENTS) {
    return true;
  }
  return false;
}

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

  // ─── Redis Adapter (optional — enables horizontal scaling) ───────────
  if (env.REDIS_URL) {
    try {
      const { createAdapter } = await import('@socket.io/redis-adapter');
      const { createClient } = await import('redis');

      const pubClient = createClient({ url: env.REDIS_URL });
      const subClient = pubClient.duplicate();

      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));

      logger.info('Socket.IO Redis adapter initialized', {
        metric: 'socket_lifecycle',
        event: 'redis_adapter_connected',
      });
    } catch (error) {
      logger.warn('Redis adapter failed, falling back to in-memory adapter', {
        metric: 'socket_lifecycle',
        event: 'redis_adapter_failed',
        error: error.message,
      });
      // Continue with default in-memory adapter
    }
  }

  // ─── Stale Socket Cleanup (crash recovery) ─────────────────────────
  try {
    const result = await userRepository.clearAllSocketIds();
    if (result.modifiedCount > 0) {
      logger.info('Cleared stale socket state from previous session', {
        metric: 'socket_lifecycle',
        event: 'stale_cleanup',
        usersReset: result.modifiedCount,
      });
    }
  } catch (error) {
    logger.error('Failed to clear stale socket IDs', { error: error.message });
  }

  // ─── Authentication Middleware ──────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const { token } = socket.handshake.auth;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Dual-auth token verification
      let chatUser = null;
      let workspaceId = null;

      // Strategy 1: Try as Chat-issued access token
      try {
        const decoded = tokenService.verifyAccessToken(token);
        if (decoded?.id && decoded.type === 'access') {
          chatUser = await userRepository.findById(decoded.id);
          workspaceId = decoded.workspaceId || null;
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
      socket.workspaceId = workspaceId || socket.handshake.auth.workspaceId || null;
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
    const wsId = socket.workspaceId;

    logger.info('Socket connected', {
      metric: 'socket_lifecycle',
      event: 'connected',
      userId,
      flowTaskUserId: user.flowTaskUserId,
      name: user.name,
      socketId: socket.id,
      workspaceId: wsId,
    });

    // Register socket and set user online
    await userRepository.addSocketId(userId, socket.id);

    // ─── Auto-join rooms ─────────────────────────────────────────────
    // Personal room (workspace-scoped)
    const userRoom = wsId ? buildRoomName(wsId, 'user', userId) : `user-${userId}`;
    socket.join(userRoom);

    // Department rooms
    for (const deptId of user.departmentIds) {
      const deptRoom = wsId ? buildRoomName(wsId, 'dept', deptId) : `department-${deptId}`;
      socket.join(deptRoom);
    }

    // Channel rooms (all channels user belongs to)
    let initialChannelIds = [];
    try {
      const channels = await channelRepository.findByMember(userId, { workspaceId: wsId });
      for (const channel of channels) {
        const chRoom = wsId ? buildRoomName(wsId, 'channel', channel._id) : `channel-${channel._id}`;
        socket.join(chRoom);
        initialChannelIds.push(channel._id.toString());
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
    for (const channelId of initialChannelIds) {
      const chRoom = wsId ? buildRoomName(wsId, 'channel', channelId) : `channel-${channelId}`;
      io.to(chRoom).emit(SOCKET_EVENTS.USER_ONLINE, presencePayload);
    }

    // ─── Client Events (with rate limiting) ──────────────────────────

    // Join a specific channel room — with membership verification
    socket.on('channel:join', async (channelId) => {
      if (isSocketRateLimited(socket.id)) {
        socket.emit('error', { message: 'Rate limited. Please slow down.' });
        return;
      }

      try {
        // Admin bypasses membership check
        if (user.role === 'admin') {
          const joinRoom = wsId ? buildRoomName(wsId, 'channel', channelId) : `channel-${channelId}`;
          socket.join(joinRoom);
          return;
        }
        const channel = await channelRepository.findById(channelId);
        if (!channel) {
          socket.emit('error', { message: 'Channel not found' });
          return;
        }
        // Public non-DM channels are accessible to all authenticated users
        if (channel.visibility === 'public' && channel.type !== 'dm') {
          const joinRoom = wsId ? buildRoomName(wsId, 'channel', channelId) : `channel-${channelId}`;
          socket.join(joinRoom);
          return;
        }
        // Check membership
        if (!channel.hasMember(user._id)) {
          socket.emit('error', { message: 'Not a member of this channel' });
          return;
        }
        const joinRoom = wsId ? buildRoomName(wsId, 'channel', channelId) : `channel-${channelId}`;
        socket.join(joinRoom);
      } catch (error) {
        logger.error('Socket channel:join failed', { userId, channelId, error: error.message });
        socket.emit('error', { message: 'Failed to join channel' });
      }
    });

    // Leave a channel room
    socket.on('channel:leave', (channelId) => {
      if (isSocketRateLimited(socket.id)) return;
      const leaveRoom = wsId ? buildRoomName(wsId, 'channel', channelId) : `channel-${channelId}`;
      socket.leave(leaveRoom);
    });

    // Typing indicators — server-side throttled (max 1 emit per 2s per user/channel)
    socket.on('typing:start', ({ channelId }) => {
      if (isSocketRateLimited(socket.id)) return;

      const throttleKey = `${userId}-${channelId}`;
      const now = Date.now();
      const lastEmit = typingThrottleMap.get(throttleKey) || 0;

      if (now - lastEmit < TYPING_THROTTLE_MS) {
        return; // Skip — throttled
      }
      typingThrottleMap.set(throttleKey, now);

      const typingRoom = wsId ? buildRoomName(wsId, 'channel', channelId) : `channel-${channelId}`;
      socket.to(typingRoom).emit(SOCKET_EVENTS.TYPING_START, {
        channelId,
        userId,
        name: user.name,
      });
    });

    socket.on('typing:stop', ({ channelId }) => {
      if (isSocketRateLimited(socket.id)) return;

      const throttleKey = `${userId}-${channelId}`;
      typingThrottleMap.delete(throttleKey);

      const typingRoom = wsId ? buildRoomName(wsId, 'channel', channelId) : `channel-${channelId}`;
      socket.to(typingRoom).emit(SOCKET_EVENTS.TYPING_STOP, {
        channelId,
        userId,
      });
    });

    // ─── Disconnection ───────────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      logger.info('Socket disconnected', {
        metric: 'socket_lifecycle',
        event: 'disconnected',
        userId,
        socketId: socket.id,
        reason,
      });
      logSocketReconnect(userId, socket.id, reason);

      // Clean up rate limit entry
      socketRateLimits.delete(socket.id);

      const updatedUser = await userRepository.removeSocketId(userId, socket.id);

      // Only broadcast offline if all sockets are gone (multi-tab support)
      if (updatedUser && updatedUser.socketIds.length === 0) {
        // Re-fetch current channel list instead of using stale closure
        // This ensures offline is broadcast to channels joined mid-session
        let currentChannelIds = initialChannelIds;
        try {
          const currentChannels = await channelRepository.findByMember(userId, { workspaceId: wsId });
          currentChannelIds = currentChannels.map((c) => c._id.toString());
        } catch {
          // Fall back to initial channel list if query fails
        }

        const offlinePayload = {
          userId,
          flowTaskUserId: user.flowTaskUserId,
          lastSeenAt: updatedUser.lastSeenAt,
        };
        for (const channelId of currentChannelIds) {
          const chRoom = wsId ? buildRoomName(wsId, 'channel', channelId) : `channel-${channelId}`;
          io.to(chRoom).emit(SOCKET_EVENTS.USER_OFFLINE, offlinePayload);
        }
      }
    });
  });

  // ─── Periodic Cleanup Intervals ────────────────────────────────────────

  // Clean stale typing throttle entries every 30s
  throttleCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of typingThrottleMap.entries()) {
      if (now - timestamp > 10000) {
        typingThrottleMap.delete(key);
      }
    }
  }, 30000);

  // Clean stale rate limit entries every 60s
  rateLimitCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [socketId, entry] of socketRateLimits.entries()) {
      if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
        socketRateLimits.delete(socketId);
      }
    }
  }, 60000);

  logger.info('Socket.IO initialized', {
    metric: 'socket_lifecycle',
    event: 'initialized',
    redisAdapter: !!env.REDIS_URL,
  });

  return io;
}

// ─── Emit Helpers ────────────────────────────────────────────────────────────

/**
 * Emit event to a specific user (all their sockets/tabs).
 * @param {string} userId
 * @param {string} event
 * @param {object} data
 * @param {string} [workspaceId] - If provided, uses workspace-scoped room
 */
export function emitToUser(userId, event, data, workspaceId) {
  if (!io) return;
  const room = workspaceId ? buildRoomName(workspaceId, 'user', userId) : `user-${userId}`;
  io.to(room).emit(event, data);
}

/**
 * Emit event to a channel room.
 * @param {string} channelId
 * @param {string} event
 * @param {object} data
 * @param {string} [workspaceId] - If provided, uses workspace-scoped room
 */
export function emitToChannel(channelId, event, data, workspaceId) {
  if (!io) return;
  const room = workspaceId ? buildRoomName(workspaceId, 'channel', channelId) : `channel-${channelId}`;
  io.to(room).emit(event, data);
}

/**
 * Emit event to a department room.
 * @param {string} departmentId
 * @param {string} event
 * @param {object} data
 * @param {string} [workspaceId] - If provided, uses workspace-scoped room
 */
export function emitToDepartment(departmentId, event, data, workspaceId) {
  if (!io) return;
  const room = workspaceId ? buildRoomName(workspaceId, 'dept', departmentId) : `department-${departmentId}`;
  io.to(room).emit(event, data);
}

/**
 * Emit event to all connected clients.
 */
export function emitToAll(event, data) {
  if (!io) return;
  io.emit(event, data);
}

/**
 * Make a specific user's sockets join a channel room.
 * Used when adding members to channels programmatically.
 * @param {string} userId
 * @param {string} channelId
 * @param {string} [workspaceId]
 */
export async function joinChannelRoom(userId, channelId, workspaceId) {
  if (!io) return;
  try {
    const userRoom = workspaceId ? buildRoomName(workspaceId, 'user', userId) : `user-${userId}`;
    const channelRoom = workspaceId ? buildRoomName(workspaceId, 'channel', channelId) : `channel-${channelId}`;
    const socketList = await io.in(userRoom).fetchSockets();
    for (const socket of socketList) {
      socket.join(channelRoom);
    }
  } catch (error) {
    logger.error('Failed to join channel room programmatically', {
      userId,
      channelId,
      error: error.message,
    });
  }
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

/**
 * Clean up socket-related resources (intervals, maps).
 * Called during graceful shutdown.
 */
export function cleanupSocketResources() {
  if (throttleCleanupTimer) {
    clearInterval(throttleCleanupTimer);
    throttleCleanupTimer = null;
  }
  if (rateLimitCleanupTimer) {
    clearInterval(rateLimitCleanupTimer);
    rateLimitCleanupTimer = null;
  }
  typingThrottleMap.clear();
  socketRateLimits.clear();

  logger.info('Socket resources cleaned up', {
    metric: 'socket_lifecycle',
    event: 'resources_cleaned',
  });
}
