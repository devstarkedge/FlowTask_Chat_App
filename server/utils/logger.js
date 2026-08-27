import winston from 'winston';
import env from '../config/environment.js';

const { combine, timestamp, errors, json, printf, colorize } = winston.format;

/**
 * Centralized structured logger.
 *
 * Winston log levels (lowest number = highest priority):
 *   error (0)  warn (1)  info (2)  http (3)  verbose (4)  debug (5)  silly (6)
 *
 * Effective level by environment (overridable via LOG_LEVEL env var):
 *   development  →  debug  — all logs: debug, http/morgan, info, warn, error
 *   production   →  info   — only error, warn, info; debug and http suppressed
 *
 * To temporarily enable debug logs in production:
 *   Render → Chat Backend → Environment → LOG_LEVEL=debug → Manual Deploy
 *   (revert afterwards)
 *
 * Usage:
 *   logger.error('DB failed', { error: msg });  // always shown in prod
 *   logger.warn('Rate limit near', { ip });      // always shown in prod
 *   logger.info('User logged in', { userId });   // always shown in prod
 *   logger.debug('JWT decoded', { payload });    // dev only by default
 *   logger.http('GET /health 200 4ms');          // handled by morgan
 */

// Development: colorized, human-readable output
const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss.SSS' }),
  errors({ stack: true }),
  printf(({ timestamp: ts, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `${ts} ${level}: ${stack || message}${metaStr}`;
  }),
);

// Production: structured JSON — one parseable object per line.
// Render's log dashboard can search/filter these fields directly.
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json(),
);

const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: env.IS_PRODUCTION ? prodFormat : devFormat,
  defaultMeta: { service: 'TaskChat' },
  transports: [
    // Single Console transport — Render captures stdout/stderr automatically.
    // File transports are omitted: Render's filesystem is ephemeral and wiped
    // on every redeploy, making local log files useless there.
    new winston.transports.Console({
      // Route error-level logs to stderr so Render highlights them;
      // all other levels stay on stdout.
      stderrLevels: ['error'],
    }),
  ],
});

// Confirm the active level in Render logs on every cold start.
logger.info('Logger initialized', { level: env.LOG_LEVEL, env: env.NODE_ENV });

export default logger;
