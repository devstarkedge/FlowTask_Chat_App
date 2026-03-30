import { verifySignature, isTimestampFresh } from '../utils/hmac.js';
import env from '../config/environment.js';
import logger from '../utils/logger.js';
import { UnauthorizedError } from './errorHandler.js';

/**
 * Webhook signature verification middleware.
 * Implements HMAC-SHA256 verification and replay attack prevention
 * per FlowTask Integration Spec §2.4 and §6.7.
 *
 * Requires raw body to be available at req.rawBody (set via express.json verify callback).
 */
export function webhookVerifier(req, res, next) {
  const signature = req.headers['x-flowtask-signature'];
  const timestamp = req.headers['x-flowtask-timestamp'];
  const deliveryId = req.headers['x-flowtask-delivery-id'];
  const eventName = req.headers['x-flowtask-event'];

  // All headers are required
  if (!signature || !timestamp || !deliveryId || !eventName) {
    logger.warn('Webhook missing required headers', {
      hasSignature: !!signature,
      hasTimestamp: !!timestamp,
      hasDeliveryId: !!deliveryId,
      hasEventName: !!eventName,
      ip: req.ip,
    });
    return next(new UnauthorizedError('Missing webhook security headers'));
  }

  // Replay attack prevention — reject events older than 5 minutes
  if (!isTimestampFresh(timestamp)) {
    logger.warn('Webhook replay attack detected', {
      deliveryId,
      eventName,
      timestamp,
      serverTime: Math.floor(Date.now() / 1000),
      ip: req.ip,
    });
    return next(new UnauthorizedError('Webhook timestamp too old — possible replay attack'));
  }

  // HMAC signature verification
  const rawBody = req.rawBody;
  if (!rawBody) {
    logger.error('Raw body not available for webhook verification — check server JSON parser config');
    return next(new UnauthorizedError('Unable to verify webhook signature'));
  }

  const secret = env.FLOWTASK_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('FLOWTASK_WEBHOOK_SECRET not configured on ChatApp server');
    return next(new UnauthorizedError('Webhook verification not configured'));
  }

  if (!verifySignature(rawBody, signature, secret, timestamp)) {
    logger.warn('Webhook signature verification failed', {
      deliveryId,
      eventName,
      signatureReceived: signature?.substring(0, 12) + '...',
      rawBodyLength: rawBody?.length,
      timestampHeader: timestamp,
      secretConfigured: !!secret,
      secretLength: secret?.length,
      ip: req.ip,
    });
    return next(new UnauthorizedError('Invalid webhook signature'));
  }

  // Attach parsed webhook metadata to request
  req.webhook = {
    deliveryId,
    eventName,
    timestamp,
    eventVersion: req.headers['x-flowtask-event-version'] || '1.0',
  };

  next();
}
