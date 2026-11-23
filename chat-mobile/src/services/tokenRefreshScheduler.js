/**
 * Enterprise Proactive / Silent Token Refresh Scheduler for React Native / Mobile
 * Automatically renews access tokens in the background before they expire,
 * preventing 401 request latency spikes and UI interruptions.
 */
import axios from 'axios';
import ENV from '../config/environment';
import logger from '../utils/logger';
import { isAuthRevokedOrInvalid, isOfflineOrServerUnavailable } from '../utils/networkErrors';
import { secureGet, secureSet, secureMultiRemove } from '../utils/secureStorage';
import storage from './storage';

const REFRESH_BUFFER_SECONDS = 90; // Refresh 90s before expiration
const MIN_REFRESH_DELAY_MS = 5000; // Never refresh sooner than 5s
const MAX_REFRESH_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours max timer

let refreshTimer = null;
let isRefreshingProactively = false;
let activeRefreshPromise = null;

function base64Decode(str) {
  if (typeof atob === 'function') {
    try {
      return atob(str);
    } catch (_) {}
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  str = String(str).replace(/=+$/, '');
  if (str.length % 4 === 1) {
    return null;
  }
  for (let bc = 0, bs, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
    buffer = chars.indexOf(buffer);
  }
  return output;
}

/**
 * Safely parse a JWT payload without external libraries.
 */
export function parseJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const raw = base64Decode(base64);
    if (!raw) return null;
    try {
      const jsonPayload = decodeURIComponent(
        raw
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch {
      return JSON.parse(raw);
    }
  } catch (e) {
    return null;
  }
}

/**
 * Checks if a token is already expired or expiring within `bufferSeconds`.
 */
export function isTokenExpiringSoon(token, bufferSeconds = REFRESH_BUFFER_SECONDS) {
  const payload = parseJwtPayload(token);
  if (!payload || !payload.exp) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return payload.exp - nowSeconds <= bufferSeconds;
}

/**
 * Checks if a token is already expired.
 */
export function isTokenExpired(token) {
  const payload = parseJwtPayload(token);
  if (!payload || !payload.exp) return true;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return payload.exp <= nowSeconds;
}

/**
 * Execute silent token refresh via Axios direct post to avoid circular interceptor recursion.
 * Shares active promise to prevent duplicate concurrent refresh calls.
 */
export async function refreshAccessTokenSilently() {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    isRefreshingProactively = true;
    logger.info('[TokenRefreshScheduler] Proactively renewing access token in background...');

    try {
      const refreshToken = await secureGet('chat_refresh_token');
      if (!refreshToken) {
        logger.warn('[TokenRefreshScheduler] No refresh token found in secure storage');
        return null;
      }

      const baseURL = ENV.API_BASE_URL;
      const { data } = await axios.post(
        `${baseURL}/auth/refresh`,
        { refreshToken },
        { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
      );

      const newAccess = data.data?.accessToken;
      const newRefresh = data.data?.refreshToken;

      if (!newAccess) {
        throw new Error('No access token returned from refresh endpoint');
      }

      // Update SecureStore & Zustand AuthStore
      try {
        const { useAuthStore } = require('../stores/authStore');
        await useAuthStore.getState().setTokens(newAccess, newRefresh);
      } catch (storeErr) {
        await secureSet('chat_access_token', newAccess);
        if (newRefresh) {
          await secureSet('chat_refresh_token', newRefresh);
        }
      }

      // Update API module cache
      try {
        const { setCachedToken } = require('./api');
        setCachedToken(newAccess);
      } catch (_) {}

      // Update live socket authentication token
      try {
        const { updateSocketToken } = require('./socket');
        updateSocketToken(newAccess);
      } catch (_) {}

      logger.info('[TokenRefreshScheduler] Token proactively renewed successfully.');
      scheduleNextRefresh(newAccess);
      return newAccess;
    } catch (error) {
      if (isAuthRevokedOrInvalid(error)) {
        logger.warn('[TokenRefreshScheduler] Server explicitly rejected refresh token:', error?.message);
        try {
          const { clearApiCache } = require('./api');
          clearApiCache();
        } catch (_) {}
        await secureMultiRemove(['chat_access_token', 'chat_refresh_token']);
        await storage.removeItem('chat_user');
        try {
          const { useAuthStore } = require('../stores/authStore');
          useAuthStore.getState().logout();
        } catch (_) {}
      } else if (isOfflineOrServerUnavailable(error)) {
        logger.warn('[TokenRefreshScheduler] Background refresh deferred (offline/server unavailable). Will retry in 30s.');
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => refreshAccessTokenSilently(), 30000);
      } else {
        logger.warn('[TokenRefreshScheduler] Background refresh error (preserving session):', error?.message);
      }
      return null;
    } finally {
      isRefreshingProactively = false;
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

/**
 * Schedule the next proactive token refresh timer.
 */
export function scheduleNextRefresh(accessToken) {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  if (!accessToken) return;

  const payload = parseJwtPayload(accessToken);
  if (!payload || !payload.exp) return;

  const nowMs = Date.now();
  const expiresAtMs = payload.exp * 1000;
  const targetRefreshTimeMs = expiresAtMs - REFRESH_BUFFER_SECONDS * 1000;

  // Add random jitter (0 to 15 seconds) to prevent synchronized refresh requests
  const jitterMs = Math.floor(Math.random() * 15000);
  let delayMs = targetRefreshTimeMs - nowMs + jitterMs;

  if (delayMs <= 0) {
    // Already near or past expiration threshold; schedule immediately with slight jitter
    delayMs = Math.max(MIN_REFRESH_DELAY_MS, Math.floor(Math.random() * 3000));
  } else {
    delayMs = Math.min(delayMs, MAX_REFRESH_DELAY_MS);
  }

  logger.debug(
    `[TokenRefreshScheduler] Next proactive token refresh scheduled in ${Math.round(delayMs / 1000)}s`
  );

  refreshTimer = setTimeout(() => {
    refreshAccessTokenSilently();
  }, delayMs);
}

/**
 * Cancel any scheduled proactive refresh.
 */
export function stopProactiveRefresh() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  isRefreshingProactively = false;
  activeRefreshPromise = null;
}
