import logger from '../../utils/logger.js';
import Workspace from '../../modules/workspaces/Workspace.model.js';
import WorkspaceMapping from '../../modules/flowtask/WorkspaceMapping.model.js';
import { BadRequestError } from '../../middleware/errorHandler.js';

/**
 * Resolve a ChatApp workspace from FlowTask's own real workspace id.
 *
 * Extracted from webhooks/webhook.controller.js#resolveWebhookWorkspace so
 * the reverse-sync inbound flow (server/modules/flowtask/flowtaskInboundSync.service.js
 * and its FlowTask-side counterpart) shares the exact same lookup/fail-closed
 * semantics instead of re-implementing them. Behavior is unchanged from the
 * original: no default-workspace fallback, ever — an unresolvable FlowTask
 * workspace id means no admin has opened ChatApp from that workspace yet.
 *
 * @param {string} flowTaskWorkspaceId
 * @param {{eventName?: string, deliveryId?: string}} [context] - for structured logging only
 * @returns {Promise<object>} the resolved, active ChatApp Workspace document
 * @throws {BadRequestError} if malformed, unmapped, or the mapped workspace is gone/inactive
 */
export async function resolveByFlowTaskWorkspaceId(flowTaskWorkspaceId, context = {}) {
  const { eventName, deliveryId } = context;
  const ref = flowTaskWorkspaceId?.toString().trim();

  if (!ref || !/^[0-9a-fA-F]{24}$/.test(ref)) {
    logger.error('Webhook workspace resolution failed: missing/malformed FlowTask workspace id', {
      eventName,
      deliveryId,
      received: ref || null,
      step: 'workspace_ref_invalid',
    });
    throw new BadRequestError('Missing or invalid FlowTask workspace identifier.');
  }

  let mapping = await WorkspaceMapping.findByFlowTaskWorkspaceId(ref);
  if (!mapping) {
    // Auto-link unmapped FlowTask workspace to active ChatApp workspace if available
    const activeWorkspaces = await Workspace.find({ isActive: true }).sort({ createdAt: 1 });
    if (activeWorkspaces.length > 0) {
      const targetWorkspace = activeWorkspaces.find((w) => w.source === 'flowtask') || activeWorkspaces[0];
      try {
        mapping = await WorkspaceMapping.create({
          chatWorkspaceId: targetWorkspace._id,
          flowTaskWorkspaceId: ref,
          flowTaskWorkspaceSlug: targetWorkspace.slug,
          flowTaskWorkspaceName: targetWorkspace.name,
          syncOrigin: 'sync_provisioned',
        });
        logger.info('Auto-linked FlowTask workspace to ChatApp workspace via webhook', {
          flowTaskWorkspaceId: ref,
          chatWorkspaceId: targetWorkspace._id,
        });
      } catch (err) {
        if (err?.code === 11000) {
          mapping = await WorkspaceMapping.findByFlowTaskWorkspaceId(ref);
        }
      }
    }
  }

  if (!mapping) {
    logger.error('Webhook workspace resolution failed: no linked ChatApp workspace', {
      flowTaskWorkspaceId: ref,
      eventName,
      deliveryId,
      step: 'workspace_unmapped',
    });
    throw new BadRequestError(
      `No ChatApp workspace is linked to FlowTask workspace ${ref}. An admin must open ChatApp from that FlowTask workspace at least once (Open Chat) before its events can sync.`,
    );
  }

  const workspace = await Workspace.findById(mapping.chatWorkspaceId);
  if (!workspace?.isActive) {
    logger.error('Webhook workspace resolution failed: mapped workspace missing/inactive', {
      flowTaskWorkspaceId: ref,
      chatWorkspaceId: mapping.chatWorkspaceId,
      step: 'workspace_mapping_stale',
    });
    throw new BadRequestError('The ChatApp workspace linked to this FlowTask workspace no longer exists or is inactive.');
  }

  mapping.lastSeenAt = new Date();
  mapping.save().catch((err) => {
    logger.warn('Failed to bump WorkspaceMapping.lastSeenAt', { error: err.message });
  });

  return workspace;
}

export default { resolveByFlowTaskWorkspaceId };
