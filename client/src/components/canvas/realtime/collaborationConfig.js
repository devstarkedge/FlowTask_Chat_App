function toWebsocketOrigin(origin) {
  return origin.replace(/^http/i, "ws");
}

// Cache the resolved URL so the derivation logic only runs once.
let _cachedCollabUrl = null;

export function getCanvasCollaborationUrl() {
  if (_cachedCollabUrl) return _cachedCollabUrl;

  // 1. Prefer an explicit override — covers all environments.
  const explicit = import.meta.env.VITE_CANVAS_COLLAB_URL;
  if (explicit) {
    _cachedCollabUrl = explicit.replace(/\/+$/, "");
    console.debug('[Canvas Collab] URL from VITE_CANVAS_COLLAB_URL:', _cachedCollabUrl);
    return _cachedCollabUrl;
  }

  // The Hocuspocus server always runs on a separate port (PORT+1 by default).
  // We must apply this port in BOTH dev and production; previously it was
  // only applied in dev mode, causing all production connections to fail by
  // hitting port 443 instead of the Hocuspocus port.
  const collabPort = import.meta.env.VITE_CANVAS_COLLAB_PORT;

  // 2. Derive from the API base URL if provided.
  const apiBase = import.meta.env.VITE_API_BASE_URL;
  if (apiBase && /^https?:\/\//i.test(apiBase)) {
    try {
      const url = new URL(apiBase);
      if (collabPort) {
        url.port = String(collabPort);
      }
      _cachedCollabUrl = toWebsocketOrigin(url.origin);
      console.debug('[Canvas Collab] URL derived from VITE_API_BASE_URL:', _cachedCollabUrl);
      return _cachedCollabUrl;
    } catch {
      // Fall through to browser origin.
    }
  }

  // 3. Check browser origin if running on http/https
  try {
    if (typeof window !== "undefined" && /^https?:\/\//i.test(window.location.origin)) {
      const url = new URL(window.location.origin);
      if (collabPort) {
        url.port = String(collabPort);
      }
      _cachedCollabUrl = toWebsocketOrigin(url.origin);
      console.debug('[Canvas Collab] URL derived from browser origin:', _cachedCollabUrl);
      return _cachedCollabUrl;
    }
  } catch {
    // Fall through to localhost fallback
  }

  // 4. Fallback for Electron / file:// origin or non-http environments
  const defaultPort = collabPort || 3201;
  _cachedCollabUrl = `ws://localhost:${defaultPort}`;
  console.debug('[Canvas Collab] URL fallback for desktop/Electron:', _cachedCollabUrl);
  return _cachedCollabUrl;
}
