import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import env from './environment.js';

/**
 * Enterprise MongoDB Connection Manager.
 *
 * Features:
 *   - Auto-reconnect with exponential backoff (1s → 30s cap)
 *   - Connection health monitoring via periodic ping
 *   - Pool warm-up with minPoolSize
 *   - Graceful shutdown with drain support
 *   - Structured lifecycle logging for observability
 *   - Query timeout safeguards via global plugin
 *
 * Recovery behavior:
 *   On initial connect failure: retries 5 times with backoff, then exits.
 *   On runtime disconnect: retries indefinitely with capped backoff.
 *   On health-check failure: triggers proactive reconnect.
 */

// ─── Connection Options ──────────────────────────────────────────────────────
const MONGOOSE_OPTIONS = {
  maxPoolSize: 20,                   // Reduced from 100 to prevent Atlas 500 connection limit spikes
  minPoolSize: 2,                    // Reduced from 5 to prevent aggressive cold-start connection hoarding
  maxIdleTimeMS: 30000,              // CRITICAL: Drops idle connections after 30 seconds
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  heartbeatFrequencyMS: 10000,       // Detect stale connections faster (default 30s)
  autoIndex: !env.IS_PRODUCTION,
};

// ─── Reconnection Config ─────────────────────────────────────────────────────
const RECONNECT = {
  INITIAL_MAX_RETRIES: 5,            // Changed back to 5 as requested
  RUNTIME_MAX_RETRIES: Infinity,     // Never give up on runtime disconnects
  BASE_DELAY_MS: 1000,               // 1 second
  MAX_DELAY_MS: 30000,               // 30 second cap
  BACKOFF_FACTOR: 2,
};

// ─── Health Check Config ─────────────────────────────────────────────────────
const HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds

// ─── State ───────────────────────────────────────────────────────────────────
let isConnected = false;
let isReconnecting = false;
let isShuttingDown = false;

// Global caching for connection reuse across module reloads
let globalCache = global.mongooseCache;
if (!globalCache) {
  globalCache = global.mongooseCache = { conn: null, promise: null };
}

let healthCheckTimer = null;
let reconnectAttempt = 0;
let lastPingMs = -1;
let pingHistory = [];              // Last 10 ping durations for avg calculation
const PING_HISTORY_MAX = 10;

// ─── Query Timeout Plugin ────────────────────────────────────────────────────
/**
 * Global Mongoose plugin: sets maxTimeMS on all queries to prevent
 * unbounded query execution. Queries exceeding this will throw a
 * MongoServerError with codeName 'MaxTimeMSExpired'.
 */
function queryTimeoutPlugin(schema) {
  const MAX_QUERY_TIME_MS = 10000; // 10 seconds

  // Apply to query operations
  const queryHooks = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete',
    'countDocuments', 'estimatedDocumentCount', 'distinct', 'updateOne',
    'updateMany', 'deleteOne', 'deleteMany'];

  for (const method of queryHooks) {
    schema.pre(method, function () {
      if (!this.getOptions().maxTimeMS) {
        this.maxTimeMS(MAX_QUERY_TIME_MS);
      }
    });
  }

  // Apply to aggregation pipeline
  schema.pre('aggregate', function () {
    if (!this.options.maxTimeMS) {
      this.options.maxTimeMS = MAX_QUERY_TIME_MS;
    }
  });
}

// ─── Slow Query Monitoring Plugin ────────────────────────────────────────────
/**
 * Logs queries that exceed 500ms threshold. Uses post hooks to measure
 * actual execution time. Integrates with performanceLogger.
 */
function slowQueryPlugin(schema) {
  const SLOW_THRESHOLD_MS = 500;

  const queryTypes = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete',
    'countDocuments', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany'];

  for (const method of queryTypes) {
    schema.pre(method, function () {
      this._startTime = performance.now();
    });

    schema.post(method, function () {
      if (this._startTime) {
        const durationMs = Math.round(performance.now() - this._startTime);
        if (durationMs > SLOW_THRESHOLD_MS) {
          logger.warn('Slow query detected', {
            metric: 'slow_query',
            collection: this.mongooseCollection?.name || 'unknown',
            operation: method,
            durationMs,
            threshold: SLOW_THRESHOLD_MS,
            filter: JSON.stringify(this.getFilter?.() || {}),
          });
        }
      }
    });
  }

  // Aggregate timing
  schema.pre('aggregate', function () {
    this._startTime = performance.now();
  });

  schema.post('aggregate', function () {
    if (this._startTime) {
      const durationMs = Math.round(performance.now() - this._startTime);
      if (durationMs > SLOW_THRESHOLD_MS) {
        logger.warn('Slow aggregation detected', {
          metric: 'slow_query',
          operation: 'aggregate',
          durationMs,
          threshold: SLOW_THRESHOLD_MS,
        });
      }
    }
  });
}

// ─── Register Global Plugins ─────────────────────────────────────────────────
mongoose.plugin(queryTimeoutPlugin);
mongoose.plugin(slowQueryPlugin);

// ─── Reconnection Logic ─────────────────────────────────────────────────────
/**
 * Reconnect with capped exponential backoff.
 * @param {'initial' | 'runtime'} mode
 */
async function reconnectWithBackoff(mode = 'runtime') {
  if (isReconnecting || isShuttingDown) return;
  isReconnecting = true;

  const maxRetries = mode === 'initial'
    ? RECONNECT.INITIAL_MAX_RETRIES
    : RECONNECT.RUNTIME_MAX_RETRIES;

  reconnectAttempt = 0;

  while (reconnectAttempt < maxRetries && !isShuttingDown) {
    reconnectAttempt++;

    const delay = Math.min(
      RECONNECT.BASE_DELAY_MS * Math.pow(RECONNECT.BACKOFF_FACTOR, reconnectAttempt - 1),
      RECONNECT.MAX_DELAY_MS,
    );

    logger.info('MongoDB reconnection attempt', {
      metric: 'db_reconnect',
      attempt: reconnectAttempt,
      maxRetries: maxRetries === Infinity ? 'unlimited' : maxRetries,
      delayMs: delay,
      mode,
    });

    await new Promise((resolve) => setTimeout(resolve, delay));

    if (isShuttingDown) break;

    try {
      if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
        isConnected = true;
        isReconnecting = false;
        return;
      }
      
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }

      const conn = await mongoose.connect(env.MONGO_URI, MONGOOSE_OPTIONS);
      globalCache.conn = conn;

      isConnected = true;
      isReconnecting = false;
      reconnectAttempt = 0;

      logger.info('MongoDB reconnected successfully', {
        metric: 'db_lifecycle',
        event: 'reconnected',
        attempts: reconnectAttempt,
      });

      startHealthCheck();
      return;
    } catch (error) {
      console.log('--- DATABASE CONNECTION FAILURE ---');
      console.error("--- MONGODB DRIVER ERROR OBJECT ---");
      console.error("error:", error);
      console.error("error.name:", error.name);
      console.error("error.message:", error.message);
      console.error("error.code:", error.code);
      console.error("error.reason:", error.reason);
      console.error("error.cause:", error.cause);
      console.error("error.stack:", error.stack);

      if (error.reason && error.reason.servers) {
        for (const [address, server] of error.reason.servers.entries()) {
          if (server.error) {
            console.error(`\n--- DEEP INSPECTION FOR: ${address} ---`);
            console.error("server.error.name:", server.error.name);
            console.error("server.error.message:", server.error.message);
            console.error("server.error.code:", server.error.code);
            console.error("server.error.cause:", server.error.cause);
            console.error("server.error.stack:", server.error.stack);
          }
        }
      }

      logger.error('MongoDB reconnection failed', {
        metric: 'db_reconnect',
        attempt: reconnectAttempt,
        error: error.message,
        nextRetryMs: Math.min(
          RECONNECT.BASE_DELAY_MS * Math.pow(RECONNECT.BACKOFF_FACTOR, reconnectAttempt),
          RECONNECT.MAX_DELAY_MS,
        ),
      });
    }
  }

  isReconnecting = false;

  if (mode === 'initial') {
    logger.error('MongoDB initial connection failed after max retries.', {
      metric: 'db_lifecycle',
      event: 'connection_failed',
      attempts: reconnectAttempt,
    });
    // Removed process.exit(1) to prevent Render container from crash-looping
  }
}

// ─── Health Check ────────────────────────────────────────────────────────────
/**
 * Periodic DB ping to detect silent connection loss.
 * Triggers reconnection if ping fails while isConnected is true.
 */
function startHealthCheck() {
  stopHealthCheck();

  healthCheckTimer = setInterval(async () => {
    if (!isConnected || isShuttingDown || isReconnecting) return;

    try {
      const start = performance.now();
      await mongoose.connection.db.admin().ping();
      lastPingMs = Math.round(performance.now() - start);

      pingHistory.push(lastPingMs);
      if (pingHistory.length > PING_HISTORY_MAX) pingHistory.shift();

      if (lastPingMs > 1000) {
        logger.warn('Database ping latency high', {
          metric: 'db_health',
          pingMs: lastPingMs,
        });
      }
    } catch (error) {
      logger.error('Database health check failed', {
        metric: 'db_health',
        error: error.message,
      });

      if (isConnected && !isReconnecting) {
        isConnected = false;
        reconnectWithBackoff('runtime');
      }
    }
  }, HEALTH_CHECK_INTERVAL_MS);
}

function stopHealthCheck() {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Connect to MongoDB with retry logic and lifecycle monitoring.
 */
export async function connectDatabase() {
  if (globalCache.conn) {
    isConnected = true;
    logger.info('MongoDB Reusing Existing Connection', {
      metric: 'db_lifecycle',
      event: 'reusing_connection',
      poolSize: MONGOOSE_OPTIONS.maxPoolSize,
    });
    return globalCache.conn;
  }
  if (isConnected) return;

  try {
    const startTime = performance.now();
    const conn = await mongoose.connect(env.MONGO_URI, MONGOOSE_OPTIONS);
    globalCache.conn = conn;
    isConnected = true;

    const durationMs = Math.round(performance.now() - startTime);
    logger.info('MongoDB Connected', {
      metric: 'db_lifecycle',
      event: 'connected',
      host: conn.connection.host,
      database: conn.connection.name,
      durationMs,
      poolSize: MONGOOSE_OPTIONS.maxPoolSize,
      minPoolSize: MONGOOSE_OPTIONS.minPoolSize,
      maxIdleTimeMS: MONGOOSE_OPTIONS.maxIdleTimeMS,
      activeConnections: conn.connection.base.connections.length,
    });
  } catch (error) {
    console.log('--- DATABASE CONNECTION FAILURE ---');
    console.error("--- MONGODB DRIVER ERROR OBJECT ---");
    console.error("error:", error);
    console.error("error.name:", error.name);
    console.error("error.message:", error.message);
    console.error("error.code:", error.code);
    console.error("error.reason:", error.reason);
    console.error("error.cause:", error.cause);
    console.error("error.stack:", error.stack);

    if (error.reason && error.reason.servers) {
      for (const [address, server] of error.reason.servers.entries()) {
        if (server.error) {
          console.error(`\n--- DEEP INSPECTION FOR: ${address} ---`);
          console.error("server.error.name:", server.error.name);
          console.error("server.error.message:", server.error.message);
          console.error("server.error.code:", server.error.code);
          console.error("server.error.cause:", server.error.cause);
          console.error("server.error.stack:", server.error.stack);
        }
      }
    }

    logger.error('MongoDB initial connection failed, starting reconnect', {
      metric: 'db_lifecycle',
      event: 'initial_connection_failed',
      error: error.message,
    });
    await reconnectWithBackoff('initial');
    return;
  }

  // ─── Connection Event Handlers ─────────────────────────────────────
  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB runtime error', {
      metric: 'db_lifecycle',
      event: 'error',
      error: err.message,
      code: err.code,
    });
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    logger.warn('MongoDB disconnected', {
      metric: 'db_lifecycle',
      event: 'disconnected',
    });

    // Auto-reconnect unless we're shutting down
    if (!isShuttingDown && !isReconnecting) {
      reconnectWithBackoff('runtime');
    }
  });

  mongoose.connection.on('reconnected', () => {
    isConnected = true;
    reconnectAttempt = 0;
    logger.info('MongoDB driver reconnected', {
      metric: 'db_lifecycle',
      event: 'driver_reconnected',
    });
  });

  // Start health monitoring
  startHealthCheck();
}

/**
 * Gracefully disconnect from MongoDB.
 */
export async function disconnectDatabase() {
  isShuttingDown = true;
  stopHealthCheck();

  if (!isConnected && !isReconnecting) return;

  try {
    await mongoose.connection.close();
    isConnected = false;
    logger.info('MongoDB connection closed gracefully', {
      metric: 'db_lifecycle',
      event: 'closed',
    });
  } catch (error) {
    logger.error('Error closing MongoDB connection', {
      metric: 'db_lifecycle',
      event: 'close_error',
      error: error.message,
    });
  }
}

/**
 * Check if database connection is active.
 */
export function isDatabaseConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

/**
 * Get database health metrics for the health endpoint.
 */
export function getDatabaseHealth() {
  const avgPingMs = pingHistory.length > 0
    ? Math.round(pingHistory.reduce((a, b) => a + b, 0) / pingHistory.length)
    : -1;

  return {
    connected: isDatabaseConnected(),
    lastPingMs,
    avgPingMs,
    reconnectAttempts: reconnectAttempt,
    isReconnecting,
    poolSize: MONGOOSE_OPTIONS.maxPoolSize,
    readyState: mongoose.connection.readyState,
  };
}

/**
 * Stop health check timer (for graceful shutdown).
 */
export { stopHealthCheck };
