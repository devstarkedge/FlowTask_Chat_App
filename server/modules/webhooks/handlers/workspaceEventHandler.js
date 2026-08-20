import eventBus from '../../../services/eventBus.js';
import Workspace from '../../workspaces/Workspace.model.js';
import logger from '../../../utils/logger.js';
import { FLOWTASK_EVENTS } from '../../../config/constants.js';
import { requireWorkspaceId } from '../../../utils/webhookEventGuard.js';

/**
 * Workspace Event Handler — keeps a ChatApp workspace's own metadata in
 * sync with its FlowTask counterpart after the initial eager-sync at
 * creation (workspaceChatSyncService.js on FlowTask's side).
 *
 * Only `name` is synced — FlowTask's updateWorkspace doesn't expose
 * slug/plan changes (slug/plan aren't mutable there post-creation), and
 * ChatApp's own workspace.service.js#updateWorkspace deliberately treats
 * slug as immutable ("too many side effects") — so there is nothing else
 * to keep dynamically in sync here today.
 *
 * By the time this handler runs, `payload._workspaceId` is already the
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

  logger.info('Workspace event handlers registered');
}
