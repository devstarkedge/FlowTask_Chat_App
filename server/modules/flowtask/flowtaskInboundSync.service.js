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
 * this feature existed. Metadata updates retry transient delivery failures;
 * workspace creation keeps its original single-attempt behavior.
 *
 * Signs with the SAME shared secret used to verify inbound FlowTask
 * webhooks (env.FLOWTASK_WEBHOOK_SECRET) — the "one shared platform
 * secret" decision, reused symmetrically rather than minting a new one.
 */
const TIMEOUT_MS = 10_000;
const UPDATE_RETRY_DELAYS_MS = [250, 1_000];

async function postSignedWorkspaceEvent({ path, eventName, payload, deliveryId = crypto.randomUUID() }) {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = computeSignature(`${timestamp}.${body}`, env.FLOWTASK_WEBHOOK_SECRET);

  const response = await axios.post(
    `${env.FLOWTASK_API_URL.replace(/\/+$/, '')}${path}`,
    body,
    {
      timeout: TIMEOUT_MS,
      transformRequest: [(data) => data],
      headers: {
        'Content-Type': 'application/json',
        'X-ChatApp-Signature': signature,
        'X-ChatApp-Timestamp': timestamp,
        'X-ChatApp-Delivery-Id': deliveryId,
        'X-ChatApp-Event': eventName,
      },
    },
  );

  return { response, deliveryId };
}

function isRetryableDeliveryError(error) {
  const status = error?.response?.status;
  return !status || status === 429 || status >= 500;
}

async function postWorkspaceUpdateWithRetry(options) {
  const deliveryId = crypto.randomUUID();
  let lastError;

  for (let attempt = 0; attempt <= UPDATE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await postSignedWorkspaceEvent({ ...options, deliveryId });
    } catch (error) {
      lastError = error;
      if (!isRetryableDeliveryError(error) || attempt === UPDATE_RETRY_DELAYS_MS.length) break;
      await new Promise((resolve) => setTimeout(resolve, UPDATE_RETRY_DELAYS_MS[attempt]));
    }
  }

  throw lastError;
}

function getChatWebhookUrl() {
  if (!env.BASE_URL) return null;
  try {
    return new URL('/api/chat/webhooks/flowtask', env.BASE_URL).toString();
  } catch {
    return null;
  }
}

export async function announceWorkspaceCreated({ workspace, creator }) {
  if (!env.FLOWTASK_ENABLED || !env.FLOWTASK_API_URL || !env.FLOWTASK_WEBHOOK_SECRET) {
    return null;
  }

  const payload = {
    chatWorkspaceId: workspace._id.toString(),
    chatWorkspaceSlug: workspace.slug,
    chatWorkspaceName: workspace.name,
    chatWorkspaceLogo: workspace.logo || null,
    creator: {
      chatUserId: creator?._id?.toString() || null,
      name: creator?.name || null,
      email: creator?.email || null,
      avatar: creator?.avatar || null,
    },
  };

  let response;
  let deliveryId;
  try {
    ({ response, deliveryId } = await postSignedWorkspaceEvent({
      path: '/api/chat-integration/inbound/workspace-created',
      eventName: 'WORKSPACE_CREATED',
      payload,
    }));
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

/**
 * Makes FlowTask's copy of the workspace mapping self-healing. Browser SSO
 * creates/resolves the pair inside ChatApp, so this signed callback returns
 * ChatApp's id to FlowTask and also supplies the correct webhook endpoint.
 */
export async function announceWorkspaceLinked({ workspace, flowTaskWorkspaceId }) {
  if (!env.FLOWTASK_ENABLED || !env.FLOWTASK_API_URL || !env.FLOWTASK_WEBHOOK_SECRET) {
    return null;
  }
  if (!workspace?._id || !flowTaskWorkspaceId) return null;

  const payload = {
    chatWorkspaceId: workspace._id.toString(),
    chatWorkspaceSlug: workspace.slug || null,
    flowTaskWorkspaceId: flowTaskWorkspaceId.toString(),
    chatWebhookUrl: getChatWebhookUrl(),
  };

  try {
    const { deliveryId } = await postWorkspaceUpdateWithRetry({
      path: '/api/chat-integration/inbound/workspace-linked',
      eventName: 'WORKSPACE_LINKED',
      payload,
    });
    logger.info('FlowTask workspace mapping reconciled from ChatApp', {
      chatWorkspaceId: payload.chatWorkspaceId,
      flowTaskWorkspaceId: payload.flowTaskWorkspaceId,
      deliveryId,
    });
    return { flowTaskWorkspaceId: payload.flowTaskWorkspaceId };
  } catch (error) {
    logger.warn('Failed to reconcile FlowTask workspace mapping from ChatApp', {
      chatWorkspaceId: payload.chatWorkspaceId,
      flowTaskWorkspaceId: payload.flowTaskWorkspaceId,
      error: error.message,
    });
    return null;
  }
}

/**
 * Push shared workspace metadata from ChatApp to the mapped FlowTask
 * workspace. FlowTask writes this update without dispatching its outbound
 * workspace hook, preventing a sync ping-pong loop.
 */
export async function announceWorkspaceUpdated({ workspace, changes = {} }) {
  if (!env.FLOWTASK_ENABLED || !env.FLOWTASK_API_URL || !env.FLOWTASK_WEBHOOK_SECRET) {
    return null;
  }

  const sharedChanges = Object.fromEntries(
    Object.entries(changes).filter(([field]) => field === 'name' || field === 'logo'),
  );
  if (Object.keys(sharedChanges).length === 0) return null;

  try {
    const mapping = await WorkspaceMapping.findOne({
      chatWorkspaceId: workspace._id,
      status: 'active',
    }).lean();
    if (!mapping) return null;

    const workspaceMetadata = {};
    if (sharedChanges.name) workspaceMetadata.name = workspace.name;
    if (sharedChanges.logo) workspaceMetadata.logo = workspace.logo || null;

    const payload = {
      chatWorkspaceId: workspace._id.toString(),
      chatWorkspaceSlug: workspace.slug || null,
      flowTaskWorkspaceId: mapping.flowTaskWorkspaceId,
      chatWebhookUrl: getChatWebhookUrl(),
      workspace: workspaceMetadata,
      changes: sharedChanges,
    };

    const { deliveryId: updateDeliveryId } = await postWorkspaceUpdateWithRetry({
      path: '/api/chat-integration/inbound/workspace-updated',
      eventName: 'WORKSPACE_UPDATED',
      payload,
    });
    logger.info('Workspace metadata synced from ChatApp to FlowTask', {
      chatWorkspaceId: workspace._id.toString(),
      flowTaskWorkspaceId: mapping.flowTaskWorkspaceId,
      deliveryId: updateDeliveryId,
      fields: Object.keys(sharedChanges),
    });
    return { flowTaskWorkspaceId: mapping.flowTaskWorkspaceId };
  } catch (err) {
    logger.warn('Failed to sync workspace metadata from ChatApp to FlowTask', {
      chatWorkspaceId: workspace._id.toString(),
      error: err.message,
    });
    return null;
  }
}

export default { announceWorkspaceCreated, announceWorkspaceLinked, announceWorkspaceUpdated };
