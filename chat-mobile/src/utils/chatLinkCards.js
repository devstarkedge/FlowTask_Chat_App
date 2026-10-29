function stripHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Checks if a message contains Canvas information or links.
 * Returns null or { canvasId, title, previewText, isPublic, token, rawUrl, isOnlyLink, cleanText }
 */
export function extractCanvasInfo(message) {
  if (!message || message.isDeleted) return null;

  // Case 1: Explicit canvas_share contentType with canvasMeta
  if (message.contentType === 'canvas_share' && message.canvasMeta) {
    const rawContent = message.content || '';
    const cleanRaw = stripHtml(rawContent);
    const isOnly = !cleanRaw || cleanRaw === 'I shared a canvas';
    return {
      canvasId: message.canvasMeta.canvasId,
      title: message.canvasMeta.title || 'Canvas Document',
      previewText: message.canvasMeta.previewText || '',
      isPublic: !!message.canvasMeta.shareToken,
      token: message.canvasMeta.shareToken || null,
      isOnlyLink: isOnly,
      cleanText: isOnly ? '' : rawContent,
    };
  }

  const content = typeof message.content === 'string' ? message.content : '';
  const htmlContent = typeof message.htmlContent === 'string' ? message.htmlContent : '';
  const searchStr = `${content} ${htmlContent}`;
  const plainText = stripHtml(content || htmlContent);

  // Case 2: Markdown link [📄 Title](/canvas/id) or [Title](url)
  const mdRegex = /\[(?:📄\s*)?([^\]]+)\]\((?:https?:\/\/[^\/\s)]+)?\/(?:public\/)?canvas\/([a-zA-Z0-9_-]+)\)/;
  const mdMatch = searchStr.match(mdRegex);
  if (mdMatch) {
    const isPublic = mdMatch[0].includes('/public/canvas/');
    const mdLabel = mdMatch[1]?.trim();
    // It's only link if plainText is equal to mdMatch or just the title/label
    const isOnlyLink = !plainText || plainText === stripHtml(mdMatch[0]) || plainText === mdLabel;
    const clean = content.replace(mdRegex, '').trim();
    return {
      canvasId: isPublic ? null : mdMatch[2],
      token: isPublic ? mdMatch[2] : null,
      title: mdLabel || 'Canvas Document',
      isPublic,
      isOnlyLink,
      cleanText: isOnlyLink || !stripHtml(clean) ? '' : clean,
    };
  }

  // Case 3: Bare URL or relative path: /canvas/<canvasId> or https://<domain>/canvas/<canvasId>
  const urlRegex = /(https?:\/\/[^\/\s<>"']+|www\.[^\/\s<>"']+|\/)\/(public\/)?canvas\/([a-zA-Z0-9_-]+)/;
  const urlMatch = searchStr.match(urlRegex);
  if (urlMatch) {
    const isPublic = !!urlMatch[2];
    const fullMatch = urlMatch[0];
    const plainUrl = stripHtml(fullMatch);
    const isOnlyLink = !plainText || plainText === plainUrl || plainText.replace(/https?:\/\/[^/]+/i, '') === plainUrl.replace(/https?:\/\/[^/]+/i, '');
    const clean = content.replace(urlRegex, '').trim();
    return {
      canvasId: isPublic ? null : urlMatch[3],
      token: isPublic ? urlMatch[3] : null,
      title: 'Canvas Document',
      isPublic,
      isOnlyLink,
      cleanText: isOnlyLink || !stripHtml(clean) ? '' : clean,
    };
  }

  return null;
}

/**
 * Checks if a message contains Huddle links.
 * Returns array of { workspaceId, channelId, href, isOnlyLink, cleanText }
 */
export function extractHuddleLinks(message, fallbackChannelId) {
  if (!message || message.isDeleted) return [];

  const content = typeof message.content === 'string' ? message.content : '';
  const htmlContent = typeof message.htmlContent === 'string' ? message.htmlContent : '';
  const searchStr = `${content} ${htmlContent}`;

  if (!searchStr.includes('huddle=1')) return [];

  const plainText = stripHtml(content || htmlContent);
  const links = [];
  const seen = new Set();

  // Pattern 1: /workspace/:workspaceId/channel/:channelId?huddle=1
  const fullRegex = /(?:https?:\/\/[^\/\s<>"']+|www\.[^\/\s<>"']+)?\/workspace\/([a-zA-Z0-9_-]+)\/channel\/([a-zA-Z0-9_-]+)[^\s<>"']*(?:[?&]huddle=1[^\s<>"']*)?/gi;
  let match;
  while ((match = fullRegex.exec(searchStr)) !== null) {
    const workspaceId = match[1];
    const channelId = match[2];
    const key = `${workspaceId}:${channelId}`;
    if (!seen.has(key)) {
      seen.add(key);
      const matchedUrl = match[0];
      const isOnlyLink = !plainText || plainText === stripHtml(matchedUrl) || plainText.includes(stripHtml(matchedUrl)) && plainText.length <= stripHtml(matchedUrl).length + 4;
      const clean = content.replace(fullRegex, '').trim();
      links.push({
        workspaceId,
        channelId,
        href: matchedUrl,
        isOnlyLink,
        cleanText: isOnlyLink || !stripHtml(clean) ? '' : clean,
      });
    }
  }

  // Pattern 2: /channel/:channelId?huddle=1
  if (links.length === 0) {
    const channelRegex = /(?:https?:\/\/[^\/\s<>"']+|www\.[^\/\s<>"']+)?\/channel\/([a-zA-Z0-9_-]+)[^\s<>"']*[?&]huddle=1[^\s<>"']*/gi;
    while ((match = channelRegex.exec(searchStr)) !== null) {
      const channelId = match[1];
      const key = `unknown:${channelId}`;
      if (!seen.has(key)) {
        seen.add(key);
        const matchedUrl = match[0];
        const isOnlyLink = !plainText || plainText === stripHtml(matchedUrl) || plainText.includes(stripHtml(matchedUrl)) && plainText.length <= stripHtml(matchedUrl).length + 4;
        const clean = content.replace(channelRegex, '').trim();
        links.push({
          workspaceId: null,
          channelId,
          href: matchedUrl,
          isOnlyLink,
          cleanText: isOnlyLink || !stripHtml(clean) ? '' : clean,
        });
      }
    }
  }

  // Pattern 3: Any other URL with ?huddle=1 or &huddle=1
  if (links.length === 0) {
    const genericRegex = /https?:\/\/[^\s<>"']+[?&]huddle=1[^\s<>"']*/gi;
    while ((match = genericRegex.exec(searchStr)) !== null) {
      const matchedUrl = match[0];
      const key = matchedUrl;
      if (!seen.has(key)) {
        seen.add(key);
        const isOnlyLink = !plainText || plainText === stripHtml(matchedUrl) || plainText.includes(stripHtml(matchedUrl)) && plainText.length <= stripHtml(matchedUrl).length + 4;
        const clean = content.replace(genericRegex, '').trim();
        links.push({
          workspaceId: null,
          channelId: fallbackChannelId || null,
          href: matchedUrl,
          isOnlyLink,
          cleanText: isOnlyLink || !stripHtml(clean) ? '' : clean,
        });
      }
    }
  }

  return links;
}
