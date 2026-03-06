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
 * Supports multi-workspace resolution via X-FlowTask-Workspace header.
 * Falls back to default "flowtask" workspace if no workspace specified.
 */

/**
 * Resolve the target workspace for an incoming webhook.
 * Resolution order:
 *   1. X-FlowTask-Workspace header (slug or ObjectId)
 *   2. Payload's workspaceId field
 *   3. Default workspace (flowtask)
 */
async function resolveWebhookWorkspace(req) {
  // Try header first (allows FlowTask to specify target workspace)
  const wsHeader = req.headers['x-flowtask-workspace'];
  if (wsHeader) {
    // Could be a slug or an ObjectId
    if (/^[0-9a-fA-F]{24}$/.test(wsHeader)) {
      const ws = await Workspace.findById(wsHeader);
      if (ws?.isActive) return ws;
    } else {
      const ws = await Workspace.findBySlug(wsHeader);
      if (ws) return ws;
    }
    logger.warn('Webhook workspace header resolved to nothing, falling back', {
      wsHeader,
    });
    // Fall through to payload / default — header was present but invalid
  }

  // Try payload workspaceId (only if header didn't resolve)
  const payloadWsId = req.body?.workspaceId || req.body?.data?.workspaceId;
  if (payloadWsId && /^[0-9a-fA-F]{24}$/.test(payloadWsId)) {
    const ws = await Workspace.findById(payloadWsId);
    if (ws?.isActive) return ws;
  }

  // Fall back to default workspace
  const defaultWs = await Workspace.findBySlug(env.DEFAULT_WORKSPACE_SLUG);
  if (!defaultWs) {
    logger.error('Default workspace not found', { slug: env.DEFAULT_WORKSPACE_SLUG });
  }
  return defaultWs || null;
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
    if (workspace) {
      payload._workspaceId = workspace._id.toString();
    }

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
