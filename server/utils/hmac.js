import crypto from 'crypto';

/**
 * HMAC-SHA256 utilities for webhook signature verification.
 * Implements timing-safe comparison to prevent timing attacks.
 */

/**
 * Compute HMAC-SHA256 signature of a payload.
 * @param {string|Buffer} payload - Raw request body
 * @param {string} secret - Shared secret key
 * @returns {string} Hex-encoded HMAC signature with "sha256=" prefix
 */
export function computeSignature(payload, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload);
  return `sha256=${hmac.digest('hex')}`;
}

/**
 * Verify a webhook signature using timing-safe comparison.
 * @param {string|Buffer} payload - Raw request body
 * @param {string} signature - The X-FlowTask-Signature header value
 * @param {string} secret - Shared secret key
 * @returns {boolean} True if signature is valid
 */
export function verifySignature(payload, signature, secret) {
  if (!payload || !signature || !secret) return false;

  const expected = computeSignature(payload, secret);

  // Both must be same length for timingSafeEqual
  const sigBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  if (sigBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

/**
 * Check if a timestamp is within the allowed replay window.
 * @param {string} timestamp - ISO 8601 timestamp from header
 * @param {number} [maxAgeMs=300000] - Maximum allowed age in ms (default: 5 min)
 * @returns {boolean} True if timestamp is within window
 */
export function isTimestampFresh(timestamp, maxAgeMs = 5 * 60 * 1000) {
  if (!timestamp) return false;

  const eventTime = new Date(timestamp).getTime();
  if (isNaN(eventTime)) return false;

  const now = Date.now();
  const age = now - eventTime;

  return age >= 0 && age <= maxAgeMs;
}
