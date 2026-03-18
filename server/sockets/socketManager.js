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
 *   - Per-socket event rate limiting (Redis-backed for multi-instance)
 *   - Stale socket cleanup on server start (crash recovery)
 *   - Proper error handling in joinChannelRoom
 *   - Fresh channel list on disconnect (no stale closure)
 *   - Socket reconnect logging for monitoring
 *   - Redis adapter ready (conditional on REDIS_URL)
 *   - JWT heartbeat (periodic token validation, force reconnect on expiry)
 *   - Max 5 concurrent socket connections per user
 */

let io = null;

// ─── Typing Throttle ─────────────────────────────────────────────────────────
const typingThrottleMap = new Map();
const TYPING_THROTTLE_MS = 2000;

// ─── Socket Rate Limiting ────────────────────────────────────────────────────
// Redis-backed when available; local Map fallback for single-instance
let _redisClient = null;
const socketRateLimits = new Map(); // Fallback Map<socketId, { count, windowStart }>
const RATE_LIMIT_WINDOW_MS = 60000;  // 1 minute
const RATE_LIMIT_MAX_EVENTS = 30;    // Max events per window per socket
const MAX_SOCKETS_PER_USER = 5;      // Cap concurrent connections per user

// ─── JWT Heartbeat ───────────────────────────────────────────────────────────
const TOKEN_HEARTBEAT_MS = 5 * 60 * 1000; // Validate tokens every 5 minutes

// ─── Interval Tracking (for cleanup on shutdown) ─────────────────────────────
let throttleCleanupTimer = null;
let rateLimitCleanupTimer = null;
let tokenHeartbeatTimer = null;

/**
 * Get or initialize Redis client for socket rate limiting.
 */
async function getRedisClient() {
  if (_redisClient) return _redisClient;
  if (!env.REDIS_URL) return null;
  try {
    const { createClient } = await import('redis');
    _redisClient = createClient({ url: env.REDIS_URL });
    _redisClient.on('error', (err) => {
      logger.error('Redis client error (socket rate limit)', { error: err.message });
    });
    await _redisClient.connect();
    return _redisClient;
  } catch {
    return null;
  }
}

/**
 * Check if a socket has exceeded its event rate limit.
 * Uses Redis INCR for multi-instance safety when available.
 * @param {string} socketId
 * @returns {Promise<boolean>} true if rate limited
 */
async function isSocketRateLimited(socketId) {
  const redis = await getRedisClient();
  if (redis) {
    try {
      const key = `sock_rl:${socketId}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, Math.ceil(RATE_LIMIT_WINDOW_MS / 1000));
      }
      return count > RATE_LIMIT_MAX_EVENTS;
    } catch {
      // Fall through to in-memory
    }
  }

  // In-memory fallback
  const now = Date.now();
  let entry = socketRateLimits.get(socketId);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    socketRateLimits.set(socketId, entry);
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX_EVENTS;
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

      pubClient.on('error', (err) => logger.error('Redis pubClient error', { error: err.message }));
      subClient.on('error', (err) => logger.error('Redis subClient error', { error: err.message }));

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
      const requestedWsId = workspaceId || socket.handshake.auth.workspaceId || null;

      if (env.SOCKET_REQUIRE_WORKSPACE && !requestedWsId) {
        return next(new Error('Workspace context is required for socket connection'));
      }

      // Validate workspace membership if a workspace is specified
      if (requestedWsId) {
        try {
          const { default: WorkspaceMembership } = await import('../modules/workspaces/WorkspaceMembership.model.js');
          const membership = await WorkspaceMembership.findOne({
            userId: chatUser._id,
            workspaceId: requestedWsId,
            isActive: true,
          }).lean();
          if (!membership) {
            return next(new Error('Not a member of the requested workspace'));
          }
        } catch (err) {
          logger.error('Workspace membership check failed during socket auth', { error: err.message });
          return next(new Error('Workspace validation failed'));
        }
      }

      socket.workspaceId = requestedWsId;
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

    // Enforce max connections per user (cap at 5 tabs/devices)
    const currentUser = await userRepository.addSocketId(userId, socket.id);
    if (currentUser && currentUser.socketIds && currentUser.socketIds.length > MAX_SOCKETS_PER_USER) {
      // Disconnect oldest socket
      const oldestSocketId = currentUser.socketIds[0];
      if (oldestSocketId !== socket.id) {
        const oldSocket = io.sockets.sockets.get(oldestSocketId);
        if (oldSocket) {
          oldSocket.emit('error', { message: 'Session limit reached. Disconnecting oldest session.' });
          oldSocket.disconnect(true);
        }
        await userRepository.removeSocketId(userId, oldestSocketId);
      }
    }

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
      if (await isSocketRateLimited(socket.id)) {
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
        const channel = await channelRepository.findById(channelId, { workspaceId: wsId });
        if (!channel) {
          socket.emit('error', { message: 'Channel not found' });
          return;
        }

        // ── Cross-workspace isolation: prevent joining channels from other workspaces ──
        if (!wsId || !channel.workspaceId) {
          logger.warn('Socket channel join blocked — missing workspace context', {
            userId, channelId, socketWorkspace: wsId,
            channelWorkspace: channel.workspaceId?.toString(),
          });
          socket.emit('error', { message: 'Access denied: workspace context required' });
          return;
        }
        if (channel.workspaceId.toString() !== wsId) {
          logger.warn('Socket cross-workspace join attempt blocked', {
            userId, channelId, socketWorkspace: wsId,
            channelWorkspace: channel.workspaceId.toString(),
          });
          socket.emit('error', { message: 'Access denied: cross-workspace channel' });
          return;
        }

        // ── DM channels: strict participant check ──
        if (channel.type === 'dm') {
          const userIdStr = userId.toString();
          const isMember = channel.hasMember(user._id);
          const isParticipant = channel.dmParticipants?.map(p => p.toString()).includes(userIdStr);
          if (!isMember && !isParticipant) {
            socket.emit('error', { message: 'Not a participant of this DM' });
            return;
          }
          const joinRoom = wsId ? buildRoomName(wsId, 'channel', channelId) : `channel-${channelId}`;
          socket.join(joinRoom);
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

    // ── DM: Mark messages as seen (wires up messageService.markDMMessagesAsSeen) ──
    socket.on('dm:markSeen', async ({ channelId }) => {
      if (await isSocketRateLimited(socket.id)) return;
      if (!channelId) return;
      try {
        // Verify the user is a participant of this DM channel before marking seen
        const channel = await channelRepository.findById(channelId, { workspaceId: wsId });
        if (!channel || channel.type !== 'dm') return;
        if (wsId && channel.workspaceId?.toString() !== wsId) return;
        const userIdStr = userId.toString();
        const isParticipant = channel.dmParticipants?.map(p => p.toString()).includes(userIdStr);
        if (!isParticipant) return;

        // Lazy import to avoid circular dependency
        const { default: messageService } = await import('../modules/messages/message.service.js');
        await messageService.markDMMessagesAsSeen(channelId, userId, wsId);
      } catch (error) {
        logger.error('Socket dm:markSeen failed', { userId, channelId, error: error.message });
      }
    });

    // Leave a channel room
    socket.on('channel:leave', async (channelId) => {
      if (await isSocketRateLimited(socket.id)) return;
      const leaveRoom = wsId ? buildRoomName(wsId, 'channel', channelId) : `channel-${channelId}`;
      socket.leave(leaveRoom);
    });

    // Typing indicators — server-side throttled (max 1 emit per 2s per user/channel)
    socket.on('typing:start', async ({ channelId }) => {
      if (await isSocketRateLimited(socket.id)) return;

      const throttleKey = `${wsId || 'global'}-${userId}-${channelId}`;
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

    socket.on('typing:stop', async ({ channelId }) => {
      if (await isSocketRateLimited(socket.id)) return;

      const throttleKey = `${wsId || 'global'}-${userId}-${channelId}`;
      typingThrottleMap.delete(throttleKey);

      const typingRoom = wsId ? buildRoomName(wsId, 'channel', channelId) : `channel-${channelId}`;
      socket.to(typingRoom).emit(SOCKET_EVENTS.TYPING_STOP, {
        channelId,
        userId,
      });
    });

    // ─── Presence Update (away / back online) ────────────────────────
    socket.on('presence:update', async ({ status }) => {
      if (await isSocketRateLimited(socket.id)) return;
      if (status !== 'away' && status !== 'online') return;

      const event = status === 'away' ? SOCKET_EVENTS.USER_AWAY : SOCKET_EVENTS.USER_ONLINE;
      const payload = { userId, name: user.name };

      for (const channelId of initialChannelIds) {
        const chRoom = wsId ? buildRoomName(wsId, 'channel', channelId) : `channel-${channelId}`;
        socket.to(chRoom).emit(event, payload);
      }
    });

    // ─── Workspace Switching ─────────────────────────────────────────
    socket.on('workspace:switch', async (newWorkspaceId) => {
      if (await isSocketRateLimited(socket.id)) return;
      if (!newWorkspaceId || newWorkspaceId === wsId) return;

      try {
        // Verify membership in target workspace
        const { default: workspaceRepository } = await import('../modules/workspaces/workspace.repository.js');
        const isMember = await workspaceRepository.isMember(newWorkspaceId, userId);
        if (!isMember) {
          socket.emit('error', { message: 'Not a member of target workspace' });
          return;
        }

        // Broadcast offline to OLD workspace channels
        for (const channelId of initialChannelIds) {
          const chRoom = wsId ? buildRoomName(wsId, 'channel', channelId) : `channel-${channelId}`;
          socket.to(chRoom).emit(SOCKET_EVENTS.USER_OFFLINE, {
            userId,
            flowTaskUserId: user.flowTaskUserId,
          });
        }

        // Leave all current rooms (except personal socket room)
        const currentRooms = Array.from(socket.rooms);
        for (const room of currentRooms) {
          if (room !== socket.id) {
            socket.leave(room);
          }
        }

        // Update workspace context
        socket.workspaceId = newWorkspaceId;

        // Re-join rooms for new workspace
        const newUserRoom = buildRoomName(newWorkspaceId, 'user', userId);
        socket.join(newUserRoom);

        for (const deptId of user.departmentIds) {
          socket.join(buildRoomName(newWorkspaceId, 'dept', deptId));
        }

        const newChannels = await channelRepository.findByMember(userId, { workspaceId: newWorkspaceId });
        initialChannelIds = newChannels.map((c) => c._id.toString());

        for (const channelId of initialChannelIds) {
          socket.join(buildRoomName(newWorkspaceId, 'channel', channelId));
        }

        // Broadcast online to NEW workspace channels
        const onlinePayload = {
          userId,
          flowTaskUserId: user.flowTaskUserId,
          name: user.name,
          avatar: user.avatar,
        };
        for (const channelId of initialChannelIds) {
          const chRoom = buildRoomName(newWorkspaceId, 'channel', channelId);
          io.to(chRoom).emit(SOCKET_EVENTS.USER_ONLINE, onlinePayload);
        }

        socket.emit('workspace:switched', { workspaceId: newWorkspaceId });
        logger.info('Socket workspace switched', { userId, from: wsId, to: newWorkspaceId });
      } catch (error) {
        logger.error('Socket workspace:switch failed', { userId, error: error.message });
        socket.emit('error', { message: 'Failed to switch workspace' });
      }
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

  // ─── JWT Heartbeat (periodic token validation) ───────────────────────
  // Every 5 minutes, validate connected sockets' tokens.
  // Forces reconnect with fresh token if expired.
  tokenHeartbeatTimer = setInterval(async () => {
    if (!io) return;
    try {
      const sockets = await io.fetchSockets();
      for (const socket of sockets) {
        const { token } = socket.handshake.auth;
        if (!token) continue;

        let valid = false;

        // Try as Chat-issued access token first
        try {
          tokenService.verifyAccessToken(token);
          valid = true;
        } catch {
          // Not a Chat token — try FlowTask token
        }

        // Fallback: verify as FlowTask token
        if (!valid && env.FLOWTASK_ENABLED) {
          try {
            tokenService.verifyFlowTaskToken(token);
            valid = true;
          } catch {
            // Both token types failed
          }
        }

        if (!valid) {
          socket.emit('auth:expired', { message: 'Token expired. Please reconnect with a fresh token.' });
          socket.disconnect(true);
        }
      }
    } catch (err) {
      logger.error('Token heartbeat check failed', { error: err.message });
    }
  }, TOKEN_HEARTBEAT_MS);

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
  const room = resolveScopedRoom(workspaceId, 'user', userId, 'emitToUser');
  if (!room) return;
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
  const room = resolveScopedRoom(workspaceId, 'channel', channelId, 'emitToChannel');
  if (!room) return;
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
  const room = resolveScopedRoom(workspaceId, 'dept', departmentId, 'emitToDepartment');
  if (!room) return;
  io.to(room).emit(event, data);
}

function resolveScopedRoom(workspaceId, type, entityId, context) {
  if (workspaceId) {
    return buildRoomName(workspaceId, type, entityId);
  }

  if (env.SOCKET_REQUIRE_WORKSPACE) {
    logger.warn('Blocked unscoped socket emit due to strict workspace mode', {
      metric: 'socket_workspace_guard',
      event: 'emit_blocked_unscoped',
      context,
      type,
      entityId,
    });
    return null;
  }

  logger.warn('Unscoped socket emit fallback used', {
    metric: 'socket_workspace_guard',
    event: 'emit_unscoped_fallback',
    context,
    type,
    entityId,
  });

  if (type === 'user') return `user-${entityId}`;
  if (type === 'channel') return `channel-${entityId}`;
  if (type === 'dept') return `department-${entityId}`;
  return null;
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
    const userRoom = resolveScopedRoom(workspaceId, 'user', userId, 'joinChannelRoom.userRoom');
    const channelRoom = resolveScopedRoom(workspaceId, 'channel', channelId, 'joinChannelRoom.channelRoom');
    if (!userRoom || !channelRoom) return;
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
  if (tokenHeartbeatTimer) {
    clearInterval(tokenHeartbeatTimer);
    tokenHeartbeatTimer = null;
  }
  typingThrottleMap.clear();
  socketRateLimits.clear();

  // Close Redis rate-limit client if initialized
  if (_redisClient) {
    _redisClient.quit().catch(() => {});
    _redisClient = null;
  }

  logger.info('Socket resources cleaned up', {
    metric: 'socket_lifecycle',
    event: 'resources_cleaned',
  });
}
