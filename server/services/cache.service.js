import logger from '../utils/logger.js';
import env from '../config/environment.js';

/**
 * Cache Service — abstract cache with Redis (optional) and in-memory LRU fallback.
 *
 * If REDIS_URL is set → uses Redis (ioredis).
 * Otherwise → bounded in-memory LRU cache (no external dependency).
 *
 * All methods are async-safe regardless of backend.
 */

// ─── In-Memory LRU Cache ────────────────────────────────────────────────────
class InMemoryLRUCache {
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  async get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    // Move to end for LRU
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  async set(key, value, ttlSeconds = 300) {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, {
      value,
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async del(key) {
    this.cache.delete(key);
  }

  async delPattern(pattern) {
    // Simple pattern matching for in-memory (supports * wildcard at end)
    const prefix = pattern.replace(/\*$/, '');
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  async flush() {
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }
}

// ─── Redis Cache Wrapper ─────────────────────────────────────────────────────
class RedisCacheWrapper {
  constructor(redisClient) {
    this.client = redisClient;
  }

  async get(key) {
    const raw = await this.client.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  async set(key, value, ttlSeconds = 300) {
    const serialized = JSON.stringify(value);
    if (ttlSeconds > 0) {
      await this.client.setex(key, ttlSeconds, serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }

  async del(key) {
    await this.client.del(key);
  }

  async delPattern(pattern) {
    // Use SCAN instead of KEYS to avoid blocking Redis
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } while (cursor !== '0');
  }

  async flush() {
    await this.client.flushdb();
  }
}

// ─── Cache Service (singleton) ───────────────────────────────────────────────
class CacheService {
  constructor() {
    this.backend = null;
    this.type = 'none';
  }

  async initialize() {
    if (this.backend) return; // Already initialized

    if (env.REDIS_URL) {
      try {
        const Redis = (await import('ioredis')).default;
        const client = new Redis(env.REDIS_URL, {
          maxRetriesPerRequest: 3,
          retryDelayOnFailover: 100,
          lazyConnect: true,
        });

        await client.connect();

        client.on('error', (err) => {
          logger.error('Redis cache error', { error: err.message });
        });

        this.backend = new RedisCacheWrapper(client);
        this.type = 'redis';
        logger.info('Cache service initialized with Redis');
      } catch (err) {
        logger.warn('Redis unavailable, falling back to in-memory cache', { error: err.message });
        this.backend = new InMemoryLRUCache(1000);
        this.type = 'memory';
      }
    } else {
      this.backend = new InMemoryLRUCache(1000);
      this.type = 'memory';
      logger.info('Cache service initialized with in-memory LRU (no REDIS_URL)');
    }
  }

  _ensureInitialized() {
    if (!this.backend) {
      // Lazy-init with in-memory if not explicitly initialized
      this.backend = new InMemoryLRUCache(1000);
      this.type = 'memory';
    }
  }

  async get(key) {
    this._ensureInitialized();
    return this.backend.get(key);
  }

  async set(key, value, ttlSeconds = 300) {
    this._ensureInitialized();
    return this.backend.set(key, value, ttlSeconds);
  }

  async del(key) {
    this._ensureInitialized();
    return this.backend.del(key);
  }

  async delPattern(pattern) {
    this._ensureInitialized();
    return this.backend.delPattern(pattern);
  }

  /**
   * Get-or-set pattern — fetch from cache, or compute + cache if miss.
   */
  async getOrSet(key, computeFn, ttlSeconds = 300) {
    const cached = await this.get(key);
    if (cached !== null) return cached;

    const value = await computeFn();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Invalidate all workspace-related cache keys.
   */
  async invalidateWorkspace(workspaceId) {
    await this.delPattern(`ws:${workspaceId}:*`);
  }

  getStatus() {
    return {
      type: this.type,
      size: this.type === 'memory' ? this.backend?.size || 0 : 'N/A',
    };
  }
}

export default new CacheService();
