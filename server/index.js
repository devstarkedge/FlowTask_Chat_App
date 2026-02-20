import http from 'node:http';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import env from './config/environment.js';
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from './config/database.js';
import logger from './utils/logger.js';
import { errorHandler, NotFoundError } from './middleware/errorHandler.js';
import { initializeSocket, getConnectionCount } from './sockets/socketManager.js';

// ─── Route Imports ───────────────────────────────────────────────────────────
import authRoutes from './modules/auth/auth.routes.js';
import channelRoutes from './modules/channels/channel.routes.js';
import messageRoutes, { channelMessageRouter } from './modules/messages/message.routes.js';
import threadRoutes, { channelThreadRouter } from './modules/threads/thread.routes.js';
import readReceiptRoutes, { channelReadRouter } from './modules/readReceipts/readReceipt.routes.js';
import webhookRoutes from './modules/webhooks/webhook.routes.js';
import botRoutes from './modules/bot/bot.routes.js';
import { registerAllEventHandlers } from './modules/webhooks/registerHandlers.js';
import channelService from './modules/channels/channel.service.js';
import { startDeadlineWarningCron, stopDeadlineWarningCron } from './modules/bot/deadlineWarning.js';

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
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
  const dbConnected = isDatabaseConnected();
  const status = dbConnected ? 'ok' : 'degraded';

  res.status(dbConnected ? 200 : 503).json({
    status,
    service: 'flowtask-chat',
    uptime: Math.floor(process.uptime()),
    connections: getConnectionCount(),
    database: dbConnected ? 'connected' : 'disconnected',
    memory: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/chat/auth', authRoutes);
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

    // 4. Bootstrap system channels
    await channelService.bootstrapSystemChannels();

    // 5. Start deadline warning cron
    startDeadlineWarningCron();

    // 6. Start HTTP server
    httpServer.listen(env.PORT, () => {
      logger.info(`💬 FlowTask Chat server running`, {
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

  // Stop accepting new connections
  httpServer.close(async () => {
    logger.info('HTTP server closed');

    try {
      stopDeadlineWarningCron();
      await disconnectDatabase();
      logger.info('Database disconnected');
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
