/**
 * Centralized utility for canonical URL generation.
 * Prevents issues where Electron's file:// origin leaks into shareable links.
 */

export function getAppBaseUrl() {
  // 1. Explicitly configured Frontend/App URL
  const explicitAppBase = import.meta.env.VITE_APP_URL || import.meta.env.VITE_FRONTEND_URL;
  if (explicitAppBase && /^https?:\/\//i.test(explicitAppBase)) {
    return explicitAppBase.replace(/\/+$/, "");
  }

  // 2. Browser Environment (Valid HTTP/HTTPS origin)
  if (
    typeof window !== "undefined" &&
    /^https?:\/\//i.test(window.location.origin) &&
    !window.location.origin.includes("localhost")
  ) {
    return window.location.origin;
  }

  // 3. Fallback to backend URL if running in Electron (file://) and no explicit APP_URL is set
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  if (backendUrl && /^https?:\/\//i.test(backendUrl)) {
    return backendUrl.replace(/\/+$/, "");
  }

  // 4. Final fallback for local development if everything else fails
  return "http://localhost:5173";
}

/**
 * Returns the canonical internal URL for a specific Canvas.
 */
export function getCanvasUrl(canvasId) {
  if (!canvasId) return "";
  return `${getAppBaseUrl()}/canvas/${canvasId}`;
}

/**
 * Returns the canonical external/public URL for a shared Canvas.
 */
export function getPublicCanvasUrl(shareToken) {
  if (!shareToken) return "";
  return `${getAppBaseUrl()}/public/canvas/${shareToken}`;
}
