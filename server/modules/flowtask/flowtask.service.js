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

// ─── Cache (bounded LRU) ─────────────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 500;       // Prevent unbounded memory growth

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  // Move to end for LRU ordering (Map preserves insertion order)
  cache.delete(key);
  cache.set(key, entry);
  return entry.data;
}

function setCache(key, data) {
  // Evict oldest entry if at capacity
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
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

    // Debug: Log outgoing FlowTask token (partially masked)
    logger.debug('FlowTask GET request', {
      path,
      tokenMasked: token ? `${token.slice(0, 6)}...${token.slice(-6)}` : null,
    });

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
    // Debug: Log outgoing FlowTask token (partially masked)
    logger.debug('FlowTask POST request', {
      path,
      tokenMasked: token ? `${token.slice(0, 6)}...${token.slice(-6)}` : null,
    });
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
   * Get all users from FlowTask platform.
   * Supports search filtering. Uses cache and circuit breaker.
   *
   * @param {object} [filters] - { search, department, team, role }
   * @param {string} token - FlowTask JWT token
   * @returns {Promise<object[]>} Array of FlowTask user objects
   */
  async getUsers(filters = {}, token) {
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.department) params.set('department', filters.department);
      if (filters.team) params.set('team', filters.team);
      if (filters.role) params.set('role', filters.role);
      const queryString = params.toString();
      const path = `/api/users${queryString ? `?${queryString}` : ''}`;
      const result = await this.get(path, token);
      // FlowTask returns { success: true, data: { users: [...] } } or just an array
      const users = result.data?.users || result.users || result.data || [];
      return Array.isArray(users) ? users : [];
    } catch (error) {
      // If token is invalid/expired (401) or user lacks admin/HR permissions (403),
      // gracefully fall back to ChatApp-only users for DM contacts.
      if (error.response?.status === 401) {
        logger.warn('FlowTask getUsers: unauthorized token, falling back to ChatApp users', {
          status: error.response.status,
        });
        return [];
      }

      // If the user doesn't have admin/HR permissions, FlowTask returns 403.
      // Gracefully return empty array — DM contacts will fall back to ChatApp users only
      if (error.response?.status === 403) {
        logger.warn('FlowTask getUsers: insufficient permissions, falling back to ChatApp users', {
          status: error.response.status,
        });
        return [];
      }
      logger.error('FlowTask getUsers failed', { error: error.message });
      return []; // Graceful degradation — never block the UI
    }
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
