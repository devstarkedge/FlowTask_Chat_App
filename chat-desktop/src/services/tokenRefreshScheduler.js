/**
 * Enterprise Proactive / Silent Token Refresh Scheduler
 * Automatically renews access tokens in the background before they expire,
 * preventing 401 request latency spikes and UI interruptions.
 */
import axios from 'axios';
import { getApiBaseUrl } from './api';
import logger from '../utils/logger';
import { isAuthRevokedOrInvalid, isOfflineOrServerUnavailable } from '../utils/networkErrors';

const REFRESH_BUFFER_SECONDS = 90; // Refresh 90s before expiration
const MIN_REFRESH_DELAY_MS = 5000; // Never refresh sooner than 5s
const MAX_REFRESH_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours max timer

let refreshTimer = null;
let isRefreshingProactively = false;

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
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
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
 * Execute silent token refresh via Axios direct post to avoid circular interceptor recursion.
 */
export async function executeSilentRefresh(authStore) {
  if (isRefreshingProactively) return null;
  const refreshToken = authStore.getState().refreshToken;
  if (!refreshToken) return null;

  isRefreshingProactively = true;
  logger.info('[TokenRefreshScheduler] Proactively renewing access token in background...');

  try {
    const baseURL = getApiBaseUrl();
    const { data } = await axios.post(
      `${baseURL}/auth/refresh`,
      { refreshToken },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );

    const { accessToken: newAccess, refreshToken: newRefresh } = data.data;
    await authStore.getState().setTokens(newAccess, newRefresh);

    try {
      const { getSocket } = await import('./socket');
      const sock = getSocket();
      if (sock) {
        sock.auth = { ...sock.auth, token: newAccess };
        sock.emit('auth:refresh', { token: newAccess });
      }
    } catch {}

    logger.info('[TokenRefreshScheduler] Token proactively renewed successfully.');
    scheduleNextRefresh(newAccess, authStore);
    return newAccess;
  } catch (error) {
    if (isAuthRevokedOrInvalid(error)) {
      logger.warn('[TokenRefreshScheduler] Server explicitly rejected refresh token:', error);
      authStore.getState().logout();
    } else if (isOfflineOrServerUnavailable(error)) {
      logger.warn('[TokenRefreshScheduler] Background refresh deferred (offline/server unavailable). Will retry on reconnect.');
      // Retry in 30 seconds if still running
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => executeSilentRefresh(authStore), 30000);
    }
    return null;
  } finally {
    isRefreshingProactively = false;
  }
}

/**
 * Schedule the next proactive token refresh timer.
 */
export function scheduleNextRefresh(accessToken, authStore) {
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
    executeSilentRefresh(authStore);
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
}
