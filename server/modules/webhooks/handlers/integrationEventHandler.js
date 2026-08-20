import eventBus from '../../../services/eventBus.js';
import syncService from '../../flowtask/sync.service.js';
import workspaceRepository from '../../workspaces/workspace.repository.js';
import logger from '../../../utils/logger.js';
import { requireWorkspaceId } from '../../../utils/webhookEventGuard.js';

/**
 * Integration Event Handler — handles meta-events like sync requests
 * and connectivity tests dispatched from FlowTask admin panel.
 *
 * Events:
 *   SYNC_REQUESTED    — Admin triggered full user + board sync
 *   INTEGRATION_TEST  — Connectivity test ping
 */

export function registerIntegrationEventHandlers() {
  eventBus.register('SYNC_REQUESTED', async (payload) => {
    const wsId = requireWorkspaceId(payload, 'SYNC_REQUESTED');
    if (!wsId) return;

    logger.info('Sync requested from FlowTask', {
      requestedBy: payload.requestedBy,
      workspaceId: wsId,
    });

    const workspace = await workspaceRepository.findById(wsId);
    if (!workspace) {
      logger.warn('SYNC_REQUESTED: workspace not found', { workspaceId: wsId });
      return;
    }

    // Note: reconcile needs a FlowTask admin token.
    // In a real deployment, the workspace settings would store an API token,
    // or the sync request payload would include one from the triggering admin.
    // For now, log and skip if no token is available.
    logger.info('Sync requested — workspace identified, sync should be triggered with admin token', {
      workspaceId: wsId,
    });
  }, 'integrationSyncHandler');

  eventBus.register('INTEGRATION_TEST', async (payload) => {
    const wsId = requireWorkspaceId(payload, 'INTEGRATION_TEST');
    if (!wsId) return;

    logger.info('Integration test received from FlowTask', {
      message: payload.message,
      triggeredBy: payload.triggeredBy,
      timestamp: payload.timestamp,
      workspaceId: wsId,
    });
  }, 'integrationTestHandler');
}
