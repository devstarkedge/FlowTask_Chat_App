import redisManager from './redisManager.js';
import logger from '../utils/logger.js';

// For backward compatibility, export the shared client
// NOTE: This will be null until redisManager.init() is called in server/index.js
export default new Proxy({}, {
  get(target, prop) {
    const client = redisManager.getSharedClient();
    if (!client) {
      if (prop === 'then') return undefined; // Avoid Promise resolution loops
      logger.warn(`config/redis.js: Attempted to access Redis property '${prop}' before initialization or REDIS_URL is absent`);
      return undefined;
    }
    return typeof client[prop] === 'function' ? client[prop].bind(client) : client[prop];
  }
});
