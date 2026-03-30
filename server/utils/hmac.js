import crypto from 'crypto';

/**
 * HMAC-SHA256 utilities for webhook signature verification.
 * Implements timing-safe comparison to prevent timing attacks.
 */

/**
 * Compute HMAC-SHA256 signature of a payload.
 * @param {string|Buffer} payload - Data to sign
 * @param {string} secret - Shared secret key
 * @returns {string} Hex-encoded HMAC signature (bare hex, no prefix)
 */
export function computeSignature(payload, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload);
  return hmac.digest('hex');
}

/**
 * Verify a webhook signature using timing-safe comparison.
 * FlowTask signs: HMAC-SHA256(timestamp + '.' + rawBody)
 * and sends the bare hex digest in X-FlowTask-Signature.
 *
 * @param {string|Buffer} rawBody - Raw request body
 * @param {string} signature - The X-FlowTask-Signature header value (bare hex)
 * @param {string} secret - Shared secret key
 * @param {string} timestamp - The X-FlowTask-Timestamp header value
 * @returns {boolean} True if signature is valid
 */
export function verifySignature(rawBody, signature, secret, timestamp) {
  if (!rawBody || !signature || !secret) return false;

  // Reconstruct the same signing payload FlowTask used: "timestamp.body"
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const signingPayload = timestamp ? `${timestamp}.${body}` : body;
  const expected = computeSignature(signingPayload, secret);

  const sigBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  if (sigBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

/**
 * Check if a timestamp is within the allowed replay window.
 * Accepts both Unix epoch seconds (e.g. "1743300916") and ISO 8601 strings.
 * @param {string} timestamp - Timestamp from header
 * @param {number} [maxAgeMs=300000] - Maximum allowed age in ms (default: 5 min)
 * @returns {boolean} True if timestamp is within window
 */
export function isTimestampFresh(timestamp, maxAgeMs = 5 * 60 * 1000) {
  if (!timestamp) return false;

  let eventTime;
  // If it looks like a pure number, treat as Unix epoch seconds
  if (/^\d+$/.test(timestamp)) {
    eventTime = parseInt(timestamp, 10) * 1000;
  } else {
    eventTime = new Date(timestamp).getTime();
  }

  if (isNaN(eventTime)) return false;

  const now = Date.now();
  const age = now - eventTime;

  return age >= 0 && age <= maxAgeMs;
}
