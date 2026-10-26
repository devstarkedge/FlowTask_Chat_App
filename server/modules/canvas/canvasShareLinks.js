const validId = value => /^[a-f\d]{24}$/i.test(String(value || ''));

// A pasted app link renders the same canvas card as a structured canvas share.
// Resolve only configured TaskChat origins; external links never grant access.
export function canvasShareIds(message, environment = process.env) {
  const ids = new Set();
  if (message.contentType === 'canvas_share' && validId(message.canvasMeta?.canvasId)) {
    ids.add(String(message.canvasMeta.canvasId));
  }
  const origins = new Set();
  const configured = [environment.CLIENT_URL, environment.BASE_URL, ...(environment.CORS_ORIGINS || '').split(',')];
  if (environment.NODE_ENV !== 'production') configured.push('http://localhost:5173', 'http://localhost:5174', 'http://localhost:3200');
  for (const value of configured) {
    try { origins.add(new URL(value?.trim()).origin); } catch { /* Unconfigured origin. */ }
  }
  for (const text of [message.content, message.htmlContent]) {
    if (typeof text !== 'string') continue;
    for (const raw of text.match(/https?:\/\/[^\s<>"']+/gi) || []) {
      try {
        const url = new URL(raw.replace(/[),.;!?]+$/, ''));
        if (!origins.has(url.origin) || url.username || url.password) continue;
        const match = (url.hash.startsWith('#/') ? url.hash.slice(1) : url.pathname).match(/^\/canvas\/([a-f\d]{24})\/?$/i);
        if (match) ids.add(match[1]);
      } catch { /* Ordinary text is not a canvas share. */ }
    }
  }
  return [...ids];
}
