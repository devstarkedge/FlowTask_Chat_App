import crypto from 'crypto';
import axios from 'axios';
import env from '../../config/environment.js';
import { computeSignature } from '../../utils/hmac.js';
import WorkspaceMapping from './WorkspaceMapping.model.js';
import logger from '../../utils/logger.js';

/**
 * Reverse-sync: announces a newly-created ChatApp workspace to FlowTask so
 * it can provision its own counterpart (see FlowTask's
 * controllers/chatInboundController.js#handleWorkspaceCreated). Deliberately
 * a separate file from flowtask.service.js — that module is documented as
 * "the ONLY module allowed to make HTTP calls to FlowTask" for
 * user-token-forwarded reads; this is a fundamentally different kind of
 * call (server-to-server, HMAC-signed, fire-and-forget on failure), kept
 * distinct rather than blurring that boundary.
 *
 * Best-effort, non-blocking: ChatApp workspace creation must never fail or
 * hang because FlowTask is unreachable. On any failure the workspace simply
 * stays FlowTask-unlinked — the same state it would have been in before
 * this feature existed. There is no built-in retry here; a permanently
 * unlinked workspace is a documented, acceptable degradation, not a
 * correctness bug (nothing about ChatApp's own operation depends on it).
 *
 * Signs with the SAME shared secret used to verify inbound FlowTask
 * webhooks (env.FLOWTASK_WEBHOOK_SECRET) — the "one shared platform
 * secret" decision, reused symmetrically rather than minting a new one.
 */
const TIMEOUT_MS = 10_000;

export async function announceWorkspaceCreated({ workspace, creator }) {
  if (!env.FLOWTASK_ENABLED || !env.FLOWTASK_API_URL || !env.FLOWTASK_WEBHOOK_SECRET) {
    return null;
  }

  const payload = {
    chatWorkspaceId: workspace._id.toString(),
    chatWorkspaceSlug: workspace.slug,
    chatWorkspaceName: workspace.name,
    creator: {
      chatUserId: creator?._id?.toString() || null,
      name: creator?.name || null,
      email: creator?.email || null,
      avatar: creator?.avatar || null,
    },
  };

  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = computeSignature(`${timestamp}.${body}`, env.FLOWTASK_WEBHOOK_SECRET);
  const deliveryId = crypto.randomUUID();

  let response;
  try {
    response = await axios.post(
      `${env.FLOWTASK_API_URL.replace(/\/+$/, '')}/api/chat-integration/inbound/workspace-created`,
      body,
      {
        timeout: TIMEOUT_MS,
        transformRequest: [(data) => data],
        headers: {
          'Content-Type': 'application/json',
          'X-ChatApp-Signature': signature,
          'X-ChatApp-Timestamp': timestamp,
          'X-ChatApp-Delivery-Id': deliveryId,
          'X-ChatApp-Event': 'WORKSPACE_CREATED',
        },
      },
    );
  } catch (err) {
    logger.warn('Failed to announce new workspace to FlowTask — it will remain FlowTask-unlinked until retried', {
      workspaceId: workspace._id.toString(),
      deliveryId,
      error: err.message,
    });
    return null;
  }

  const flowTaskWorkspaceId = response.data?.data?.flowTaskWorkspaceId;
  if (!flowTaskWorkspaceId) {
    logger.warn('FlowTask accepted the workspace announcement but returned no flowTaskWorkspaceId', {
      workspaceId: workspace._id.toString(),
      deliveryId,
    });
    return null;
  }

  try {
    await WorkspaceMapping.create({
      chatWorkspaceId: workspace._id,
      flowTaskWorkspaceId,
      flowTaskWorkspaceSlug: response.data?.data?.flowTaskWorkspaceSlug || null,
      flowTaskWorkspaceName: response.data?.data?.flowTaskWorkspaceName || null,
      syncOrigin: 'sync_provisioned',
      createdByChatUserId: creator?._id || null,
    });
    logger.info('Workspace announced to FlowTask and mapping created', {
      chatWorkspaceId: workspace._id.toString(),
      flowTaskWorkspaceId,
    });
  } catch (err) {
    if (err?.code !== 11000) {
      logger.error('Failed to persist WorkspaceMapping after successful FlowTask announce', {
        workspaceId: workspace._id.toString(),
        flowTaskWorkspaceId,
        error: err.message,
      });
      return null;
    }
    // Concurrent duplicate announce already created it — idempotent no-op.
    logger.info('WorkspaceMapping already exists (concurrent announce) — no-op', {
      workspaceId: workspace._id.toString(),
      flowTaskWorkspaceId,
    });
  }

  return { flowTaskWorkspaceId };
}

export default { announceWorkspaceCreated };
