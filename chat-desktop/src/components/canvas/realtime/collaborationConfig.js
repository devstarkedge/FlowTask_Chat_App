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

  // 3. Last resort: use the browser origin, overriding the port when known.
  try {
    const url = new URL(window.location.origin);
    if (collabPort) {
      url.port = String(collabPort);
    }
    _cachedCollabUrl = toWebsocketOrigin(url.origin);
  } catch {
    _cachedCollabUrl = toWebsocketOrigin(window.location.origin);
  }

  if (!collabPort) {
    console.warn(
      '[Canvas Collab] VITE_CANVAS_COLLAB_PORT is not set — collaboration URL may be incorrect:',
      _cachedCollabUrl,
    );
  } else {
    console.debug('[Canvas Collab] URL derived from browser origin:', _cachedCollabUrl);
  }

  return _cachedCollabUrl;
}
