export function parseCanvasUrl(url) {
  try {
    // Only parse if it's a valid string
    if (typeof url !== 'string') return { isCanvas: false, url };

    // Matches: https://<domain>/canvas/<canvasId>
    const internalRegex = /^https?:\/\/[^/]+\/canvas\/([a-zA-Z0-9_-]+)$/i;
    // Matches: https://<domain>/public/canvas/<shareToken>
    const publicRegex = /^https?:\/\/[^/]+\/public\/canvas\/([a-zA-Z0-9_-]+)$/i;

    let match = url.match(internalRegex);
    if (match) return { isCanvas: true, isPublic: false, canvasId: match[1], url };

    match = url.match(publicRegex);
    if (match) return { isCanvas: true, isPublic: true, token: match[1], url };

    return { isCanvas: false, url };
  } catch {
    return { isCanvas: false, url };
  }
}

export function extractCanvasUrls(text) {
  if (typeof text !== 'string' || !text) return [];
  const words = text.split(/\s+/);
  return words
    .map(w => parseCanvasUrl(w))
    .filter(res => res.isCanvas);
}

export function isStrictCanvasUrl(text) {
  if (typeof text !== 'string' || !text) return null;
  const trimmed = text.trim();
  const parsed = parseCanvasUrl(trimmed);
  // Also ensure the text ONLY contains this URL (split by space shouldn't have other words)
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (parsed.isCanvas && words.length === 1) {
    return parsed;
  }
  return null;
}
