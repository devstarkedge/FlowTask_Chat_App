import http from 'node:http';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import env from './config/environment.js';
import { CORS_ALLOWED_HEADERS } from './config/constants.js';
import { connectDatabase, disconnectDatabase, isDatabaseConnected, getDatabaseHealth, stopHealthCheck } from './config/database.js';
import logger from './utils/logger.js';
import { errorHandler, NotFoundError } from './middleware/errorHandler.js';
import { initializeSocket, getConnectionCount, cleanupSocketResources } from './sockets/socketManager.js';

// ─── Route Imports ───────────────────────────────────────────────────────────
import authRoutes from './modules/auth/auth.routes.js';
import channelRoutes from './modules/channels/channel.routes.js';
import messageRoutes, { channelMessageRouter } from './modules/messages/message.routes.js';
import threadRoutes, { channelThreadRouter } from './modules/threads/thread.routes.js';
import readReceiptRoutes from './modules/readReceipts/readReceipt.routes.js';
import webhookRoutes from './modules/webhooks/webhook.routes.js';
import botRoutes from './modules/bot/bot.routes.js';
import userRoutes from './modules/users/user.routes.js';
import workspaceRoutes from './modules/workspaces/workspace.routes.js';
import notificationRoutes from './modules/notifications/notification.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import directoriesRoutes from './modules/directories/directories.routes.js';
import draftRoutes from './modules/drafts/draft.routes.js';
import searchRoutes from './modules/search/search.routes.js';
import debugRoutes from './modules/debug/debug.routes.js';
import pushRoutes from './modules/push/push.routes.js';
import favoritesRoutes from './modules/favorites/favorites.routes.js';
import gifsRoutes from './modules/gifs/gifs.routes.js';
import categoryRoutes from './modules/categories/category.routes.js';

import { registerAllEventHandlers } from './modules/webhooks/registerHandlers.js';
import { registerFileUploadEventHandlers } from './services/fileUploadEvents.service.js';

import eventBus from './services/eventBus.js';
import { startDeadlineWarningCron, stopDeadlineWarningCron } from './modules/bot/deadlineWarning.js';
import { startDNDScheduler, stopDNDScheduler } from './services/dndScheduler.service.js';
import fileCleanupService from './services/fileCleanup.service.js';
import fileUploadService from './services/fileUpload.service.js';
import webhookRetryService from './services/webhookRetry.service.js';
import cache from './services/cache.service.js';
import accountDeletionService from './services/accountDeletion.service.js';
import canvasRoutes from './modules/canvas/canvas.routes.js';
import { startCanvasCollaborationServer, stopCanvasCollaborationServer } from './modules/canvas/canvasCollaboration.server.js';
import projectChannelSyncService from './modules/flowtask/projectChannelSync.service.js';

// ─── Express App ─────────────────────────────────────────────────────────────
const app = express();
const httpServer = http.createServer(app);

// ─── Trust Proxy (required behind nginx / load balancers) ────────────────────
if (env.TRUST_PROXY) {
  app.set('trust proxy', env.TRUST_PROXY);
}

// ─── CORS ────────────────────────────────────────────────────────────────────
if (env.IS_PRODUCTION && !process.env.CORS_ORIGINS) {
  logger.error('CORS_ORIGINS must be explicitly set in production');
  process.exit(1);
}

// CORS_ORIGINS is always an array now (parseCorsOrigins always returns []).
// Log at startup so you can verify the value in Render logs.
const effectiveOrigins = Array.isArray(env.CORS_ORIGINS)
  ? env.CORS_ORIGINS
  : [env.CORS_ORIGINS];
logger.info('CORS: effective allowed origins', { origins: effectiveOrigins });

const corsOptions = {
  // Function-based origin: logs every rejection so you can see the exact
  // mismatch in Render logs  →  Dashboard → Chat Backend → Logs
  origin: (incomingOrigin, callback) => {
    // Allow same-origin / server-to-server requests (no Origin header)
    if (!incomingOrigin) return callback(null, true);
    // Normalise the incoming origin exactly as we do our config (no trailing slash)
    const normalized = incomingOrigin.replace(/\/+$/, '');
    if (
      effectiveOrigins.includes(normalized) ||
      normalized.startsWith('exp://') ||
      normalized.includes('localhost') ||
      normalized.includes('127.0.0.1') ||
      /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}/.test(normalized) ||
      /^http:\/\/172\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(normalized) ||
      /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(normalized)
    ) {
      callback(null, true);
    } else {
      logger.warn('CORS: blocked request from unlisted origin', {
        incomingOrigin,
        normalizedOrigin: normalized,
        effectiveOrigins,
        action: `Add "${normalized}" to CORS_ORIGINS in Render → Chat Backend → Environment, then redeploy`,
      });
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: CORS_ALLOWED_HEADERS,
  exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Has-More'],
  maxAge: 86400,
};

// ─── Global Middleware ───────────────────────────────────────────────────────
// CORS must be applied before Helmet and all routes — including an explicit
// handler for OPTIONS preflight so browsers get the CORS headers back
// even when the actual endpoint hasn't been reached yet.
// Handle OPTIONS preflight explicitly to avoid path-to-regexp parsing
// issues when using wildcard route strings like '*' or '/*'. We invoke
// the `cors` middleware directly for OPTIONS requests without registering
// a route string so the router doesn't parse the path pattern.
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return cors(corsOptions)(req, res, next);
  }
  next();
});
app.use(cors(corsOptions));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'wss:', 'ws:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow loading external images
}));
app.use(compression());

// ─── Request ID Middleware (cross-service log correlation) ───────────────────
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

// Parse JSON with raw body capture for webhook verification
app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      // Store raw body for HMAC webhook signature verification
      if (req.originalUrl.includes('/webhooks')) {
        req.rawBody = buf;
      }
    },
  }),
);

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// HTTP request logging
if (env.NODE_ENV !== 'test') {
  app.use(
    morgan('short', {
      stream: { write: (msg) => logger.http(msg.trim()) },
    }),
  );
}

// Request timing — logs slow API requests (>1s)
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    if (durationMs > 1000) {
      logger.warn('Slow request', {
        metric: 'slow_request',
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs),
        userId: req.user?._id?.toString(),
        requestId: req.requestId,
      });
    }
  });
  next();
});

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/api/chat/health', (_req, res) => {
  const dbHealth = getDatabaseHealth();
  const cacheStatus = cache.getStatus();
  const allHealthy = dbHealth.connected;
  const status = allHealthy ? 'ok' : 'degraded';
  const memUsage = process.memoryUsage();

  res.status(allHealthy ? 200 : 503).json({
    status,
    service: 'TaskChat',
    uptime: Math.floor(process.uptime()),
    connections: getConnectionCount(),
    database: dbHealth,
    cache: cacheStatus,
    eventBus: eventBus.getStatus(),
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
    },
    timestamp: new Date().toISOString(),
  });
});
// ─── Debug Env Check ────────────────────────────────────────────────────────────────
// Returns non-sensitive config for deployment verification.
// Gated by X-Debug-Token header matching DEBUG_TOKEN env var.
// Usage: curl -H "X-Debug-Token: <your-token>" https://TaskChat-app.onrender.com/api/chat/debug/env
app.get('/api/chat/debug/env', (req, res) => {
  const debugToken = process.env.DEBUG_TOKEN;
  if (debugToken && req.headers['x-debug-token'] !== debugToken) {
    return res.status(401).json({ error: 'Unauthorized. Provide X-Debug-Token header.' });
  }

  const maskSecret = (v) => (v ? `${v.slice(0, 4)}****` : 'MISSING');

  res.json({
    service: 'TaskChat',
    node_env: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    config: {
      BASE_URL: env.BASE_URL || '(not set)',
      CLIENT_URL: env.CLIENT_URL || '(not set)',
      PORT: env.PORT,
      FLOWTASK_ENABLED: env.FLOWTASK_ENABLED,
      FLOWTASK_API_URL: env.FLOWTASK_API_URL || '(not set)',
      CORS_ORIGINS: effectiveOrigins,
      LOG_LEVEL: env.LOG_LEVEL,
    },
    secrets: {
      MONGO_URI: process.env.MONGO_URI ? 'set' : 'MISSING',
      JWT_SECRET: maskSecret(process.env.JWT_SECRET),
      JWT_REFRESH_SECRET: maskSecret(process.env.JWT_REFRESH_SECRET),
      FLOWTASK_JWT_SECRET: maskSecret(process.env.FLOWTASK_JWT_SECRET),
      FLOWTASK_WEBHOOK_SECRET: process.env.FLOWTASK_WEBHOOK_SECRET ? 'set' : 'MISSING',
    },
  });
});
// ─── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/chat/auth', authRoutes);
app.use('/api/chat/workspaces', workspaceRoutes);
app.use('/api/chat/channels', channelRoutes);
app.use('/api/chat/channels/:channelId', channelMessageRouter);
app.use('/api/chat/channels/:channelId', channelThreadRouter);
app.use('/api/chat/messages', messageRoutes);
app.use('/api/chat/threads', threadRoutes);
if (env.FLOWTASK_ENABLED) {
  app.use('/api/chat/webhooks', webhookRoutes);
}
app.use('/api/chat/bot', botRoutes);
app.use('/api/chat/users', userRoutes);
app.use('/api/chat/notifications', notificationRoutes);
app.use('/api/chat/admin', adminRoutes);
app.use('/api/chat/directories', directoriesRoutes);
app.use('/api/chat/drafts', draftRoutes);
app.use('/api/chat/search', searchRoutes);
app.use('/api/chat/categories', categoryRoutes);

// Mount read receipt routes
app.use('/api/chat', readReceiptRoutes);
// Debug routes (local dev only)
app.use('/api/chat/debug', debugRoutes);
// Push subscription management
app.use('/api/chat/push', pushRoutes);
app.use('/api/chat/favorites', favoritesRoutes);
app.use('/api/chat/gifs', gifsRoutes);

// ─── Static File Serving (Uploads) ───────────────────────────────────────────
app.use('/api/chat/uploads', express.static(path.resolve(env.UPLOAD_DIR), {
  maxAge: '7d',
  immutable: true,
  setHeaders: (res, filePath) => {
    // Serve all uploaded files as attachment to prevent XSS via HTML/SVG
    const ext = path.extname(filePath).toLowerCase();
    if (['.html', '.htm', '.svg', '.xml'].includes(ext)) {
      res.setHeader('Content-Disposition', 'attachment');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));

app.use("/api/chat/canvas", canvasRoutes);

// ─── 404 Catch-All ───────────────────────────────────────────────────────────
// Use `app.use` with a mounted path to avoid path-to-regexp parsing errors
// for wildcard route strings like '/api/chat/*'. This middleware runs after
// all route registrations and returns a NotFoundError for unmatched
// `/api/chat` requests.
app.use('/api/chat', (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
});

// ─── Error Handler ───────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ────────────────────────────────────────────────────────────
let memoryMonitorTimer = null;

async function startServer() {
  try {
    // 1. Connect to MongoDB
    await connectDatabase();

    // 1b. Initialize Cache Service (loads Redis if configured)
    const { default: redisManager } = await import('./config/redisManager.js');
    await redisManager.init();

    await cache.initialize();

    // 1c. Initialize BullMQ queues AFTER Redis is ready
    await import('./services/notificationQueue.service.js');
    const { initQueues } = await import('./services/jobQueue.service.js');
    await initQueues();

    // 2. Register webhook event handlers (only when FlowTask is enabled)
    if (env.FLOWTASK_ENABLED) {
      registerAllEventHandlers();
    }

    // 2b. Sync media messages when async uploads complete
    registerFileUploadEventHandlers();

    // 3. Initialize Socket.IO
    await initializeSocket(httpServer, corsOptions);
    if (env.FLOWTASK_ENABLED) {
      projectChannelSyncService.startRecovery();
    }

    // 3b. Start Canvas CRDT collaboration server
    await startCanvasCollaborationServer();

    // 4/5. No default/global workspace is bootstrapped here anymore — every
    // workspace is created dynamically (FlowTask SSO or ChatApp-native
    // creation), and each one gets its own system channels bootstrapped at
    // creation time (see workspace.service.js#_createDefaultChannels).
    //
    // Reconcile Workspace's indexes with the current schema on every boot.
    // Removing an index from a Mongoose schema file does NOT drop it from
    // an already-existing MongoDB deployment — that requires an explicit
    // syncIndexes() call. The old partial-unique index on {source:1}
    // (pre-multi-tenant: "at most one active source:'flowtask' workspace,
    // ever") was previously only dropped by the one-time
    // scripts/migrateChatWorkspaceMapping.js migration — if that was never
    // run against a given deployment, every second FlowTask-linked
    // workspace creation fails with a raw duplicate-key error on `source`
    // that looks unrelated to slug/mapping collisions. Doing this at every
    // boot instead of relying on a manually-run script means new
    // deployments (and ones that missed the migration) self-heal
    // automatically. Non-fatal — an index-sync failure must never prevent
    // the server from starting.
    try {
      const { default: Workspace } = await import('./modules/workspaces/Workspace.model.js');
      const indexChanges = await Workspace.syncIndexes();
      logger.info('Workspace indexes synced', { indexChanges });
    } catch (err) {
      logger.error('Failed to sync Workspace indexes at boot — continuing startup', { error: err.message });
    }

    // 6. Start deadline warning cron
    startDeadlineWarningCron();

    // 7. Start file cleanup service
    fileCleanupService.init();

    // 7a. Start account deletion service
    accountDeletionService.init();

    // 7b. Recover uploads that were interrupted by last shutdown
    await fileUploadService.recoverStuckUploads();

    // 7c. Start webhook retry service (dead letter queue)
    if (env.FLOWTASK_ENABLED) {
      webhookRetryService.start();
    }

    // 7d. Start DND scheduler (clears expired manual DND and applies recurring schedules)
    startDNDScheduler();

    // 8. Start memory usage monitor
    memoryMonitorTimer = setInterval(() => {
      const mem = process.memoryUsage();
      const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
      const rssMB = Math.round(mem.rss / 1024 / 1024);

      if (heapUsedMB > 400 || rssMB > 512) {
        logger.warn('High memory usage detected', {
          metric: 'memory_warning',
          heapUsedMB,
          rssMB,
          heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
          externalMB: Math.round(mem.external / 1024 / 1024),
        });
      }
    }, 60000); // Check every 60s

    // 8b. Start scheduled message processor
    const { startScheduledMessageProcessor } = await import('./services/scheduledMessages.service.js');
    startScheduledMessageProcessor();

    // 8c. Start saved reminder checker (in-app reminders / Later feature)
    try {
      const { startSavedReminderChecker } = await import('./services/savedReminderChecker.js');
      startSavedReminderChecker();
    } catch (err) {
      logger.warn('Failed to start saved reminder checker', { error: err?.message || err });
    }

    // 9. Start HTTP server
    httpServer.listen(env.PORT, () => {
      logger.info(`FlowTask Chat server running`, {
        port: env.PORT,
        env: env.NODE_ENV,
        clientUrl: env.CLIENT_URL,
        flowtaskEnabled: env.FLOWTASK_ENABLED,
        flowtaskApi: env.FLOWTASK_ENABLED ? env.FLOWTASK_API_URL : 'disabled',
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  projectChannelSyncService.stopRecovery();

  // 1. Stop memory monitor
  if (memoryMonitorTimer) {
    clearInterval(memoryMonitorTimer);
    memoryMonitorTimer = null;
  }

  // 2. Close Socket.IO first (clean disconnect for clients)
  const { getIO } = await import('./sockets/socketManager.js');
  try {
    await stopCanvasCollaborationServer();
    const io = getIO();
    if (io) {
      io.close();
      logger.info('Socket.IO server closed');
    }
    // Clean up socket-related intervals
    cleanupSocketResources();
  } catch {
    // Socket may not be initialized
  }

  // 2b. Stop queue workers before closing the Redis connections they use.
  try {
    const { shutdownQueues } = await import('./services/jobQueue.service.js');
    await shutdownQueues();
    logger.info('Job queues closed');
  } catch (err) {
    logger.error('Error closing job queues', { error: err.message });
  }

  // 2c. Close global Redis clients using the unified manager
  try {
    const { default: redisManager } = await import('./config/redisManager.js');
    await redisManager.closeAll();
  } catch (err) {
    logger.warn('Failed to cleanly close redisManager', { error: err.message });
  }

  // 3. Stop cron jobs
  stopDeadlineWarningCron();
  stopDNDScheduler();
  accountDeletionService.stop();

  // 3b. Stop webhook retry service
  if (env.FLOWTASK_ENABLED) {
    webhookRetryService.stop();
  }

  // 3c. Stop scheduled message processor
  try {
    const { stopScheduledMessageProcessor } = await import('./services/scheduledMessages.service.js');
    stopScheduledMessageProcessor();
    logger.info('Scheduled message processor stopped');
  } catch {
    // May not be initialized
  }

  // Stop saved reminder checker
  try {
    const { stopSavedReminderChecker } = await import('./services/savedReminderChecker.js');
    stopSavedReminderChecker();
    logger.info('Saved reminder checker stopped');
  } catch {
    // Not initialized or failed to stop
  }

  // 4. Stop DB health check
  stopHealthCheck();

  // 5. Stop accepting new connections, wait for in-flight to drain
  httpServer.close(async () => {
    logger.info('HTTP server closed');

    try {
      await disconnectDatabase();
      logger.info('Graceful shutdown complete');
    } catch (error) {
      logger.error('Error during database disconnect', { error: error.message });
    }

    process.exit(0);
  });

  // Force shutdown after 10s
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Nodemon graceful restart
process.once('SIGUSR2', async () => {
  await shutdown('SIGUSR2');
  process.kill(process.pid, 'SIGUSR2');
});

// Unhandled rejections / uncaught exceptions
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason: reason?.message || reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

startServer();

export default app;
