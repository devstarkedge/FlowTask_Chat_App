import rateLimit from 'express-rate-limit';
import { RateLimitError } from './errorHandler.js';

/**
 * Rate limiter factory.
 * Produces Express middleware with configurable window and max requests.
 * Uses in-memory store — swap to Redis store for multi-instance deployments.
 *
 * @param {{ windowMs: number, max: number }} options
 * @returns {Function} Express middleware
 */
export function createRateLimiter({ windowMs, max }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,  // Return rate limit info in RateLimit-* headers
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Per-user if authenticated, per-IP otherwise
      return req.user?._id?.toString() || req.ip;
    },
    handler: (_req, _res, next) => {
      next(new RateLimitError(`Rate limit exceeded. Max ${max} requests per ${windowMs / 1000}s.`));
    },
  });
}

// ─── Pre-built Auth Rate Limiters ────────────────────────────────────────────

/** Strict limiter for login/register — 5 attempts per 15 minutes per IP. */
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
});

/** Less strict limiter for token refresh — 30 per minute per IP. */
export const refreshLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
});

/** Password reset limiter — 3 per 15 minutes per IP. */
export const passwordResetLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 3,
});

/** File upload limiter — 20 per minute per user/IP. */
export const uploadLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
});
