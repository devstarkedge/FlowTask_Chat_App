export const AT_BOTTOM_THRESHOLD = 60;

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
 * Calculate the new scrollTop after older messages are prepended.
 * If user was at bottom, returns the new bottom scrollTop (pinned to bottom).
 * If user was reading older messages, preserves the exact distance to bottom (no jump).
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
  topThreshold = 200,
}) {
  if (!hasMore || isLoading) return false;
  // If user is at the bottom, NEVER auto-load older messages!
  if (isAtBottom) return false;
  // Only trigger if user scrolled near the top
  return scrollTop <= topThreshold;
}
