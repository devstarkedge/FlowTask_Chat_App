import axios from 'axios';
import env from '../../config/environment.js';
import { CircuitBreaker } from '../../services/circuitBreaker.js';
import logger from '../../utils/logger.js';

/**
 * FlowTask Service — API client for FlowTask backend.
 *
 * Responsibilities:
 *  - All HTTP calls to FlowTask API
 *  - Token forwarding (user's JWT)
 *  - Retry logic with exponential backoff (3 retries on 5xx)
 *  - Rate-limit handling (respect Retry-After)
 *  - Error normalization
 *  - Circuit breaker protection
 *  - Response caching (5-min TTL per spec §6.6)
 *
 * This is the ONLY module allowed to make HTTP calls to FlowTask.
 */

// ─── Cache ───────────────────────────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// Periodic cache cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}, 60_000);

// ─── Axios Instance ──────────────────────────────────────────────────────────
const httpClient = axios.create({
  baseURL: env.FLOWTASK_API_URL,
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// ─── Retry Interceptor ──────────────────────────────────────────────────────
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 30000]; // Exponential backoff

httpClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    config._retryCount = config._retryCount || 0;

    // Rate limited — respect Retry-After
    if (error.response?.status === 429) {
      const retryAfter = parseInt(error.response.headers['retry-after'], 10) || 5;
      logger.warn('FlowTask API rate limited', { retryAfter });
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return httpClient(config);
    }

    // Server errors — retry with backoff
    if (error.response?.status >= 500 && config._retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAYS[config._retryCount] || 30000;
      config._retryCount += 1;
      logger.warn('FlowTask API server error, retrying', {
        attempt: config._retryCount,
        delay,
        url: config.url,
        status: error.response.status,
      });
      await new Promise((r) => setTimeout(r, delay));
      return httpClient(config);
    }

    // Client errors — do NOT retry
    return Promise.reject(error);
  },
);

// ─── Circuit Breaker ─────────────────────────────────────────────────────────
const breaker = new CircuitBreaker('flowtask-api');

// ─── Service Methods ─────────────────────────────────────────────────────────

class FlowTaskService {
  /**
   * Make an authenticated GET request to FlowTask API.
   * @param {string} path - API path (e.g., '/api/users/123')
   * @param {string} token - FlowTask JWT token
   * @param {object} [options]
   * @param {boolean} [options.useCache=true]
   * @returns {Promise<object>} Response data
   */
  async get(path, token, { useCache = true } = {}) {
    const cacheKey = `GET:${path}:${token?.slice(-10)}`;

    if (useCache) {
      const cached = getCached(cacheKey);
      if (cached) return cached;
    }

    const data = await breaker.execute(async () => {
      const response = await httpClient.get(path, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    });

    if (useCache) {
      setCache(cacheKey, data);
    }

    return data;
  }

  /**
   * Make an authenticated POST request to FlowTask API.
   * @param {string} path
   * @param {object} body
   * @param {string} token
   * @returns {Promise<object>}
   */
  async post(path, body, token) {
    return breaker.execute(async () => {
      const response = await httpClient.post(path, body, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    });
  }

  // ─── Domain-specific methods ─────────────────────────────────────────────

  /**
   * Get current user profile from FlowTask.
   * @param {string} token
   * @returns {Promise<object>} User object
   */
  async getCurrentUser(token) {
    const result = await this.get('/api/auth/me', token);
    return result.data || result;
  }

  /**
   * Verify a token is still valid.
   * @param {string} token
   * @returns {Promise<object>} User object
   */
  async verifyToken(token) {
    const result = await this.get('/api/auth/verify', token);
    return result.data || result;
  }

  /**
   * Get user by ID.
   * @param {string} userId - FlowTask User _id
   * @param {string} token
   * @returns {Promise<object>}
   */
  async getUser(userId, token) {
    const result = await this.get(`/api/users/${userId}`, token);
    return result.data || result;
  }

  /**
   * Get board (project) details.
   * @param {string} boardId
   * @param {string} token
   * @returns {Promise<object>}
   */
  async getBoard(boardId, token) {
    const result = await this.get(`/api/boards/${boardId}`, token);
    return result.data || result;
  }

  /**
   * Get boards by department.
   * @param {string} departmentId
   * @param {string} token
   * @returns {Promise<object[]>}
   */
  async getBoardsByDepartment(departmentId, token) {
    const result = await this.get(`/api/boards/department/${departmentId}`, token);
    return result.data || result;
  }

  /**
   * Get card (task) details.
   * @param {string} cardId
   * @param {string} token
   * @returns {Promise<object>}
   */
  async getCard(cardId, token) {
    const result = await this.get(`/api/cards/${cardId}`, token);
    return result.data || result;
  }

  /**
   * Get departments list.
   * @param {string} token
   * @returns {Promise<object[]>}
   */
  async getDepartments(token) {
    const result = await this.get('/api/departments', token);
    return result.data || result;
  }

  /**
   * Get user's boards (projects).
   * @param {string} token
   * @returns {Promise<object[]>}
   */
  async getUserBoards(token) {
    const result = await this.get('/api/boards', token);
    return result.data || result;
  }

  /**
   * Get all cards for a board.
   * @param {string} boardId
   * @param {string} token
   * @returns {Promise<object[]>}
   */
  async getBoardCards(boardId, token) {
    const result = await this.get(`/api/cards/board/${boardId}`, token);
    return result.data || result;
  }

  /**
   * Log time to a task (forwarding user's action from bot command).
   * @param {string} cardId
   * @param {object} timeEntry - { hours, minutes, description }
   * @param {string} token
   * @returns {Promise<object>}
   */
  async logTime(cardId, timeEntry, token) {
    return this.post(`/api/cards/${cardId}/time-tracking`, timeEntry, token);
  }

  /**
   * Get circuit breaker status.
   * @returns {object}
   */
  getHealthStatus() {
    return {
      circuitBreaker: breaker.getStatus(),
      cacheSize: cache.size,
    };
  }

  /**
   * Clear response cache.
   */
  clearCache() {
    cache.clear();
    logger.info('FlowTask API cache cleared');
  }
}

export default new FlowTaskService();
