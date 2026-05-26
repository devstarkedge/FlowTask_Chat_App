function toWebsocketOrigin(origin) {
  return origin.replace(/^http/i, "ws");
}

export function getCanvasCollaborationUrl() {
  const explicit = import.meta.env.VITE_CANVAS_COLLAB_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const apiBase = import.meta.env.VITE_API_BASE_URL;
  if (apiBase && /^https?:\/\//i.test(apiBase)) {
    try {
      const url = new URL(apiBase);
      if (import.meta.env.DEV) {
        url.port = import.meta.env.VITE_CANVAS_COLLAB_PORT ;
      }
      return toWebsocketOrigin(url.origin);
    } catch {
      // Fall through to browser origin.
    }
  }

  if (import.meta.env.DEV) {
    return `ws://${window.location.hostname}:${
      import.meta.env.VITE_CANVAS_COLLAB_PORT
    }`;
  }

  return toWebsocketOrigin(window.location.origin);
}
