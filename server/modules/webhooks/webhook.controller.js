import asyncHandler from '../../middleware/asyncHandler.js';
import { webhookVerifier } from '../../middleware/webhookVerifier.js';
import eventProcessor from '../../services/eventProcessor.js';
import logger from '../../utils/logger.js';
import { resolveByFlowTaskWorkspaceId } from '../../services/chat/workspaceMappingResolver.js';

/**
 * Webhook Controller — single entry point for all FlowTask webhook events.
 *
 * POST /api/chat/webhooks/flowtask
 *
 * Pipeline: HMAC verify → replay check → idempotency → dispatch → ack.
 * All event-specific logic lives in event handler modules registered on the EventBus.
 *
 * Supports multi-workspace resolution via X-FlowTask-Workspace header
 * and payload workspaceId, with strict validation.
 */

/**
 * Resolve the target ChatApp workspace for an incoming webhook.
 * FlowTask always sends ITS OWN real workspace ObjectId (never a ChatApp
 * id/slug) — as the X-FlowTask-Workspace header and/or payload.workspaceId.
 * The actual lookup/fail-closed logic lives in workspaceMappingResolver.js,
 * shared with the reverse-sync inbound flow.
 */
async function resolveWebhookWorkspace(req) {
  const ref = req.headers['x-flowtask-workspace'] || req.body?.workspaceId || req.body?.data?.workspaceId;
  return resolveByFlowTaskWorkspaceId(ref, {
    eventName: req.webhook?.eventName,
    deliveryId: req.webhook?.deliveryId,
  });
}

/**
 * Process incoming FlowTask webhook.
 * Returns 202 Accepted immediately, processes asynchronously.
 * The verifyWebhook middleware has already validated HMAC + replay + delivery headers.
 */
export const handleFlowTaskWebhook = [
  webhookVerifier,
  asyncHandler(async (req, res) => {
    const { eventName, deliveryId, eventVersion } = req.webhook;
    const payload = req.body;

    // Resolve target workspace (supports multi-workspace)
    const workspace = await resolveWebhookWorkspace(req);
    payload._workspaceId = workspace._id.toString();

    logger.info('Webhook received', { eventName, deliveryId, workspaceId: payload._workspaceId });

    // Return 202 immediately — process asynchronously to avoid timeout
    res.status(202).json({
      success: true,
      status: 'accepted',
      deliveryId,
    });

    // Process in background (no await — fire and forget)
    eventProcessor.process({
      eventName,
      deliveryId,
      eventVersion,
      payload,
    }).catch((error) => {
      logger.error('Background webhook processing failed', {
        deliveryId,
        eventName,
        error: error.message,
      });
    });
  }),
];
