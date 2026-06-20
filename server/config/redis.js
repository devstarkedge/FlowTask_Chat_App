import { createClient } from 'redis';
import logger from '../utils/logger.js';
import { env } from './env.js';

let redisClient = null;

if (env.REDIS_URL) {
  redisClient = createClient({ url: env.REDIS_URL });

  redisClient.on('error', (err) => logger.error('Redis Client Error', { error: err.message }));
  redisClient.on('connect', () => logger.info('Redis Client Connected'));
  redisClient.on('reconnecting', () => logger.warn('Redis Client Reconnecting...'));

  // Connect immediately
  redisClient.connect().catch((err) => {
    logger.error('Initial Redis connection failed', { error: err.message });
  });
} else {
  logger.warn('REDIS_URL not set in environment. Presence service will not use Redis.');
}

export default redisClient;
