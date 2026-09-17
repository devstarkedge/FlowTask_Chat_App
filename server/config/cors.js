import { CORS_ALLOWED_HEADERS } from './constants.js';

export function createCorsOptions(effectiveOrigins, logger) {
  return {
    origin: (incomingOrigin, callback) => {
      if (!incomingOrigin) return callback(null, true);
      const normalized = incomingOrigin.replace(/\/+$/, '');
      if (effectiveOrigins.includes(normalized)) {
        callback(null, true);
      } else {
        logger.warn('CORS: blocked request from unlisted origin', {
          incomingOrigin,
          normalizedOrigin: normalized,
          effectiveOrigins,
          action: `Add "${normalized}" to CORS_ORIGINS in the Chat Backend environment, then redeploy`,
        });
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: CORS_ALLOWED_HEADERS,
    exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Has-More', 'X-Request-Id'],
    maxAge: 86400,
  };
}
