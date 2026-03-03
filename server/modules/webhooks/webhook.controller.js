import asyncHandler from '../../middleware/asyncHandler.js';
import { webhookVerifier } from '../../middleware/webhookVerifier.js';
import eventProcessor from '../../services/eventProcessor.js';
import logger from '../../utils/logger.js';
import Workspace from '../workspaces/Workspace.model.js';
import env from '../../config/environment.js';

/**
 * Webhook Controller — single entry point for all FlowTask webhook events.
 *
 * POST /api/chat/webhooks/flowtask
 *
 * Pipeline: HMAC verify → replay check → idempotency → dispatch → ack.
 * All event-specific logic lives in event handler modules registered on the EventBus.
 *
 * All FlowTask webhooks are routed to the default "flowtask" workspace.
 */

/**
 * Process incoming FlowTask webhook.
 * The verifyWebhook middleware has already validated HMAC + replay + delivery headers.
 */
export const handleFlowTaskWebhook = [
  webhookVerifier,
  asyncHandler(async (req, res) => {
    const { eventName, deliveryId, eventVersion } = req.webhook;
    const payload = req.body; // Webhook body — req.webhook only has headers/metadata

    // Resolve default workspace for FlowTask webhooks
    const defaultWorkspace = await Workspace.findBySlug(env.DEFAULT_WORKSPACE_SLUG);
    if (defaultWorkspace) {
      payload._workspaceId = defaultWorkspace._id.toString();
    }

    logger.info('Webhook received', { eventName, deliveryId, workspaceId: payload._workspaceId });

    // Process through event pipeline (idempotency + dispatch)
    const result = await eventProcessor.process({
      eventName,
      deliveryId,
      eventVersion,
      payload,
    });

    res.status(result.statusCode || 200).json({
      success: true,
      status: result.status,
      deliveryId,
    });
  }),
];
