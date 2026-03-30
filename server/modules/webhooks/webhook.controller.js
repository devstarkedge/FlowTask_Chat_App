import asyncHandler from '../../middleware/asyncHandler.js';
import { webhookVerifier } from '../../middleware/webhookVerifier.js';
import eventProcessor from '../../services/eventProcessor.js';
import logger from '../../utils/logger.js';
import Workspace from '../workspaces/Workspace.model.js';
import workspaceService from '../workspaces/workspace.service.js';
import { BadRequestError } from '../../middleware/errorHandler.js';

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

async function resolveWorkspaceRef(reference) {
  if (!reference) return null;

  if (/^[0-9a-fA-F]{24}$/.test(reference)) {
    const workspace = await Workspace.findById(reference);
    if (workspace?.isActive) return workspace;
    return null;
  }

  const workspace = await Workspace.findBySlug(reference);
  return workspace?.isActive ? workspace : null;
}

/**
 * Resolve the target workspace for an incoming webhook.
 * FlowTask sends a workspace slug (e.g., 'flowtask') as workspaceId.
 * Resolution order:
 *   1. X-FlowTask-Workspace header (slug or ObjectId)
 *   2. Payload's workspaceId field
 *   3. Fall back to default workspace
 */
async function resolveWebhookWorkspace(req) {
  const wsHeader = req.headers['x-flowtask-workspace']?.toString().trim();
  const payloadWorkspaceRef = (req.body?.workspaceId || req.body?.data?.workspaceId)?.toString()?.trim();

  let workspace = null;

  if (wsHeader) {
    workspace = await resolveWorkspaceRef(wsHeader);
  }

  if (!workspace && payloadWorkspaceRef) {
    workspace = await resolveWorkspaceRef(payloadWorkspaceRef);
  }

  // Fallback to default workspace
  if (!workspace) {
    const defaultWorkspace = await workspaceService.ensureDefaultWorkspace();
    if (defaultWorkspace?.isActive !== false) {
      logger.info('Webhook workspace resolved to default workspace', {
        wsHeader,
        payloadWorkspaceRef,
        defaultWorkspaceId: defaultWorkspace._id,
        step: 'workspace_fallback_default',
      });
      workspace = defaultWorkspace;
    }
  }

  if (!workspace) {
    throw new BadRequestError('Could not resolve workspace for webhook (no valid reference or default workspace).');
  }

  return workspace;
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
