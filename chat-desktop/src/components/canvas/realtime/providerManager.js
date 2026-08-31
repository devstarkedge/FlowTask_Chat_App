import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import { authAPI } from "../../../services/api";
import { useAuthStore } from "../../../stores/authStore";
import logger from "../../../utils/logger";

// Provider entries keyed by `${workspaceId}:${canvasId}`
const providers = new Map();
const pendingCreates = new Map();

function keyFor(workspaceId, canvasId) {
  return `${workspaceId}:${canvasId}`;
}

async function createProvider({ workspaceId, canvasId, url, tokenGetter }) {
  const key = keyFor(workspaceId, canvasId);
  logger.debug('[COLLAB MANAGER] creating provider', { key, url });

  // Attempt an auth check before creating the provider to surface
  // token issues early and avoid failed WS handshakes.
  try {
    await authAPI.me();
  } catch (err) {
    logger.warn('[COLLAB MANAGER] authAPI.me() failed before provider creation', { key, err: err?.message || err });
    // Let provider creation continue — Hocuspocus will still emit auth failure
    // which we handle below. We don't throw here to avoid blocking UI.
  }

  const ydoc = new Y.Doc();

  let authRetryInProgress = false;

  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;  // Reduced from 10 to prevent infinite loops
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let isDestroyed = false;
  let consecutiveFailures = 0;
  const maxConsecutiveFailures = 3;

  const scheduleReconnect = () => {
    if (isDestroyed || reconnectAttempts >= maxReconnectAttempts) {
      if (reconnectAttempts >= maxReconnectAttempts) {
        logger.error('[COLLAB MANAGER] max reconnection attempts reached, giving up', { key, attempts: reconnectAttempts });
      }
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    reconnectAttempts++;
    logger.debug('[COLLAB MANAGER] scheduling reconnect', { key, attempt: reconnectAttempts, delayMs: delay });
    reconnectTimer = setTimeout(() => {
      if (!isDestroyed && provider.status !== 'connected') {
        try {
          provider.connect();
        } catch (err) {
          logger.warn('[COLLAB MANAGER] reconnect failed', { key, err: err?.message || err });
          consecutiveFailures++;
          if (consecutiveFailures >= maxConsecutiveFailures) {
            logger.error('[COLLAB MANAGER] too many consecutive failures, stopping reconnection', { key });
            return;
          }
          scheduleReconnect();
        }
      }
    }, delay);
  };

  const startHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (isDestroyed) return;
      if (provider.status === 'connected' && provider.awareness) {
        try {
          const local = provider.awareness.getLocalState();
          if (local) {
            provider.awareness.setLocalState(local);
          }
        } catch (err) {
          logger.debug('[COLLAB MANAGER] heartbeat failed', { key });
        }
      }
    }, 30000);
  };

  const provider = new HocuspocusProvider({
    url,
    name: `canvas:${canvasId}`,
    document: ydoc,
    token: () => tokenGetter(),
    parameters: { workspaceId },
    connect: true,
    broadcast: true,
    forceSyncInterval: 5000,
    onConnect: () => {
      logger.info('[COLLAB MANAGER] provider connected', { key });
      reconnectAttempts = 0;
      consecutiveFailures = 0;  // Reset on successful connection
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      startHeartbeat();
    },
    onStatus: ({ status }) => {
      logger.debug('[COLLAB MANAGER] provider status', { key, status });
      if (status === 'disconnected' && !isDestroyed) {
        consecutiveFailures++;
        if (consecutiveFailures < maxConsecutiveFailures) {
          scheduleReconnect();
        } else {
          logger.error('[COLLAB MANAGER] too many disconnects, stopping reconnection', { key, failures: consecutiveFailures });
        }
      }
    },
    onSynced: ({ state }) => {
      logger.info('[COLLAB MANAGER] provider synced', { key, state });
    },
    onClose: ({ event } = {}) => {
      logger.warn('[COLLAB MANAGER] provider closed', { key, code: event?.code, reason: event?.reason });
      if (!isDestroyed && consecutiveFailures < maxConsecutiveFailures) {
        scheduleReconnect();
      }
    },
    onDisconnect: ({ event } = {}) => {
      logger.warn('[COLLAB MANAGER] provider disconnected', { key, code: event?.code, reason: event?.reason });
      if (!isDestroyed && consecutiveFailures < maxConsecutiveFailures) {
        scheduleReconnect();
      }
    },
    onAwarenessChange: () => logger.debug('[COLLAB MANAGER] awareness changed', { key }),
    onAuthenticationFailed: async () => {
      logger.warn('[COLLAB MANAGER] provider authentication failed — attempting token refresh', { key });
      if (authRetryInProgress) return;
      authRetryInProgress = true;
      try {
        await authAPI.me();
        const token = tokenGetter();
        if (token && !isDestroyed) {
          try {
            provider.disconnect();
            await new Promise(resolve => setTimeout(resolve, 500));
            provider.connect();
            logger.info('[COLLAB MANAGER] reconnected provider after token refresh', { key });
          } catch (err) {
            logger.warn('[COLLAB MANAGER] reconnect after token refresh failed', { key, err: err?.message || err });
            scheduleReconnect();
          }
        }
      } catch (err) {
        logger.warn('[COLLAB MANAGER] token refresh attempt failed', { key, err: err?.message || err });
      } finally {
        authRetryInProgress = false;
      }
    },
  });

  // Provider connects automatically with connect: true

  const entry = {
    provider,
    ydoc,
    refCount: 0,
    key,
    createdAt: Date.now(),
    destroyTimer: null,
    cleanup: () => {
      isDestroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    },
  };

  // Instrument Yjs document updates for debugging transaction flow.
  try {
    if (ydoc && typeof ydoc.on === 'function') {
      ydoc.on('update', (update, origin) => {
        try {
          const size = update && update.byteLength ? update.byteLength : (update && update.length ? update.length : null);
          logger.debug('[YJS][UPDATE]', { key, size, origin: origin ? String(origin).slice(0, 64) : null });
        } catch (e) {
          // ignore logging errors
        }
      });
      // afterTransaction provides origin information for local vs remote
      try {
        ydoc.on('afterTransaction', (transaction) => {
          try {
            logger.debug('[YJS][TX]', { key, origin: transaction.origin ? String(transaction.origin).slice(0, 64) : null });
          } catch (e) {}
        });
      } catch (e) {
        // some Yjs builds may not expose afterTransaction; ignore if missing
      }
    }
  } catch (e) {
    // ignore instrumentation errors
  }

  providers.set(key, entry);

  logger.info('[COLLAB MANAGER] provider created', { key });

  return entry;
}

// Expose simple debug helpers on window for interactive inspection in dev
try {
  if (typeof window !== 'undefined') {
    window.__FLOWTASK_COLLAB = window.__FLOWTASK_COLLAB || {};
    window.__FLOWTASK_COLLAB.getSnapshot = function () {
      try {
        return Array.from(providers.entries()).map(([k, e]) => ({
          key: k,
          refCount: e.refCount,
          createdAt: e.createdAt,
          providerStatus: e.provider?.status,
          providerSynced: e.provider?.synced,
          hasAwareness: Boolean(e.provider?.awareness),
        }));
      } catch (err) {
        return { error: String(err) };
      }
    };
    window.__FLOWTASK_COLLAB.get = function (key) {
      return providers.get(key) || null;
    };
  }
} catch (e) {
  // ignore
}

async function acquireProvider({ workspaceId, canvasId, url, tokenGetter }) {
  const key = keyFor(workspaceId, canvasId);

  if (providers.has(key)) {
    const e = providers.get(key);
    e.refCount += 1;
    e.lastUsed = Date.now();
    logger.debug('[COLLAB MANAGER] reusing existing provider', { key, refCount: e.refCount });
    // Cancel pending destroy if any
    if (e.destroyTimer) {
      clearTimeout(e.destroyTimer);
      e.destroyTimer = null;
    }
    return {
      provider: e.provider,
      ydoc: e.ydoc,
      release: () => releaseProvider(key),
    };
  }

  if (pendingCreates.has(key)) {
    logger.debug('[COLLAB MANAGER] waiting for pending provider create', { key });
    await pendingCreates.get(key);
    return acquireProvider({ workspaceId, canvasId, url, tokenGetter });
  }

  const p = createProvider({ workspaceId, canvasId, url, tokenGetter })
    .then((entry) => {
      // initial ref for caller
      entry.refCount = 1;
      entry.lastUsed = Date.now();
      providers.set(key, entry);
      return entry;
    })
    .finally(() => pendingCreates.delete(key));

  pendingCreates.set(key, p);
  const entry = await p;

  return {
    provider: entry.provider,
    ydoc: entry.ydoc,
    release: () => releaseProvider(key),
  };
}

function releaseProvider(key) {
  const entry = providers.get(key);
  if (!entry) return;
  entry.refCount = Math.max(0, entry.refCount - 1);
  entry.lastUsed = Date.now();
  logger.debug('[COLLAB MANAGER] release called', { key, refCount: entry.refCount });

  if (entry.refCount > 0) return;

  // Schedule a delayed destroy — this avoids tearing down the provider
  // during quick remounts (React StrictMode or fast navigation).
  entry.destroyTimer = setTimeout(async () => {
    try {
      logger.info('[COLLAB MANAGER] destroying provider (idle)', { key });
      if (entry.cleanup) entry.cleanup();
      try {
        entry.provider.destroy();
      } catch (err) {
        logger.warn('[COLLAB MANAGER] provider.destroy() failed', { key, err: err?.message || err });
      }
      try {
        entry.ydoc && entry.ydoc.destroy && entry.ydoc.destroy();
      } catch (err) {
        logger.warn('[COLLAB MANAGER] ydoc.destroy() failed', { key, err: err?.message || err });
      }
    } finally {
      providers.delete(key);
    }
  }, 2000);
}

export { acquireProvider };
