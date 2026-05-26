import { useEffect, useRef, useState } from "react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";

import { useAuthStore } from "../../../stores/authStore";
import { useWorkspaceStore } from "../../../stores/workspaceStore";
import { useCanvasUiStore } from "../../../stores/canvasUiStore";
import { getCanvasCollaborationUrl } from "./collaborationConfig";

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
  const setProviderStatus = useCanvasUiStore((s) => s.setProviderStatus);

  const ydocRef = useRef(null);
  if (!ydocRef.current) {
    ydocRef.current = new Y.Doc();
  }

  const [provider, setProvider] = useState(null);
  const [status, setStatus] = useState("idle");
  const [awarenessUsers, setAwarenessUsers] = useState([]);

  useEffect(() => {
    if (!canvasId || !accessToken || !workspaceId) {
      setStatus("disabled");
      setProviderStatus("disabled");
      return undefined;
    }

    // Recreate Y.Doc on every canvas change to avoid content bleed.
    if (ydocRef.current) {
      ydocRef.current.destroy();
    }
    ydocRef.current = new Y.Doc();
    const ydoc = ydocRef.current;

    let nextProvider = null;
    let stopped = false;
    // connectTimeout guards against the React StrictMode double-mount pattern:
    // the effect runs, schedules connection, then immediately unmounts and
    // re-mounts. By delaying the actual WebSocket.connect() call we ensure
    // the cleanup can cancel it before a socket is even opened.
    let connectTimeout = null;

    (async () => {
      const url = getCanvasCollaborationUrl();

      if (stopped) return;

      // Track how many connection attempts have been made so we can stop
      // retrying after a threshold when the server is unreachable.
      let attempts = 0;
      const MAX_ATTEMPTS = 3;

      nextProvider = new HocuspocusProvider({
        url,
        name: `canvas:${canvasId}`,
        document: ydoc,
        token: accessToken,
        parameters: {
          workspaceId,
        },
        // 'autoConnect: false' is the correct Hocuspocus flag that prevents
        // HocuspocusProviderWebsocket from calling connect() in its constructor.
        // Previously we were using 'connect: false' which is not a recognized
        // option, so the socket was auto-connecting immediately anyway.
        autoConnect: false,
        preserveConnection: false,
        forceSyncInterval: 30_000,

        onStatus: ({ status: nextStatus }) => {
          if (stopped) return;
          setStatus(nextStatus);
          setProviderStatus(nextStatus);
        },
        onSynced: ({ state }) => {
          if (stopped) return;
          if (state) {
            setStatus("synced");
            setProviderStatus("synced");
          }
        },
        onAuthenticationFailed: () => {
          if (stopped) return;
          setStatus("auth-failed");
          setProviderStatus("auth-failed");
          // No point retrying if auth is wrong.
          stopped = true;
          try { nextProvider.configuration.websocketProvider.disconnect(); } catch (_) {}
        },
        onClose: () => {
          if (stopped) return;

          attempts += 1;
          if (attempts >= MAX_ATTEMPTS) {
            // Give up — server is unreachable. Stay in disconnected state
            // so the editor works in offline mode without spamming errors.
            stopped = true;
            setStatus("disconnected");
            setProviderStatus("disconnected");
            // Prevent Hocuspocus from scheduling its own internal reconnect.
            try { nextProvider.configuration.websocketProvider.disconnect(); } catch (_) {}
          }
        },
        onAwarenessChange: () => {
          if (stopped) return;
          setAwarenessUsers(readAwarenessUsers(nextProvider));
        },
      });

      if (stopped) {
        try { nextProvider.destroy(); } catch (_) {}
        return;
      }

      nextProvider.awareness?.setLocalStateField("user", {
        id: user?._id,
        name: user?.name || "Anonymous",
        avatar: user?.avatar || null,
        color: userColor(user?._id),
        activity: "viewing canvas",
      });

      setProvider(nextProvider);
      setStatus("connecting");
      setProviderStatus("connecting");

      // Defer the actual WebSocket handshake by one tick so that if React
      // StrictMode immediately unmounts (cleanup runs synchronously), the
      // timeout is cleared before any socket is opened — eliminating the
      // "WebSocket is closed before the connection is established" warning.
      connectTimeout = setTimeout(() => {
        if (!stopped && nextProvider) {
          nextProvider.configuration.websocketProvider.connect();
        }
      }, 50);
    })();

    return () => {
      stopped = true;
      if (connectTimeout) {
        clearTimeout(connectTimeout);
        connectTimeout = null;
      }
      try {
        if (nextProvider) {
          // Destroy cleans up listeners, the ydoc binding, and the underlying
          // websocket. We don't need to call disconnect() separately.
          nextProvider.destroy();
        }
      } catch (err) {
        console.warn("Provider cleanup failed:", err);
      }
      setProvider(null);
      setAwarenessUsers([]);
    };
  }, [
    accessToken,
    canvasId,
    setProviderStatus,
    user?._id,
    user?.avatar,
    user?.name,
    workspaceId,
  ]);

  return {
    ydoc: ydocRef.current,
    provider,
    status,
    awarenessUsers,
  };
}