import logger from './logger.js';

/**
 * Shared "does this payload carry a resolved workspace id" guard for
 * FlowTask webhook event handlers.
 *
 * Previously duplicated independently in projectEventHandler.js, taskEventHandler.js,
 * userEventHandler.js, and integrationEventHandler.js (each with a slightly
 * different fallback chain) — this is the canonical version, using
 * taskEventHandler.js's broader `_workspaceId || workspaceId || data.workspaceId`
 * chain since it's a strict superset of the other files' simpler
 * `payload?._workspaceId` check. In practice `_workspaceId` is always what
 * webhook.controller.js#resolveWebhookWorkspace sets before dispatch, so
 * behavior is unchanged for every existing call site.
 */
export function requireWorkspaceId(payload, eventName) {
  const wsId = payload?._workspaceId || payload?.workspaceId || payload?.data?.workspaceId;
  if (!wsId) {
    logger.warn(`${eventName}: missing workspace id, skipping event`);
    return null;
  }
  return wsId;
}

export default { requireWorkspaceId };
