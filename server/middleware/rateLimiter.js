import rateLimit from 'express-rate-limit';
import { RateLimitError } from './errorHandler.js';
import env from '../config/environment.js';
import logger from '../utils/logger.js';

/**
 * Build a Redis store for rate limiting (multi-instance safe).
 * Falls back to in-memory if Redis is not configured.
 */
let _redisStoreConstructor = null;
async function getRedisStore(windowMs) {
  if (!env.REDIS_URL) return undefined; // Fall back to in-memory

  if (!_redisStoreConstructor) {
    try {
      const { RedisStore } = await import('rate-limit-redis');
      const { createClient } = await import('redis');
      const client = createClient({ url: env.REDIS_URL });
      client.on('error', (err) => logger.error('Rate limiter Redis error', { error: err.message }));
      await client.connect();
      _redisStoreConstructor = (prefix, windowMs) =>
        new RedisStore({
          sendCommand: (...args) => client.sendCommand(args),
          prefix: `rl:${prefix}:`,
          resetExpiryOnChange: false,
        });
      logger.info('Rate limiter using Redis store');
    } catch (err) {
      logger.warn('Redis rate-limit store unavailable, using in-memory', { error: err.message });
      return undefined;
    }
  }
  return _redisStoreConstructor;
}

/**
 * Rate limiter factory.
 * Uses Redis store when REDIS_URL is configured (multi-instance safe),
 * falls back to in-memory for single-instance / development.
 *
 * @param {{ windowMs: number, max: number, prefix?: string }} options
 * @returns {Function} Express middleware
 */
export function createRateLimiter({ windowMs, max, prefix = 'default' }) {
  let store = undefined;
  let storeInitialized = false;
  let cachedLimiter = null;

  return async (req, res, next) => {
    if (!storeInitialized && env.REDIS_URL) {
      try {
        const builder = await getRedisStore(windowMs);
        if (builder) store = builder(prefix, windowMs);
      } catch { /* fall back to in-memory */ }
      storeInitialized = true;
    }

    if (!cachedLimiter) {
      cachedLimiter = rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        store: store || undefined,
        keyGenerator: (req) => req.user?._id?.toString() || req.ip,
        handler: (_req, _res, next) => {
          next(new RateLimitError(`Rate limit exceeded. Max ${max} requests per ${windowMs / 1000}s.`));
        },
      });
    }

    cachedLimiter(req, res, next);
  };
}

// ─── Pre-built Auth Rate Limiters ────────────────────────────────────────────

/** Strict limiter for login/register — 5 attempts per 15 minutes per IP. */
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
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
