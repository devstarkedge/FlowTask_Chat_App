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

import redisManager from '../config/redisManager.js';

let redisClientFallback = new MemoryRedisMock();

export default new Proxy({}, {
  get(target, prop) {
    const client = redisManager.getSharedClient();
    
    if (client) {
      return typeof client[prop] === 'function' ? client[prop].bind(client) : client[prop];
    }
    
    // Fallback to in-memory mock if no global redis
    return typeof redisClientFallback[prop] === 'function' ? redisClientFallback[prop].bind(redisClientFallback) : redisClientFallback[prop];
  }
});
