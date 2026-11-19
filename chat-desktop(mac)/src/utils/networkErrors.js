/**
 * Network and connectivity error classification utilities.
 * Accurately distinguishes between:
 * - Network/Internet disconnect
 * - Backend server unavailable (5xx, ECONNREFUSED)
 * - Request timeouts
 * - Authentication/Authorization failures (401/403)
 */

export function isNetworkError(error) {
  if (!error) return false;
  if (error.isAxiosError && !error.response) return true;
  const code = error.code;
  if (
    code === 'ERR_NETWORK' ||
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET'
  ) {
    return true;
  }
  const message = error.message || '';
  if (/Network Error|net::ERR_|Failed to fetch|NetworkError|load failed/i.test(message)) {
    return true;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  return false;
}

export function isServerError(error) {
  if (!error || !error.response) return false;
  const status = error.response.status;
  return typeof status === 'number' && status >= 500 && status <= 599;
}

export function isTimeoutError(error) {
  if (!error) return false;
  return error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '');
}

export function isOfflineOrServerUnavailable(error) {
  return isNetworkError(error) || isServerError(error) || isTimeoutError(error);
}

export function isAuthRevokedOrInvalid(error) {
  if (!error || !error.response) return false;
  const status = error.response.status;
  return status === 401 || status === 403;
}
