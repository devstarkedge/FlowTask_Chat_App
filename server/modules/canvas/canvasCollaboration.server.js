import { Server } from "@hocuspocus/server";
import { Redis } from "@hocuspocus/extension-redis";
import IORedis from "ioredis";
import * as Y from "yjs";

import env from "../../config/environment.js";
import logger from "../../utils/logger.js";
import tokenService from "../auth/token.service.js";
import userRepository from "../users/user.repository.js";
import WorkspaceMembership from "../workspaces/WorkspaceMembership.model.js";
import Canvas from "./canvas.model.js";

let collaborationServer = null;
let collaborationRedis = null;

function parseCanvasDocumentName(documentName) {
  const baseName = String(documentName || "").split("\0")[0];
  const [, canvasId] = baseName.match(/^canvas:([0-9a-fA-F]{24})$/) || [];
  return canvasId || null;
}

async function resolveUserFromToken(token) {
  if (!token) return null;

  try {
    const decoded = tokenService.verifyAccessToken(token);
    if (decoded?.id && decoded.type === "access") {
      return userRepository.findById(decoded.id);
    }
  } catch {
    logger.debug('[CANVAS COLLAB] verifyAccessToken failed or token not access-type');
    // Try FlowTask token below when enabled.
  }

  if (env.FLOWTASK_ENABLED) {
    try {
      const decoded = tokenService.verifyFlowTaskToken(token);
      if (decoded?.id) {
        return userRepository.findByFlowTaskId(decoded.id);
      }
    } catch {
      logger.debug('[CANVAS COLLAB] verifyFlowTaskToken failed');
      return null;
    }
  }

  return null;
}

async function authenticateCanvasSession({ token, documentName, requestParameters }) {
  logger.debug('[CANVAS COLLAB] authenticateCanvasSession start', {
    tokenPresent: Boolean(token),
    documentName,
    requestParameters: (function () {
      try {
        if (!requestParameters) return null;
        if (typeof requestParameters.entries === 'function') return Array.from(requestParameters.entries());
        if (typeof requestParameters === 'object') return Object.entries(requestParameters);
        return String(requestParameters);
      } catch (e) {
        return String(requestParameters);
      }
    }()),
  });

  // Support token delivered in multiple places depending on client/provider
  // - payload.token (preferred)
  // - requestParameters.get('token') (query param fallback)
  // - requestParameters entries with keys like 'authorization' or 'Authorization'
  let handshakeToken = token;
  try {
    if (!handshakeToken && requestParameters) {
      // Map-like getter (preferred)
      if (typeof requestParameters.get === 'function') {
        handshakeToken = requestParameters.get('token') || requestParameters.get('authorization') || requestParameters.get('Authorization') || handshakeToken;
      }

      // Fallback: iterate entries for Map-like or plain objects
      if (!handshakeToken) {
        if (typeof requestParameters.entries === 'function') {
          for (const [k, v] of requestParameters.entries()) {
            if (!v) continue;
            const lk = String(k).toLowerCase();
            if (lk === 'token' || lk === 'authorization' || lk === 'auth') {
              handshakeToken = v;
              break;
            }
          }
        } else if (typeof requestParameters === 'object') {
          for (const k of Object.keys(requestParameters)) {
            const v = requestParameters[k];
            if (!v) continue;
            const lk = String(k).toLowerCase();
            if (lk === 'token' || lk === 'authorization' || lk === 'auth') {
              handshakeToken = v;
              break;
            }
          }
        }
      }
    }
  } catch (err) {
    logger.debug('[CANVAS COLLAB] token extraction from requestParameters failed', { err: err?.message || err });
  }

  if (!handshakeToken) {
    logger.warn('[CANVAS COLLAB] no token found in handshake payload', { documentName, requestParameters: requestParameters ? Array.from(requestParameters.entries()) : null });
  } else {
    logger.debug('[CANVAS COLLAB] handshake token present (sample)', { sample: String(handshakeToken).slice(0, 8) + '...' });
  }
  const canvasId = parseCanvasDocumentName(documentName);
  // Extract workspaceId robustly from requestParameters (Map-like or plain object)
  let workspaceId = null;
  try {
    if (requestParameters) {
      if (typeof requestParameters.get === 'function') {
        workspaceId = requestParameters.get('workspaceId') || requestParameters.get('workspaceid') || requestParameters.get('workspace');
      }

      if (!workspaceId) {
        if (typeof requestParameters.entries === 'function') {
          for (const [k, v] of requestParameters.entries()) {
            if (!v) continue;
            const lk = String(k).toLowerCase();
            if (lk === 'workspaceid' || lk === 'workspace' || lk === 'workspace_id') {
              workspaceId = v;
              break;
            }
          }
        } else if (typeof requestParameters === 'object') {
          for (const k of Object.keys(requestParameters)) {
            const v = requestParameters[k];
            if (!v) continue;
            const lk = String(k).toLowerCase();
            if (lk === 'workspaceid' || lk === 'workspace' || lk === 'workspace_id') {
              workspaceId = v;
              break;
            }
          }
        }
      }
    }
  } catch (err) {
    logger.debug('[CANVAS COLLAB] workspaceId extraction from requestParameters failed', { err: err?.message || err });
  }

  if (!canvasId) {
    throw new Error("Invalid canvas document");
  }

  // If the client did not provide a valid workspaceId, try to derive it
  // from the canvas document as a safe fallback. This helps support
  // clients that may omit the workspace context during the WS handshake.
  if (!workspaceId || !/^[0-9a-fA-F]{24}$/.test(workspaceId)) {
    try {
      const foundCanvas = await Canvas.findById(canvasId).select('workspaceId').lean();
      if (foundCanvas?.workspaceId) {
        workspaceId = String(foundCanvas.workspaceId);
        logger.debug('[CANVAS COLLAB] derived workspaceId from canvas', { canvasId, workspaceId });
      }
    } catch (err) {
      logger.debug('[CANVAS COLLAB] failed to derive workspaceId from canvas', { err: err?.message || err });
    }
  }

  if (!workspaceId || !/^[0-9a-fA-F]{24}$/.test(workspaceId)) {
    throw new Error("Workspace context is required");
  }

  const user = await resolveUserFromToken(handshakeToken);
  logger.debug('[CANVAS COLLAB] resolved user from token', { userId: user?._id });
  if (!user || !user.isActive) {
    throw new Error("Invalid or expired token");
  }

  const membership = await WorkspaceMembership.findOne({
    userId: user._id,
    workspaceId,
    isActive: true,
  }).lean();

  if (!membership) {
    logger.warn('[CANVAS COLLAB] membership check failed', { userId: user._id, workspaceId });
    throw new Error("Not a member of this workspace");
  }

  const canvas = await Canvas.findOne({ _id: canvasId, workspaceId })
    .select("_id workspaceId channelId title permissions")
    .lean();

  if (!canvas) {
    logger.warn('[CANVAS COLLAB] canvas not found or not in workspace', { canvasId, workspaceId });
    throw new Error("Canvas not found");
  }

  // Enforce canvas-level permission rules
  const perms = canvas.permissions || {};
  if (perms.visibility === 'private') {
    const allowedUserIds = (perms.allowedUserIds || []).map((id) => String(id));
    const allowedRoleIds = perms.allowedRoleIds || [];
    const userIdStr = String(user._id);
    const memberRole = membership?.role || null;

    if (!allowedUserIds.includes(userIdStr) && !allowedRoleIds.includes(memberRole)) {
      logger.warn('[CANVAS COLLAB] access denied by canvas permissions', { canvasId, workspaceId, userId: userIdStr, role: memberRole });
      throw new Error('Access to this canvas is restricted');
    }
  }

  return {
    canvasId,
    workspaceId,
    channelId: canvas.channelId?.toString(),
    userId: user._id.toString(),
    userName: user.name,
    userAvatar: user.avatar || null,
  };
}

async function loadCanvasDocument({ documentName, document, context }) {
  const canvasId = context?.canvasId || parseCanvasDocumentName(documentName);
  if (!canvasId) return;

  const canvas = await Canvas.findById(canvasId)
    .select("+collaborationState")
    .lean();

  if (!canvas?.collaborationState?.length) {
    logger.debug('[CANVAS COLLAB] no stored state for canvas — starting fresh', { canvasId });
    return;
  }

  const bytes = canvas.collaborationState.length;
  Y.applyUpdate(document, new Uint8Array(canvas.collaborationState));
  logger.debug('[CANVAS COLLAB] applied stored state', { canvasId, bytes });
}

async function storeCanvasDocument({ documentName, document, lastContext }) {
  const canvasId = lastContext?.canvasId || parseCanvasDocumentName(documentName);
  if (!canvasId) return;

  const collaborationState = Buffer.from(Y.encodeStateAsUpdate(document));
  logger.debug('[CANVAS COLLAB] persisting state', { canvasId, bytes: collaborationState.length, userId: lastContext?.userId });

  await Canvas.findByIdAndUpdate(canvasId, {
    $set: {
      collaborationState,
      updatedBy: lastContext?.userId,
      lastEditedBy: lastContext?.userId,
      updatedAt: new Date(),
    },
  });
}

function buildRedisExtensions() {
  if (!env.REDIS_URL) return [];

  collaborationRedis = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

  return [
    new Redis({
      redis: collaborationRedis,
      prefix: "flowtask:canvas:collab",
    }),
  ];
}

export async function startCanvasCollaborationServer() {
  if (!env.CANVAS_COLLAB_ENABLED) {
    logger.info("[CANVAS COLLAB] Hocuspocus server disabled");
    return null;
  }

  if (collaborationServer) return collaborationServer;

  collaborationServer = new Server({
    // Do not set `port` here to avoid automatic binding by the
    // constructor. We call `listen()` explicitly below which
    // prevents double-binding / EADDRINUSE when the constructor
    // would otherwise already bind the socket.
    quiet: true,
    debounce: env.CANVAS_COLLAB_DEBOUNCE_MS,
    maxDebounce: env.CANVAS_COLLAB_MAX_DEBOUNCE_MS,
    timeout: 30000,
    extensions: buildRedisExtensions(),
    async onAuthenticate(payload) {
      try {
        logger.debug('[CANVAS COLLAB] onAuthenticate received', {
          tokenPresent: Boolean(payload?.token),
          tokenSample: payload?.token ? String(payload.token).slice(0, 8) + '...' : null,
          documentName: payload?.documentName,
          requestParameters: (function () {
            try {
              const rp = payload?.requestParameters;
              if (!rp) return null;
              if (typeof rp.entries === 'function') return Array.from(rp.entries());
              if (typeof rp === 'object') return Object.entries(rp);
              return String(rp);
            } catch (e) {
              return String(payload?.requestParameters);
            }
          }()),
        });

        const ctx = await authenticateCanvasSession(payload);
        logger.debug('[CANVAS COLLAB] authentication success', {
          canvasId: ctx?.canvasId,
          workspaceId: ctx?.workspaceId,
          userId: ctx?.userId,
        });
        return ctx;
      } catch (err) {
        logger.warn('[CANVAS COLLAB] authentication failed', {
          reason: err?.message || err,
          documentName: payload?.documentName,
          tokenPresent: Boolean(payload?.token),
        });
          // Safely serialize requestParameters for logs (Map-like or plain object)
          let rpSample = null;
          try {
            const rp = payload?.requestParameters;
            if (!rp) rpSample = null;
            else if (typeof rp.entries === 'function') rpSample = Array.from(rp.entries());
            else if (typeof rp === 'object') rpSample = Object.entries(rp);
            else rpSample = String(rp);
          } catch (e) {
            rpSample = String(payload?.requestParameters);
          }

          logger.warn('[CANVAS COLLAB] authentication failed', {
            reason: err?.message || err,
            stack: err?.stack || null,
            documentName: payload?.documentName,
            tokenPresent: Boolean(payload?.token),
            requestParameters: rpSample,
          });
          throw err;
      }
    },
    async onLoadDocument(payload) {
      const canvasId = parseCanvasDocumentName(payload?.documentName);
      logger.debug('[CANVAS COLLAB] loading document', { canvasId });
      return loadCanvasDocument(payload);
    },
    async onStoreDocument(payload) {
      const canvasId = parseCanvasDocumentName(payload?.documentName);
      logger.debug('[CANVAS COLLAB] storing document', { canvasId });
      return storeCanvasDocument(payload);
    },
    onConnect({ documentName, context, clientsCount }) {
      logger.info('[CANVAS COLLAB] client connected', {
        canvasId: parseCanvasDocumentName(documentName),
        userId: context?.userId,
        peersNow: clientsCount,
      });
    },
    onDisconnect({ documentName, context, clientsCount }) {
      logger.info('[CANVAS COLLAB] client disconnected', {
        canvasId: parseCanvasDocumentName(documentName),
        userId: context?.userId,
        peersRemaining: clientsCount,
      });
    },
    onAwarenessUpdate({ documentName, states }) {
      logger.debug('[CANVAS COLLAB] awareness update', {
        canvasId: parseCanvasDocumentName(documentName),
        peers: states.length,
        users: states.map((s) => s?.user?.name || s?.clientId).filter(Boolean),
      });
    },
  });

  try {
    await collaborationServer.listen(env.CANVAS_COLLAB_PORT);
    logger.info("[CANVAS COLLAB] Hocuspocus server listening", {
      port: env.CANVAS_COLLAB_PORT,
      redis: Boolean(env.REDIS_URL),
    });
  } catch (err) {
    logger.error('[CANVAS COLLAB] Failed to start Hocuspocus server', {
      port: env.CANVAS_COLLAB_PORT,
      error: err?.message || err,
    });
    try {
      await collaborationServer.destroy();
    } catch (e) {
      // ignore
    }
    collaborationServer = null;
    throw err;
  }

  return collaborationServer;
}

export async function stopCanvasCollaborationServer() {
  if (!collaborationServer) return;

  try {
    collaborationServer.hocuspocus.flushPendingStores();
    await collaborationServer.destroy();
    collaborationServer = null;
  } finally {
    if (collaborationRedis) {
      collaborationRedis.disconnect(false);
      collaborationRedis = null;
    }
  }
}
