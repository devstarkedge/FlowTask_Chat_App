import env from '../config/environment.js';
import tokenService from '../modules/auth/token.service.js';
import userRepository from '../modules/users/user.repository.js';
import channelRepository from '../modules/channels/channel.repository.js';
import logger from '../utils/logger.js';
import { logSocketReconnect } from '../utils/performanceLogger.js';
import { SOCKET_EVENTS, buildRoomName } from '../config/constants.js';
import registerCanvasSocket from '../modules/canvas/canvas.socket.js';


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
let adapterPubClient = null;
let adapterSubClient = null;
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
 * Check if a socket has exceeded its event rate limit.
 * Uses Redis INCR for multi-instance safety when available.
 * @param {string} socketId
 * @returns {Promise<boolean>} true if rate limited
 */
async function isSocketRateLimited(socketId) {
  let redis = null;
  try {
    const { default: redisManager } = await import('../config/redisManager.js');
    redis = redisManager.getSharedClient();
  } catch (err) {}
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
      const { default: redisManager } = await import('../config/redisManager.js');
      
      const pubClient = redisManager.getSharedClient();
      const subClient = redisManager.getSubscriberClient();

      if (pubClient && subClient) {
        io.adapter(createAdapter(pubClient, subClient));
        logger.info('Socket.IO Redis adapter initialized with shared clients', {
          metric: 'socket_lifecycle',
          event: 'redis_adapter_connected',
        });
      } else {
        throw new Error("Shared Redis clients not available");
      }
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
      const requestedWsId = socket.handshake.auth.workspaceId || null;

      if (!requestedWsId) {
        return next(new Error('Workspace context is required for socket connection'));
      }

      if (!/^[0-9a-fA-F]{24}$/.test(requestedWsId)) {
        return next(new Error('Invalid workspace context'));
      }

      // Validate workspace membership if a workspace is specified
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


  // Helper to broadcast presence to all workspaces a user belongs to
  async function broadcastPresence(userId, event, payload) {
    try {
      const { default: WorkspaceMembership } = await import('../modules/workspaces/WorkspaceMembership.model.js');
      const memberships = await WorkspaceMembership.find({ userId, isActive: true }).lean();
      for (const m of memberships) {
        io.to(`ws:${m.workspaceId}:workspace`).emit(event, payload);
      }
    } catch (err) {
      console.error('Failed to broadcast presence to workspaces', { error: err.message, userId });
    }
  }

  // ─── Connection Handler ────────────────────────────────────────────────

  io.on('connection', async (socket) => {
    const user = socket.chatUser;
    const userId = user._id.toString();
    let wsId = socket.workspaceId;

    logger.info('Socket connected', {
      metric: 'socket_lifecycle',
      event: 'connected',
      userId,
      flowTaskUserId: user.flowTaskUserId,
      name: user.name,
      socketId: socket.id,
      workspaceId: wsId,
    });

    // Register Canvas Socket Listeners
    registerCanvasSocket(io, socket);

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
    const userRoom = buildRoomName(wsId, 'user', userId);
    socket.join(userRoom);
    
    // Workspace-scoped room for workspace-wide broadcasts
    const workspaceRoom = `ws:${wsId}:workspace`;
    socket.join(workspaceRoom);

    // Department rooms
    for (const deptId of user.departmentIds) {
      const deptRoom = buildRoomName(wsId, 'dept', deptId);
      socket.join(deptRoom);
    }

    // Channel rooms (all channels user belongs to)
    let initialChannelIds = [];
    try {
      const { default: channelService } = await import('../modules/channels/channel.service.js');
      const channels = await channelService.getChannelsForUser(userId, wsId);
      for (const channel of channels) {
        // LAZY JOIN: We no longer socket.join(chRoom) here for all channels.
        // Clients must explicitly emit 'channel:join' when they navigate to a channel.
        // We still collect initialChannelIds to broadcast this user's presence to those rooms.
        initialChannelIds.push(channel._id.toString());
      }
    } catch (error) {
      logger.error('Failed to get channels for presence', {
        userId,
        error: error.message,
      });
    }
    // ─── Initial Presence Sync ───────────────────────────────────────
    // Sync full current online presence to the newly connected socket
    try {
      if (wsId) {
        const onlineUsers = await userRepository.findOnline(wsId);
        const mappedUsers = onlineUsers.map((u) => ({
          userId: u._id.toString(),
          flowTaskUserId: u.flowTaskUserId,
          name: u.name,
          avatar: u.avatar,
          onlineStatus: u.onlineStatus,
        }));
        socket.emit(SOCKET_EVENTS.PRESENCE_SYNC, { users: mappedUsers });
      }
    } catch (err) {
      logger.error('Failed to sync initial presence', { userId, wsId, error: err.message });
    }

    // Broadcast presence — SCOPED to user's channels only (not global io.emit)
    const presencePayload = {
      userId,
      flowTaskUserId: user.flowTaskUserId,
      name: currentUser ? currentUser.name : user.name,
      avatar: currentUser ? currentUser.avatar : user.avatar,
    };
    const presenceEvent = currentUser?.onlineStatus === 'away' ? SOCKET_EVENTS.USER_AWAY : SOCKET_EVENTS.USER_ONLINE;
    for (const channelId of initialChannelIds) {
      const chRoom = buildRoomName(wsId, 'channel', channelId);
      io.to(chRoom).emit(presenceEvent, presencePayload);
    }

    // ─── Client Events (with rate limiting) ──────────────────────────

    // Join a specific channel room — with membership verification
    socket.on('channel:join', async (channelId) => {
      if (await isSocketRateLimited(socket.id)) {
        socket.emit('error', { message: 'Rate limited. Please slow down.' });
        return;
      }

      if (!wsId) {
        socket.emit('error', { message: 'Access denied: workspace context required' });
        return;
      }

      try {
        const channel = await channelRepository.findById(channelId, { workspaceId: wsId });
        if (!channel) {
          socket.emit('error', { message: 'Channel not found' });
          return;
        }

        // ── Cross-workspace isolation: prevent joining channels from other workspaces ──
        if (!channel.workspaceId) {
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

        // Permission engine: users with VIEW_ALL_CHANNELS capability can join any channel
        const { default: permissionEngine } = await import('../services/permissionEngine.js');
        if (
          channel.type !== 'project' &&
          channel.flowTaskRef?.entityType !== 'board' &&
          permissionEngine.canViewAllChannels(user, { workspaceId: wsId })
        ) {
          const joinRoom = buildRoomName(wsId, 'channel', channelId);
          socket.join(joinRoom);
          // Emit persisted canvas tabs for this channel to the joining socket
          try {
            if (channel && Array.isArray(channel.canvasTabs) && channel.canvasTabs.length > 0) {
              const tabs = channel.canvasTabs.map((t) => ({ _id: t.canvasId ? String(t.canvasId) : null, title: t.title || "" })).filter((x) => x._id);
              if (tabs.length > 0) socket.emit('canvas:tabs:state', { channelId: channelId.toString(), tabs });
            }
          } catch (err) {
            logger.debug('Failed to emit canvas tabs on channel:join (view all)', { error: err.message, channelId });
          }
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
          const joinRoom = buildRoomName(wsId, 'channel', channelId);
          socket.join(joinRoom);
          try {
            if (channel && Array.isArray(channel.canvasTabs) && channel.canvasTabs.length > 0) {
              const tabs = channel.canvasTabs.map((t) => ({ _id: t.canvasId ? String(t.canvasId) : null, title: t.title || "" })).filter((x) => x._id);
              if (tabs.length > 0) socket.emit('canvas:tabs:state', { channelId: channelId.toString(), tabs });
            }
          } catch (err) {
            logger.debug('Failed to emit canvas tabs on channel:join (dm)', { error: err.message, channelId });
          }
          return;
        }

        // Public non-DM channels are accessible to all authenticated users
        if (
          channel.visibility === 'public' &&
          channel.type !== 'dm' &&
          channel.type !== 'project' &&
          channel.flowTaskRef?.entityType !== 'board'
        ) {
          const joinRoom = buildRoomName(wsId, 'channel', channelId);
          socket.join(joinRoom);
          try {
            if (channel && Array.isArray(channel.canvasTabs) && channel.canvasTabs.length > 0) {
              const tabs = channel.canvasTabs.map((t) => ({ _id: t.canvasId ? String(t.canvasId) : null, title: t.title || "" })).filter((x) => x._id);
              if (tabs.length > 0) socket.emit('canvas:tabs:state', { channelId: channelId.toString(), tabs });
            }
          } catch (err) {
            logger.debug('Failed to emit canvas tabs on channel:join (public)', { error: err.message, channelId });
          }
          return;
        }
        // Check membership
        const { default: ChannelMember } = await import('../modules/channels/ChannelMember.model.js');
        const isChannelMember = channel.hasMember(user._id)
          ? true
          : await ChannelMember.isMember(channelId, user._id);
        if (!isChannelMember) {
          socket.emit('error', { message: 'Not a member of this channel' });
          return;
        }
        const joinRoom = buildRoomName(wsId, 'channel', channelId);
        socket.join(joinRoom);
        try {
          if (channel && Array.isArray(channel.canvasTabs) && channel.canvasTabs.length > 0) {
            const tabs = channel.canvasTabs.map((t) => ({ _id: t.canvasId ? String(t.canvasId) : null, title: t.title || "" })).filter((x) => x._id);
            if (tabs.length > 0) socket.emit('canvas:tabs:state', { channelId: channelId.toString(), tabs });
          }
        } catch (err) {
          logger.debug('Failed to emit canvas tabs on channel:join (member)', { error: err.message, channelId });
        }
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
      const leaveRoom = buildRoomName(wsId, 'channel', channelId);
      socket.leave(leaveRoom);
    });

    // Typing indicators — server-side throttled (max 1 emit per 2s per user/channel)
    socket.on('typing:start', async ({ channelId }) => {
      if (await isSocketRateLimited(socket.id)) return;

      const throttleKey = `${wsId }-${userId}-${channelId}`;
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

      const throttleKey = `${wsId }-${userId}-${channelId}`;
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
        const isMember = await workspaceRepository.isMember(userId, newWorkspaceId);
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
        wsId = newWorkspaceId;

        // Re-join rooms for new workspace
        const newUserRoom = buildRoomName(newWorkspaceId, 'user', userId);
        socket.join(newUserRoom);
        
        // Join workspace-scoped room for workspace-wide broadcasts
        const workspaceRoom = `ws:${newWorkspaceId}:workspace`;
        socket.join(workspaceRoom);

        for (const deptId of user.departmentIds) {
          socket.join(buildRoomName(newWorkspaceId, 'dept', deptId));
        }

        const { default: channelService } = await import('../modules/channels/channel.service.js');
        const newChannels = await channelService.getChannelsForUser(userId, newWorkspaceId);
        initialChannelIds = newChannels.map((c) => c._id.toString());

        // LAZY JOIN: We no longer auto-join all channel rooms on workspace switch.
        // Clients must explicitly emit 'channel:join' for the channel they want to view.

        // Broadcast presence to NEW workspace channels
        const onlinePayload = {
          userId,
          flowTaskUserId: user.flowTaskUserId,
          name: user.name,
          avatar: user.avatar,
        };
        const freshUser = await userRepository.findById(userId);
        const presenceEvent = freshUser?.onlineStatus === 'away' ? SOCKET_EVENTS.USER_AWAY : SOCKET_EVENTS.USER_ONLINE;
        for (const channelId of initialChannelIds) {
          const chRoom = buildRoomName(newWorkspaceId, 'channel', channelId);
          io.to(chRoom).emit(presenceEvent, onlinePayload);
        }

        socket.emit('workspace:switched', { workspaceId: newWorkspaceId });
        logger.info('Socket workspace switched', { userId, from: wsId, to: newWorkspaceId });
      } catch (error) {
        logger.error('Socket workspace:switch failed', { userId, error: error.message });
        socket.emit('error', { message: 'Failed to switch workspace' });
      }
    });

    // ─── Window Focus Tracking (for notification suppression) ─────────
    // Client reports which channelId is currently visible so the
    // notification engine can skip push when user is already viewing that chat.
    socket.on(SOCKET_EVENTS.WINDOW_FOCUS, async ({ channelId }) => {
      if (await isSocketRateLimited(socket.id)) return;
      if (!channelId) return;

      try {
        socket.activeChannelId = channelId;
        await userRepository.update(userId, {
          'chatPreferences.activeWindowChannel': channelId,
        });
      } catch (err) {
        logger.debug('window:focus update failed', { userId, error: err?.message });
      }
    });

    socket.on(SOCKET_EVENTS.WINDOW_BLUR, async () => {
      if (await isSocketRateLimited(socket.id)) return;

      try {
        socket.activeChannelId = null;
        await userRepository.update(userId, {
          'chatPreferences.activeWindowChannel': null,
        });
      } catch (err) {
        logger.debug('window:blur update failed', { userId, error: err?.message });
      }
    });

    // ─── Notification Sync (multi-device) ────────────────────────────
    // When a notification is dismissed on one device, broadcast to all
    // other devices so they can also clear it.
    socket.on(SOCKET_EVENTS.NOTIFICATION_DISMISS, async ({ notificationId }) => {
      if (await isSocketRateLimited(socket.id)) return;
      if (!notificationId) return;

      try {
        // Broadcast to all other sockets of this user
        const personalRoom = buildRoomName(wsId, 'user', userId);
        socket.to(personalRoom).emit(SOCKET_EVENTS.NOTIFICATION_DISMISS, {
          notificationId,
        });
      } catch (err) {
        logger.debug('notification:dismiss broadcast failed', { userId, error: err?.message });
      }
    });

    // When a notification is read on one device, sync across all devices
    socket.on(SOCKET_EVENTS.NOTIFICATION_READ_SYNC, async ({ notificationId, channelId: readChannelId }) => {
      if (await isSocketRateLimited(socket.id)) return;

      try {
        const personalRoom = buildRoomName(wsId, 'user', userId);
        socket.to(personalRoom).emit(SOCKET_EVENTS.NOTIFICATION_READ_SYNC, {
          notificationId,
          channelId: readChannelId,
        });
      } catch (err) {
        logger.debug('notification:read:sync broadcast failed', { userId, error: err?.message });
      }
    });

    // ─── Real-Time Message Receipts (Delivery & Read) ────────────────
    socket.on(SOCKET_EVENTS.MESSAGE_DELIVERED, async ({ messageId, channelId }) => {
      if (await isSocketRateLimited(socket.id)) return;
      if (!messageId || !channelId) return;
      try {
        const { markAsDelivered } = await import('../modules/readReceipts/readReceipt.service.js');
        await markAsDelivered(messageId, channelId, userId, wsId);
      } catch (err) {
        logger.debug('message:delivered handling failed', { userId, messageId, error: err?.message });
      }
    });

    socket.on(SOCKET_EVENTS.MESSAGE_READ, async ({ messageId, channelId }) => {
      if (await isSocketRateLimited(socket.id)) return;
      if (!messageId || !channelId) return;
      try {
        const { markAsRead } = await import('../modules/readReceipts/readReceipt.service.js');
        await markAsRead(messageId, channelId, userId, wsId);
      } catch (err) {
        logger.debug('message:read handling failed', { userId, messageId, error: err?.message });
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
        let currentChannelIds = initialChannelIds;
        try {
          const { default: channelService } = await import('../modules/channels/channel.service.js');
          const currentChannels = await channelService.getChannelsForUser(userId, wsId);
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

  // Primary: emit to the workspace-scoped personal room (if available)
  if (room) {
    io.to(room).emit(event, data);
  } else {
    logger.warn('emitToUser: workspace-scoped room not resolved, using per-socket fallback', { userId, workspaceId });
  }

  // Fallback: ensure delivery to any connected sockets for this user
  // by iterating connected sockets and emitting directly to matching sockets.
  // This covers cases where workspaceId is missing or the user's active tab
  // is joined to a different workspace room.
  (async () => {
    try {
      const sockets = await io.fetchSockets();
      for (const sock of sockets) {
        const sockUserId = sock.chatUser?._id?.toString?.();
        if (sockUserId !== userId) continue;
        // Skip sockets that already received the emit via the room emit
        if (room && sock.rooms && sock.rooms.has(room)) continue;
        try {
          sock.emit(event, data);
        } catch (err) {
          // Best-effort per-socket emit — continue on error
        }
      }
    } catch (err) {
      logger.warn('emitToUser fallback socket iteration failed', { userId, error: err?.message });
    }
  })();
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
 * Get the approximate occupancy (number of sockets) in a resolved room.
 * Returns 0 if Socket.IO isn't initialized or the room doesn't exist.
 */
export function getRoomOccupancy(workspaceId, type, entityId) {
  try {
    const room = resolveScopedRoom(workspaceId, type, entityId, 'getRoomOccupancy');
    if (!room || !io) return 0;
    const s = io.sockets.adapter.rooms.get(room);
    return s ? s.size : 0;
  } catch (err) {
    logger.warn('getRoomOccupancy failed', { error: err.message, workspaceId, type, entityId });
    return 0;
  }
}

/**
 * Emit event to all connected clients.
 */
export function emitToAll(event, data) {
  if (!io) return;

  // In strict workspace mode, unscoped global emits are disallowed to
  // prevent accidental cross-workspace/tenant leaks. Fail-closed: no-op and log.
  if (env.SOCKET_REQUIRE_WORKSPACE) {
    logger.warn('Blocked emitToAll due to strict workspace mode', {
      metric: 'socket_workspace_guard',
      event: event,
    });
    return;
  }

  io.emit(event, data);
}

/**
 * Emit event to all sockets in a workspace room.
 * Used for broadcasting events to all members of a workspace.
 * @param {string} workspaceId
 * @param {string} event
 * @param {object} data
 */
export function emitToWorkspace(workspaceId, event, data) {
  if (!io || !workspaceId) return;
  const room = `ws:${workspaceId}:workspace`;
  io.to(room).emit(event, data);
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
 * Remove a specific user's sockets from a channel room.
 * Used when removing members from channels programmatically.
 * @param {string} userId
 * @param {string} channelId
 * @param {string} [workspaceId]
 */
export async function leaveChannelRoom(userId, channelId, workspaceId) {
  if (!io) return;
  try {
    const userRoom = resolveScopedRoom(workspaceId, 'user', userId, 'leaveChannelRoom.userRoom');
    const channelRoom = resolveScopedRoom(workspaceId, 'channel', channelId, 'leaveChannelRoom.channelRoom');
    if (!userRoom || !channelRoom) return;
    const socketList = await io.in(userRoom).fetchSockets();
    for (const socket of socketList) {
      socket.leave(channelRoom);
    }
  } catch (error) {
    logger.error('Failed to leave channel room programmatically', {
      userId,
      channelId,
      error: error.message,
    });
  }
}

/**
 * Remove every socket that is no longer an active member from a channel room.
 * Used when a formerly-public FlowTask channel becomes private.
 */
export async function reconcileChannelRoomAccess(channelId, workspaceId) {
  if (!io) return;
  try {
    const channelRoom = resolveScopedRoom(
      workspaceId,
      'channel',
      channelId,
      'reconcileChannelRoomAccess.channelRoom',
    );
    if (!channelRoom) return;
    const { default: ChannelMember } = await import(
      '../modules/channels/ChannelMember.model.js'
    );
    const allowedUserIds = new Set(await ChannelMember.getMemberIds(channelId));
    const sockets = await io.in(channelRoom).fetchSockets();
    for (const socket of sockets) {
      const userId = socket.chatUser?._id?.toString();
      if (userId && !allowedUserIds.has(userId)) {
        socket.leave(channelRoom);
        socket.emit(SOCKET_EVENTS.CHANNEL_REMOVED, { channelId });
      }
    }
  } catch (error) {
    logger.error('Failed to reconcile channel room access', {
      channelId,
      workspaceId,
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

  // Close Redis adapter clients (now managed globally, so just nullify references if any)
  adapterPubClient = null;
  adapterSubClient = null;

  logger.info('Socket resources cleaned up', {
    metric: 'socket_lifecycle',
    event: 'resources_cleaned',
  });
}

/**
 * Broadcast presence and custom status changes to all workspaces a user belongs to.
 * This ensures that when a user updates their status via the REST API, all connected
 * clients in the same workspaces instantly receive the PRESENCE_SYNC update.
 * @param {string} userId
 * @param {object} userObject The full or partial user object to sync
 */
export async function broadcastPresenceUpdate(userId, userObject) {
  if (!io) return;
  try {
    const { default: workspaceRepository } = await import('../modules/workspaces/workspace.repository.js');
    const workspaces = await workspaceRepository.getUserWorkspaces(userId);
    
    // Extract a minimal payload containing only the fields we want to sync for presence
    const payload = {
      _id: userId,
      onlineStatus: userObject.onlineStatus,
      customStatus: userObject.customStatus,
      lastSeenAt: userObject.lastSeenAt,
    };
    
    for (const ws of workspaces) {
      const wsId = ws.workspaceId?._id?.toString() || ws.workspaceId?.toString();
      if (wsId) {
        const room = `ws:${wsId}:workspace`;
        io.to(room).emit(SOCKET_EVENTS.PRESENCE_SYNC, { users: [payload] });
      }
    }
  } catch (error) {
    logger.error('Failed to broadcast presence update', { userId, error: error.message });
  }
}

/**
 * Broadcast user preference updates (like DND) to the user's personal socket room.
 * This ensures multi-device synchronization (e.g. mobile <-> web) for the same user.
 * @param {string} userId
 * @param {object} chatPreferences
 */
export async function broadcastUserPreferences(userId, chatPreferences) {
  if (!io) return;
  try {
    const { default: workspaceRepository } = await import('../modules/workspaces/workspace.repository.js');
    const workspaces = await workspaceRepository.getUserWorkspaces(userId);
    
    for (const ws of workspaces) {
      const wsId = ws.workspaceId?._id?.toString() || ws.workspaceId?.toString();
      if (wsId) {
        const userRoom = buildRoomName(wsId, 'user', userId);
        io.to(userRoom).emit('user:preferences_updated', { chatPreferences });
      }
    }
  } catch (error) {
    logger.error('Failed to broadcast preferences update', { userId, error: error.message });
  }
}
