import React from "react";
import CanvasDocumentCard from "./CanvasDocumentCard";

/**
 * Helper to extract Canvas sharing info from a URL string.
 * Supports both internal and public routes.
 */
function parseCanvasUrl(url) {
  // Matches: https://<domain>/canvas/<canvasId>
  const internalRegex = /^https?:\/\/[^/]+\/canvas\/([a-zA-Z0-9_-]+)$/i;
  // Matches: https://<domain>/public/canvas/<shareToken>
  const publicRegex = /^https?:\/\/[^/]+\/public\/canvas\/([a-zA-Z0-9_-]+)$/i;

  let match = url.match(internalRegex);
  if (match) return { isCanvas: true, isPublic: false, canvasId: match[1] };

  match = url.match(publicRegex);
  if (match) return { isCanvas: true, isPublic: true, token: match[1] };

  return { isCanvas: false };
}

/**
 * MessageContentResolver intelligently parses raw message content
 * to detect canonical share URLs (like Canvas) and replaces or augments
 * the raw text with a rich document card representation.
 */
export default function MessageContentResolver({ rawContent, message, children }) {
  if (message?.contentType === "canvas_share" && message?.canvasMeta) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
        <CanvasDocumentCard
          canvasId={message.canvasMeta.canvasId}
          title={message.canvasMeta.title}
          previewText={message.canvasMeta.previewText}
          isPublic={false} // Currently we rely on internal routing
        />
      </div>
    );
  }

  if (typeof rawContent !== "string") return children;

  // We only intercept if the message content consists *entirely* of a Canvas URL,
  // or contains Canvas URLs that we want to render as cards.
  const trimmed = rawContent.trim();
  const parsed = parseCanvasUrl(trimmed);

  if (parsed.isCanvas) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <CanvasDocumentCard
          url={trimmed}
          canvasId={parsed.canvasId}
          token={parsed.token}
          isPublic={parsed.isPublic}
        />
        {/* We do not render the original raw text link because the card is a complete replacement */}
      </div>
    );
  }

  // Fallback if there are multiple URLs or mixed text:
  // (For this iteration, we only parse out exact URL matches to avoid breaking Markdown links)
  const words = trimmed.split(/\s+/);
  const canvasLinks = words
    .map((w) => ({ url: w, parsed: parseCanvasUrl(w) }))
    .filter((w) => w.parsed.isCanvas);

  if (canvasLinks.length > 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
        {canvasLinks.map((link, idx) => (
          <CanvasDocumentCard
            key={idx}
            url={link.url}
            canvasId={link.parsed.canvasId}
            token={link.parsed.token}
            isPublic={link.parsed.isPublic}
          />
        ))}
      </div>
    );
  }

  return children;
}
