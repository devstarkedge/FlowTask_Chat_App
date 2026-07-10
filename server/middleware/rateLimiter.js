import rateLimit from 'express-rate-limit';
import { RateLimitError } from './errorHandler.js';
import env from '../config/environment.js';
import logger from '../utils/logger.js';

// Single shared Redis store constructor (created asynchronously once)
let _redisStoreConstructor = null;
let _redisInitPromise = null;

async function initRedisStoreOnce() {
  if (!env.REDIS_URL) return;
  if (_redisInitPromise) return _redisInitPromise;

  _redisInitPromise = (async () => {
    try {
      const { RedisStore } = await import('rate-limit-redis');
      const { default: redisManager } = await import('../config/redisManager.js');
      const client = redisManager.getSharedClient();
      if (!client) throw new Error('Shared Redis client not available');

      _redisStoreConstructor = (prefix) =>
        new RedisStore({
          sendCommand: (...args) => client.call(...args),
          prefix: `rl:${prefix}:`,
          resetExpiryOnChange: false,
        });
      logger.info('Rate limiter Redis store initialized with shared client');
    } catch (err) {
      logger.warn('Redis rate-limit store unavailable, using in-memory', { error: err.message });
      _redisStoreConstructor = null;
    }
  })();

  return _redisInitPromise;
}

/**
 * Rate limiter factory.
 * Creates the `express-rate-limit` instance at initialization (synchronously)
 * and, if Redis is configured, attempts to initialize a Redis-backed store
 * asynchronously and swap the limiter when ready.
 *
 * This avoids creating the limiter inside a request handler (which triggers
 * express-rate-limit validation errors).
 */
export function createRateLimiter({ windowMs, max, prefix = 'default' }) {
  const baseOptions = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?._id?.toString() || req.ip,
    handler: (_req, _res, next) => {
      next(new RateLimitError(`Rate limit exceeded. Max ${max} requests per ${windowMs / 1000}s.`));
    },
  };

  // Create an in-memory limiter synchronously at initialization.
  let limiter = rateLimit(baseOptions);

  // If Redis is configured, initialize it asynchronously and replace the limiter
  // with a Redis-backed one once ready. This is done outside of request handling.
  if (env.REDIS_URL) {
    (async () => {
      try {
        await initRedisStoreOnce();
        if (_redisStoreConstructor) {
          const store = _redisStoreConstructor(prefix, windowMs);
          limiter = rateLimit({ ...baseOptions, store });
          logger.info(`Rate limiter using Redis store for prefix ${prefix}`);
        }
      } catch (err) {
        logger.warn('Failed to initialize Redis rate limiter', { prefix, error: err.message });
      }
    })();
  }

  // Return middleware that delegates to the (possibly swapped) limiter.
  return (req, res, next) => limiter(req, res, next);
}

// ─── Pre-built Auth Rate Limiters ────────────────────────────────────────────

/** Strict limiter for login/register — 5 attempts per 100 seconds per user/IP. */
export const authLimiter = createRateLimiter({
  windowMs: 100 * 1000,
  max: 5,
  prefix: 'auth',
});

/** Less strict limiter for token refresh — 30 per minute per IP. */
export const refreshLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  prefix: 'refresh',
});

/** Password reset limiter — 3 per 15 minutes per IP. */
export const passwordResetLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 3,
  prefix: 'pwreset',
});

/** File upload limiter — 50 per minute per user/IP. */
export const uploadLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 50,
  prefix: 'upload',
});

/** Message send limiter — 30 messages per minute per user. */
export const messageLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  prefix: 'message',
});

/** Search limiter — 20 searches per minute per user. */
export const searchLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  prefix: 'search',
});

/** Webhook limiter — 100 webhooks per minute per source IP. */
export const webhookLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  prefix: 'webhook',
});

/** Invite limiter — 20 invites per hour per user. */
export const inviteLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  prefix: 'invite',
});
