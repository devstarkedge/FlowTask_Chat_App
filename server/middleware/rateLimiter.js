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
