import eventBus from '../../../services/eventBus.js';
import Workspace from '../../workspaces/Workspace.model.js';
import logger from '../../../utils/logger.js';
import { FLOWTASK_EVENTS, SOCKET_EVENTS, mapFlowTaskPlanToChatPlan } from '../../../config/constants.js';
import { requireWorkspaceId } from '../../../utils/webhookEventGuard.js';
import { emitToWorkspace } from '../../../sockets/socketManager.js';

/**
 * Workspace Event Handler — keeps a ChatApp workspace's own metadata in
 * sync with its FlowTask counterpart after the initial eager-sync at
 * creation (workspaceChatSyncService.js on FlowTask's side).
 *
 * `name` is synced on WORKSPACE_UPDATED (slug isn't mutable on either side
 * post-creation, so there's nothing else to sync from that event) and
 * `plan` is synced on WORKSPACE_PLAN_CHANGED, fired by FlowTask's
 * subscriptionService.js#changeSubscription (the one funnel every
 * self-serve upgrade/downgrade AND Super Admin billing change goes
 * through).
 *
 * By the time either handler runs, `payload._workspaceId` is already the
 * CHATAPP workspace id — webhook.controller.js#resolveWebhookWorkspace
 * already translated FlowTask's own workspace id via WorkspaceMapping
 * before dispatch, same as every other event.
 */
export function registerWorkspaceEventHandlers() {
  eventBus.register(FLOWTASK_EVENTS.WORKSPACE_UPDATED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.WORKSPACE_UPDATED);
    if (!wsId) return;

    const { workspace, changes } = payload;
    if (!workspace?.name) return;

    await Workspace.findByIdAndUpdate(wsId, { $set: { name: workspace.name } });
    logger.info('ChatApp workspace name synced from FlowTask', {
      chatWorkspaceId: wsId,
      name: workspace.name,
      changes,
    });
  });

  eventBus.register(FLOWTASK_EVENTS.WORKSPACE_PLAN_CHANGED, async (payload) => {
    const wsId = requireWorkspaceId(payload, FLOWTASK_EVENTS.WORKSPACE_PLAN_CHANGED);
    if (!wsId) return;

    const flowTaskPlanSlug = payload.plan?.slug;
    if (!flowTaskPlanSlug) {
      logger.warn('WORKSPACE_PLAN_CHANGED: payload missing plan.slug, skipping', { chatWorkspaceId: wsId });
      return;
    }
    const chatPlan = mapFlowTaskPlanToChatPlan(flowTaskPlanSlug);

    await Workspace.findByIdAndUpdate(wsId, { $set: { plan: chatPlan } });
    emitToWorkspace(wsId, SOCKET_EVENTS.WORKSPACE_PLAN_CHANGED, { workspaceId: wsId, plan: chatPlan });
    logger.info('ChatApp workspace plan synced from FlowTask', {
      chatWorkspaceId: wsId,
      flowTaskPlan: flowTaskPlanSlug,
      plan: chatPlan,
    });
  });

  logger.info('Workspace event handlers registered');
}
