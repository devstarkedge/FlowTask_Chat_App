import logger from "./logger.js";
import env from "../config/environment.js";

class MemoryRedisMock {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    return this.store.get(key) || null;
  }

  async set(key, value) {
    this.store.set(key, String(value));
    return "OK";
  }

  async del(key) {
    this.store.delete(key);
    return 1;
  }

  async hset(hashKey, field, value) {
    if (!this.store.has(hashKey)) {
      this.store.set(hashKey, new Map());
    }
    const map = this.store.get(hashKey);
    map.set(field, String(value));
    return 1;
  }

  async hget(hashKey, field) {
    const map = this.store.get(hashKey);
    if (!map) return null;
    return map.get(field) || null;
  }

  async hgetall(hashKey) {
    const map = this.store.get(hashKey);
    if (!map) return {};
    const obj = {};
    for (const [k, v] of map.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  async hdel(hashKey, field) {
    const map = this.store.get(hashKey);
    if (!map) return 0;
    const deleted = map.delete(field) ? 1 : 0;
    if (map.size === 0) {
      this.store.delete(hashKey);
    }
    return deleted;
  }

  async quit() {
    this.store.clear();
    return "OK";
  }
}

let redisClient = null;

if (env.REDIS_URL) {
  try {
    const Redis = (await import("ioredis")).default;
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true,
    });

    redisClient.on("error", (err) => {
      logger.error("[REDIS CLIENT] Redis connection error", { error: err.message });
    });

    await redisClient.connect();
    logger.info("[REDIS CLIENT] Central Redis client connected successfully");
  } catch (err) {
    logger.warn("[REDIS CLIENT] Redis client initialization failed, falling back to in-memory mock", { error: err.message });
    redisClient = new MemoryRedisMock();
  }
} else {
  logger.info("[REDIS CLIENT] Central Redis using in-memory mock (no REDIS_URL configured)");
  redisClient = new MemoryRedisMock();
}

export default redisClient;
