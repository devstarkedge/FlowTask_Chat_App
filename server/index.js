import http from 'node:http';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import env from './config/environment.js';
import { connectDatabase, disconnectDatabase, isDatabaseConnected, getDatabaseHealth, stopHealthCheck } from './config/database.js';
import logger from './utils/logger.js';
import { errorHandler, NotFoundError } from './middleware/errorHandler.js';
import { initializeSocket, getConnectionCount, cleanupSocketResources } from './sockets/socketManager.js';

// ─── Route Imports ───────────────────────────────────────────────────────────
import authRoutes from './modules/auth/auth.routes.js';
import channelRoutes from './modules/channels/channel.routes.js';
import messageRoutes, { channelMessageRouter } from './modules/messages/message.routes.js';
import threadRoutes, { channelThreadRouter } from './modules/threads/thread.routes.js';
import readReceiptRoutes, { channelReadRouter } from './modules/readReceipts/readReceipt.routes.js';
import webhookRoutes from './modules/webhooks/webhook.routes.js';
import botRoutes from './modules/bot/bot.routes.js';
import userRoutes from './modules/users/user.routes.js';
import workspaceRoutes from './modules/workspaces/workspace.routes.js';
import notificationRoutes from './modules/notifications/notification.routes.js';
import { registerAllEventHandlers } from './modules/webhooks/registerHandlers.js';
import eventBus from './services/eventBus.js';
import channelService from './modules/channels/channel.service.js';
import workspaceService from './modules/workspaces/workspace.service.js';
import { startDeadlineWarningCron, stopDeadlineWarningCron } from './modules/bot/deadlineWarning.js';
import fileCleanupService from './services/fileCleanup.service.js';
import fileUploadService from './services/fileUpload.service.js';
import webhookRetryService from './services/webhookRetry.service.js';

// ─── Express App ─────────────────────────────────────────────────────────────
const app = express();
const httpServer = http.createServer(app);

// ─── Trust Proxy (required behind nginx / load balancers) ────────────────────
if (env.TRUST_PROXY) {
  app.set('trust proxy', env.TRUST_PROXY);
}

// ─── CORS ────────────────────────────────────────────────────────────────────
const corsOptions = {
  origin: env.CORS_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Workspace-Id'],
  exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Has-More'],
  maxAge: 86400,
};

// ─── Global Middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors(corsOptions));
app.use(compression());

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

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/api/chat/health', (_req, res) => {
  const dbHealth = getDatabaseHealth();
  const status = dbHealth.connected ? 'ok' : 'degraded';
  const memUsage = process.memoryUsage();

  res.status(dbHealth.connected ? 200 : 503).json({
    status,
    service: 'flowtask-chat',
    uptime: Math.floor(process.uptime()),
    connections: getConnectionCount(),
    database: dbHealth,
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

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/chat/auth', authRoutes);
app.use('/api/chat/workspaces', workspaceRoutes);
app.use('/api/chat/channels', channelRoutes);
app.use('/api/chat/channels/:channelId', channelMessageRouter);
app.use('/api/chat/channels/:channelId', channelThreadRouter);
app.use('/api/chat/channels/:channelId', channelReadRouter);
app.use('/api/chat/messages', messageRoutes);
app.use('/api/chat/threads', threadRoutes);
if (env.FLOWTASK_ENABLED) {
  app.use('/api/chat/webhooks', webhookRoutes);
}
app.use('/api/chat/bot', botRoutes);
app.use('/api/chat/users', userRoutes);
app.use('/api/chat/notifications', notificationRoutes);
app.use('/api/chat', readReceiptRoutes);

// ─── Static File Serving (Uploads) ───────────────────────────────────────────
app.use('/api/chat/uploads', express.static(path.resolve(env.UPLOAD_DIR), {
  maxAge: '7d',
  immutable: true,
}));

// ─── 404 Catch-All ───────────────────────────────────────────────────────────
app.all('/api/chat/*', (req, _res, next) => {
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

    // 2. Register webhook event handlers (only when FlowTask is enabled)
    if (env.FLOWTASK_ENABLED) {
      registerAllEventHandlers();
    }

    // 3. Initialize Socket.IO
    await initializeSocket(httpServer, corsOptions);

    // 4. Ensure default workspace exists
    const defaultWorkspace = await workspaceService.ensureDefaultWorkspace();
    logger.info('Default workspace ready', { workspaceId: defaultWorkspace._id, slug: defaultWorkspace.slug });

    // 5. Bootstrap system channels (for default workspace)
    await channelService.bootstrapSystemChannels(defaultWorkspace._id.toString());

    // 6. Start deadline warning cron
    startDeadlineWarningCron();

    // 7. Start file cleanup service
    fileCleanupService.init();

    // 7b. Recover uploads that were interrupted by last shutdown
    await fileUploadService.recoverStuckUploads();

    // 7c. Start webhook retry service (dead letter queue)
    if (env.FLOWTASK_ENABLED) {
      webhookRetryService.start();
    }

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

    // 9. Start HTTP server
    httpServer.listen(env.PORT, () => {
      logger.info(`FlowTask Chat server running`, {
        port: env.PORT,
        env: env.NODE_ENV,
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

  // 1. Stop memory monitor
  if (memoryMonitorTimer) {
    clearInterval(memoryMonitorTimer);
    memoryMonitorTimer = null;
  }

  // 2. Close Socket.IO first (clean disconnect for clients)
  const { getIO } = await import('./sockets/socketManager.js');
  try {
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

  // 3. Stop cron jobs
  stopDeadlineWarningCron();

  // 3b. Stop webhook retry service
  webhookRetryService.stop();

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
