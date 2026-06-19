import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";

import { useAuthStore } from "../../../stores/authStore";
import { authAPI } from "../../../services/api";
import { useWorkspaceStore } from "../../../stores/workspaceStore";
import { useCanvasUiStore } from "../../../stores/canvasUiStore";
import { getCanvasCollaborationUrl } from "./collaborationConfig";
import { acquireProvider } from "./providerManager";
import logger from "../../../utils/logger";

function userColor(userId = "") {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash % 360)}, 70%, 52%)`;
}

function readAwarenessUsers(provider) {
  if (!provider?.awareness) return [];
  return Array.from(provider.awareness.getStates().values())
    .map((state) => state?.user)
    .filter(Boolean);
}

export function useCanvasCollaboration(canvasId) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  // Use a stable selector from the store to avoid changing identity
  // and unnecessary effect re-runs.
  const setProviderStatus = useCanvasUiStore.getState().setProviderStatus;

  // Keep the provider and ydoc in refs to avoid re-renders that recreate them.
  const providerRef = useRef(null);
  const ydocRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [awarenessUsers, setAwarenessUsers] = useState([]);
  const awarenessUpdateTimerRef = useRef(null);

  useEffect(() => {
    if (!canvasId || !workspaceId) {
      setStatus("disabled");
      setProviderStatus("disabled");
      return undefined;
    }

    // Acquire a shared provider from the provider manager. This ensures a
    // single HocuspocusProvider instance per canvas/workspace across the
    // whole client, preventing duplicate websocket clients and auth races.
    let mounted = true;
    let releaseFn = null;
    let localProvider = null;
    let connectTimer = null;

    // Handler references declared here so cleanup can remove the exact
    // listeners registered on the shared provider instance.
    let handleStatus = null;
    let handleSynced = null;
    let handleAwareness = null;

      (async () => {
        const url = getCanvasCollaborationUrl();

        // Only attempt auth check when no provider exists yet. We leave the
        // token refresh logic to the centralized manager on auth failure.
        logger.debug('[Canvas Collab] acquiring provider', { canvasId, workspaceId });
      try {
        const { provider, ydoc, release } = await acquireProvider({
          workspaceId,
          canvasId,
          url,
          tokenGetter: () => useAuthStore.getState().accessToken,
        });

        if (!mounted) {
          // If unmounted while waiting for acquisition, release and bail.
          try { release(); } catch (e) {}
          return;
        }

        // Keep refs for editor integration and cleanup
        providerRef.current = provider;
        ydocRef.current = ydoc;
        releaseFn = release;
        localProvider = provider;

        // Inspect Y.Doc for common ProseMirror fragment keys to aid
        // debugging of binding issues (some setups use 'prosemirror',
        // others use 'document').
        try {
          const fragments = [];
          try {
            const f1 = ydoc.getXmlFragment && ydoc.getXmlFragment('prosemirror');
            fragments.push({ name: 'prosemirror', length: f1 ? f1.length : null });
          } catch (e) {}
          try {
            const f2 = ydoc.getXmlFragment && ydoc.getXmlFragment('document');
            fragments.push({ name: 'document', length: f2 ? f2.length : null });
          } catch (e) {}
          try {
            const meta = ydoc.getMap && ydoc.getMap('canvasMeta');
            fragments.push({ name: 'canvasMeta', exists: Boolean(meta) });
          } catch (e) {}
          logger.debug('[Canvas Collab] ydoc fragments', { canvasId, workspaceId, fragments });
        } catch (e) {
          /* ignore */
        }

        // Attach lightweight event handlers for UI status sync and
        // awareness updates. Each consumer must remove their handlers on
        // cleanup to avoid duplicates.
        handleStatus = ({ status: nextStatus } = {}) => {
          if (!mounted) return;
          try {
            logger.debug('[Canvas Collab] provider status', { canvasId, status: nextStatus });
            if (nextStatus === 'connected') logger.info('[Canvas Collab] provider connected', { canvasId });
            setStatus(nextStatus);
            setProviderStatus(nextStatus);
          } catch (e) { /* ignore */ }
        };

        handleSynced = ({ state } = {}) => {
          if (!mounted) return;
          try {
            logger.debug('[Canvas Collab] synced event', { canvasId, state });
            if (state) {
              logger.info('[Canvas Collab] provider synced', { canvasId });
              setStatus('synced');
              setProviderStatus('synced');
            }
          } catch (e) { /* ignore */ }
        };

        handleAwareness = () => {
          if (!mounted) return;
          if (awarenessUpdateTimerRef.current) return;
          awarenessUpdateTimerRef.current = setTimeout(() => {
            awarenessUpdateTimerRef.current = null;
            if (!mounted) return;
            try {
              const users = readAwarenessUsers(providerRef.current);
              logger.debug('[Canvas Collab] awareness changed', { canvasId, peers: users.length });
              setAwarenessUsers(users);
            } catch (e) { /* ignore */ }
          }, 100);
        };

        provider.on('status', handleStatus);
        provider.on('synced', handleSynced);
        provider.on('awarenessChange', handleAwareness);

        // If the provider is already connected/synced (cached), reflect that
        // immediately instead of forcing "connecting" which causes a reload loop.
        const initialStatus = provider.status || provider.connectionStatus;
        if (initialStatus === 'connected' || initialStatus === 'synced') {
          setStatus(initialStatus);
          setProviderStatus(initialStatus);
        } else {
          setStatus('connecting');
          setProviderStatus('connecting');
        }

        // Make sure local awareness user is set (safe to call multiple times)
        try {
          provider.awareness?.setLocalStateField('user', {
            id: user?._id,
            name: user?.name || 'Anonymous',
            avatar: user?.avatar || null,
            color: userColor(user?._id),
            activity: 'viewing canvas',
          });
        } catch (e) {
          // ignore
        }

        // Defer seeding/connection checks to the editor hook which listens
        // for 'synced' before seeding content.
      } catch (err) {
        logger.warn('[Canvas Collab] acquireProvider failed', { canvasId, err: err?.message || err });
        setStatus('disabled');
        setProviderStatus('disabled');
      }
    })();

    return () => {
      mounted = false;
      if (awarenessUpdateTimerRef.current) {
        clearTimeout(awarenessUpdateTimerRef.current);
        awarenessUpdateTimerRef.current = null;
      }
      try {
        if (providerRef.current) {
          try {
            handleStatus && providerRef.current.off && providerRef.current.off('status', handleStatus);
          } catch (_) {}
          try {
            handleSynced && providerRef.current.off && providerRef.current.off('synced', handleSynced);
          } catch (_) {}
          try {
            handleAwareness && providerRef.current.off && providerRef.current.off('awarenessChange', handleAwareness);
          } catch (_) {}
        }
      } catch (e) {}
      // Release shared provider reference (manager will destroy when refCount hits 0)
      try {
        if (typeof releaseFn === 'function') releaseFn();
      } catch (e) {
        // ignore
      }

      providerRef.current = null;
      ydocRef.current = null;
      setAwarenessUsers([]);
    };
  // `setProviderStatus` is read directly from store (stable). Recreate
  // provider only when `canvasId` or `workspaceId` change.
  }, [canvasId, workspaceId]);

  // Update the awareness local user state when the `user` object changes
  // without recreating the entire provider / websocket connection.
  useEffect(() => {
    const prov = providerRef.current;
    if (!prov) return;

    try {
      prov.awareness?.setLocalStateField("user", {
        id: user?._id,
        name: user?.name || "Anonymous",
        avatar: user?.avatar || null,
        color: userColor(user?._id),
        activity: "viewing canvas",
      });
    } catch (err) {
      console.warn("Failed to update awareness user:", err);
    }
  }, [status, user?._id, user?.name, user?.avatar]);

  return {
    ydoc: ydocRef.current,
    provider: providerRef.current,
    status,
    awarenessUsers,
  };
}