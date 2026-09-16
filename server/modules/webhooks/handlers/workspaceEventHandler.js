import eventBus from '../../../services/eventBus.js';
import Workspace from '../../workspaces/Workspace.model.js';
import logger from '../../../utils/logger.js';
import { FLOWTASK_EVENTS, SOCKET_EVENTS, mapFlowTaskPlanToChatPlan } from '../../../config/constants.js';
import { requireWorkspaceId } from '../../../utils/webhookEventGuard.js';
import { emitToWorkspace } from '../../../sockets/socketManager.js';
import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';

/**
 * Workspace Event Handler — keeps a ChatApp workspace's own metadata in
 * sync with its FlowTask counterpart after the initial eager-sync at
 * creation (workspaceChatSyncService.js on FlowTask's side).
 *
 * Shared metadata (`name` and `logo`) is synced on WORKSPACE_UPDATED and
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
    if (!workspace) return;

    const updates = {};
    if (typeof workspace.name === 'string' && workspace.name.trim()) {
      updates.name = workspace.name.trim();
    }
    if (typeof workspace.logo === 'string' || workspace.logo === null) {
      if (changes?.logo?.new && typeof changes.logo.new === 'string') {
        try {
          const response = await axios.get(changes.logo.new, { responseType: 'arraybuffer' });
          const buffer = Buffer.from(response.data);
          const uploadResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { folder: `chat-app/workspaces/${wsId}/logo`, resource_type: 'image' },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            stream.end(buffer);
          });
          updates.logo = uploadResult.secure_url;
        } catch (error) {
          logger.error('Failed to transfer workspace logo to ChatApp Cloudinary, falling back to original URL', { error: error.message, workspaceId: wsId });
          updates.logo = workspace.logo?.trim() || null;
        }
      } else {
        updates.logo = workspace.logo?.trim() || null;
      }
    }
    if (Object.keys(updates).length === 0) return;

    const updated = await Workspace.findByIdAndUpdate(
      wsId,
      { $set: updates },
      { returnDocument: 'after', runValidators: true },
    );
    if (!updated) return;

    emitToWorkspace(wsId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
      workspaceId: wsId,
      workspace: updated.toObject(),
      changes,
    });
    logger.info('ChatApp workspace metadata synced from FlowTask', {
      chatWorkspaceId: wsId,
      fields: Object.keys(updates),
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
