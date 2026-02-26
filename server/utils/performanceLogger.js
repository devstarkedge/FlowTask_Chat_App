import logger from './logger.js';

/**
 * Performance & Monitoring Utilities.
 * Structured logging for key production metrics.
 */

/**
 * Log message send latency.
 * @param {number} startTime - performance.now() value from start
 * @param {string} messageId
 * @param {string} channelId
 */
export function logMessageLatency(startTime, messageId, channelId) {
  const durationMs = Math.round(performance.now() - startTime);
  const level = durationMs > 500 ? 'warn' : 'debug';
  logger[level]('Message send latency', {
    metric: 'message_send_latency',
    durationMs,
    messageId,
    channelId,
    slow: durationMs > 500,
  });
}

/**
 * Log slow database query detection.
 * @param {string} queryName - Description of the query
 * @param {number} durationMs - How long the query took
 * @param {number} [threshold=100] - Threshold in ms to consider slow
 */
export function logSlowQuery(queryName, durationMs, threshold = 100) {
  if (durationMs > threshold) {
    logger.warn('Slow query detected', {
      metric: 'slow_query',
      queryName,
      durationMs,
      threshold,
    });
  }
}

/**
 * Log message delivery failure.
 * @param {string} messageId
 * @param {Error|string} error
 */
export function logDeliveryFailure(messageId, error) {
  logger.error('Message delivery failure', {
    metric: 'delivery_failure',
    messageId,
    error: error?.message || error,
  });
}

/**
 * Log file upload failure.
 * @param {string} assetId
 * @param {Error|string} error
 */
export function logUploadFailure(assetId, error) {
  logger.error('File upload failure', {
    metric: 'upload_failure',
    assetId,
    error: error?.message || error,
  });
}

/**
 * Log socket reconnect event.
 * @param {string} userId
 * @param {string} socketId
 * @param {string} reason
 */
export function logSocketReconnect(userId, socketId, reason) {
  logger.info('Socket reconnect', {
    metric: 'socket_reconnect',
    userId,
    socketId,
    reason,
  });
}
