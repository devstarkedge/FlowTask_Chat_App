/**
 * Chat Scroll Management Constants & Utilities
 * Enterprise-grade scroll intent and anchor preservation system.
 */

export const SCROLL_STATE = Object.freeze({
  FOLLOWING_LATEST: 'FOLLOWING_LATEST',
  READING_HISTORY: 'READING_HISTORY',
  LOADING_OLDER: 'LOADING_OLDER',
  RESTORING_POSITION: 'RESTORING_POSITION',
});

export const AT_BOTTOM_THRESHOLD = 60;
export const TOP_PAGINATION_THRESHOLD = 150;

/**
 * Calculate distance from bottom of scroll container in pixels.
 * Subpixel rounding and negative values are normalized to >= 0.
 */
export function getBottomDistance(element) {
  if (!element) return 0;
  return Math.max(0, element.scrollHeight - element.clientHeight - element.scrollTop);
}

/**
 * Determine if user is at (or very near) the bottom of the container.
 */
export function checkIfAtBottom(element, threshold = AT_BOTTOM_THRESHOLD) {
  if (!element) return true;
  return getBottomDistance(element) <= threshold;
}

/**
 * Safely escape a CSS selector string.
 */
function escapeCss(str) {
  if (typeof CSS !== 'undefined' && CSS.escape) {
    return CSS.escape(str);
  }
  return str.replace(/["\\]/g, '\\$&');
}

/**
 * Find the primary visible message anchor in the scroll container.
 * Returns the topmost message visible at or crossing the top of the viewport.
 * Prefers actual messages over date/unread separators for stability.
 */
export function findVisibleAnchor(container) {
  if (!container) return null;
  const containerRect = container.getBoundingClientRect();
  const elements = container.querySelectorAll('[data-message-id]');
  if (!elements || elements.length === 0) return null;

  let fallbackAnchor = null;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const rect = el.getBoundingClientRect();
    // Element is visible in or crosses the top of the viewport
    if (rect.bottom > containerRect.top + 5) {
      const messageId = el.getAttribute('data-message-id');
      if (!messageId) continue;
      const isSeparator = el.getAttribute('data-separator') === 'true';
      const anchorData = {
        messageId,
        viewportOffset: rect.top - containerRect.top,
        isSeparator,
      };
      if (!isSeparator) {
        return anchorData;
      }
      if (!fallbackAnchor) {
        fallbackAnchor = anchorData;
      }
    }
  }
  return fallbackAnchor;
}

/**
 * Restore the scroll position so that the anchored message remains
 * at its exact previous viewport offset.
 * Returns true if an adjustment was made.
 */
export function restoreAnchorPosition(container, anchor) {
  if (!container || !anchor || !anchor.messageId) return false;
  const safeId = escapeCss(anchor.messageId);
  const el =
    container.querySelector(`[data-message-id="${safeId}"]`) ||
    container.querySelector(`#msg-${safeId}`);
  if (!el) return false;

  const containerRect = container.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const currentOffset = elRect.top - containerRect.top;
  const delta = currentOffset - anchor.viewportOffset;

  if (Math.abs(delta) >= 1) {
    container.scrollTop += delta;
    return true;
  }
  return false;
}

/**
 * Calculate the new scrollTop after older messages are prepended.
 * (Preserved for backwards compatibility with tests and callers)
 */
export function calculatePreservedScrollTop({
  newScrollHeight,
  clientHeight,
  previousDistanceToBottom,
  wasAtBottom,
}) {
  if (wasAtBottom) {
    return Math.max(0, newScrollHeight - clientHeight);
  }
  return Math.max(0, newScrollHeight - previousDistanceToBottom);
}

/**
 * Determine whether older messages pagination should trigger.
 * Prevents unintentional auto-pagination when user is at the bottom or viewing latest messages.
 */
export function shouldLoadOlderMessages({
  hasMore,
  isLoading,
  scrollTop,
  isAtBottom,
  scrollState,
  scrollHeight,
  clientHeight,
  topThreshold = TOP_PAGINATION_THRESHOLD,
}) {
  if (!hasMore || isLoading) return false;
  // If user is at the bottom or following latest, NEVER auto-load older messages!
  if (isAtBottom || scrollState === SCROLL_STATE.FOLLOWING_LATEST) return false;
  // If container dimensions are provided, ensure container is actually scrollable
  if (scrollHeight != null && clientHeight != null && scrollHeight <= clientHeight + topThreshold) {
    return false;
  }
  // Only trigger if user scrolled near the top
  return scrollTop <= topThreshold;
}
