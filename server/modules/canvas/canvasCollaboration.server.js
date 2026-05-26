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
    // Try FlowTask token below when enabled.
  }

  if (env.FLOWTASK_ENABLED) {
    try {
      const decoded = tokenService.verifyFlowTaskToken(token);
      if (decoded?.id) {
        return userRepository.findByFlowTaskId(decoded.id);
      }
    } catch {
      return null;
    }
  }

  return null;
}

async function authenticateCanvasSession({ token, documentName, requestParameters }) {
  const canvasId = parseCanvasDocumentName(documentName);
  const workspaceId = requestParameters.get("workspaceId");

  if (!canvasId) {
    throw new Error("Invalid canvas document");
  }

  if (!workspaceId || !/^[0-9a-fA-F]{24}$/.test(workspaceId)) {
    throw new Error("Workspace context is required");
  }

  const user = await resolveUserFromToken(token);
  if (!user || !user.isActive) {
    throw new Error("Invalid or expired token");
  }

  const membership = await WorkspaceMembership.findOne({
    userId: user._id,
    workspaceId,
    isActive: true,
  }).lean();

  if (!membership) {
    throw new Error("Not a member of this workspace");
  }

  const canvas = await Canvas.findOne({ _id: canvasId, workspaceId })
    .select("_id workspaceId channelId title permissions")
    .lean();

  if (!canvas) {
    throw new Error("Canvas not found");
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

  if (!canvas?.collaborationState?.length) return;

  Y.applyUpdate(document, new Uint8Array(canvas.collaborationState));
}

async function storeCanvasDocument({ documentName, document, lastContext }) {
  const canvasId = lastContext?.canvasId || parseCanvasDocumentName(documentName);
  if (!canvasId) return;

  const collaborationState = Buffer.from(Y.encodeStateAsUpdate(document));

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
      return authenticateCanvasSession(payload);
    },
    async onLoadDocument(payload) {
      return loadCanvasDocument(payload);
    },
    async onStoreDocument(payload) {
      return storeCanvasDocument(payload);
    },
    async onAwarenessUpdate({ documentName, states }) {
      logger.debug("[CANVAS COLLAB] awareness update", {
        canvasId: parseCanvasDocumentName(documentName),
        peers: states.length,
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
