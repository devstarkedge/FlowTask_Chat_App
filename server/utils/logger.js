import winston from 'winston';
import env from '../config/environment.js';

const { combine, timestamp, errors, json, printf, colorize } = winston.format;

/**
 * Structured logger with JSON output for production, colorized console for dev.
 * Supports correlation IDs via child loggers: logger.child({ correlationId })
 */

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss.SSS' }),
  errors({ stack: true }),
  printf(({ timestamp: ts, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} ${level}: ${stack || message}${metaStr}`;
  }),
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json(),
);

const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: env.IS_PRODUCTION ? prodFormat : devFormat,
  defaultMeta: { service: 'flowtask-chat' },
  transports: [
    new winston.transports.Console(),
  ],
});

// In production, also write errors to a dedicated file
if (env.IS_PRODUCTION) {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    }),
  );
}

export default logger;
