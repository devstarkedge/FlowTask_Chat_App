import asyncHandler from '../../middleware/asyncHandler.js';
import { webhookVerifier } from '../../middleware/webhookVerifier.js';
import eventProcessor from '../../services/eventProcessor.js';
import logger from '../../utils/logger.js';

/**
 * Webhook Controller — single entry point for all FlowTask webhook events.
 *
 * POST /api/chat/webhooks/flowtask
 *
 * Pipeline: HMAC verify → replay check → idempotency → dispatch → ack.
 * All event-specific logic lives in event handler modules registered on the EventBus.
 */

/**
 * Process incoming FlowTask webhook.
 * The verifyWebhook middleware has already validated HMAC + replay + delivery headers.
 */
export const handleFlowTaskWebhook = [
  webhookVerifier,
  asyncHandler(async (req, res) => {
    const { eventName, deliveryId, payload } = req.webhook;

    logger.info('Webhook received', { eventName, deliveryId });

    // Process through event pipeline (idempotency + dispatch)
    const result = await eventProcessor.process({
      eventName,
      deliveryId,
      payload,
    });

    res.status(result.statusCode || 200).json({
      success: true,
      status: result.status,
      deliveryId,
    });
  }),
];
