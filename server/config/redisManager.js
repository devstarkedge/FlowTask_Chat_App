import Redis from 'ioredis';
import logger from '../utils/logger.js';
import env from './environment.js';

/**
 * Singleton Redis Manager
 * 
 * Maintains a strict set of global Redis connections across the application.
 * - sharedClient: Reused for cache, rate limiting, pub, idempotency, etc.
 * - subClient: Reused strictly for subscriptions (Socket.IO Adapter).
 */

class RedisManager {
  constructor() {
    this.sharedClient = null;
    this.subClient = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the global Redis clients.
   * This should be called once during server startup.
   */
  async init() {
    if (this.isInitialized) return;
    if (!env.REDIS_URL) {
      logger.info('REDIS_URL not set. Running without global Redis (in-memory fallbacks will be used).');
      return;
    }

    try {
      logger.info('Initializing singleton Redis clients...');
      
      // 1. Create Shared Client
      this.sharedClient = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        lazyConnect: true,
        keepAlive: 10000, // Forces TCP keepalive probes so dead connections drop quickly
      });

      this.sharedClient.on('error', (err) => {
        logger.error('Redis sharedClient error', { error: err.message });
      });

      this.sharedClient.on('ready', () => {
        logger.info('Redis sharedClient connected successfully');
      });

      // 2. Create Sub Client (only for subscriptions)
      this.subClient = this.sharedClient.duplicate();

      this.subClient.on('error', (err) => {
        logger.error('Redis subClient error', { error: err.message });
      });

      this.subClient.on('ready', () => {
        logger.info('Redis subClient connected successfully');
      });

      // Connect both
      await Promise.all([
        this.sharedClient.connect(),
        this.subClient.connect(),
      ]);

      this.isInitialized = true;
    } catch (err) {
      logger.error('Failed to initialize singleton Redis clients', { error: err.message });
      this.sharedClient = null;
      this.subClient = null;
      this.isInitialized = false;
    }
  }

  /**
   * Get the global shared Redis client.
   * Used for standard commands (GET, SET, INCR, PUBLISH).
   * @returns {Redis|null}
   */
  getSharedClient() {
    return this.sharedClient;
  }

  /**
   * Get the global subscriber Redis client.
   * Used strictly for SUBSCRIBE commands (e.g. Socket.IO Adapter).
   * @returns {Redis|null}
   */
  getSubscriberClient() {
    return this.subClient;
  }

  /**
   * Gracefully close all managed Redis connections.
   */
  async closeAll() {
    logger.info('Closing singleton Redis clients...');
    const promises = [];
    
    if (this.sharedClient) {
      promises.push(this.sharedClient.quit().catch(() => {}));
      this.sharedClient = null;
    }
    
    if (this.subClient) {
      promises.push(this.subClient.quit().catch(() => {}));
      this.subClient = null;
    }

    await Promise.all(promises);
    this.isInitialized = false;
    logger.info('Singleton Redis clients closed successfully');
  }
}

export default new RedisManager();
