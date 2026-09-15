export const INITIAL_MESSAGE_ITEM_INDEX = 1_000_000;

/**
 * Keep the rendered row mounted while an optimistic message is reconciled.
 * The server replaces the temporary message id, but `_virtuosoKey` retains
 * the original row identity so Virtuoso does not discard its measurements.
 */
export function getVirtuosoMessageKey(index, item) {
  return item?._virtuosoKey || item?._id || index;
}

/**
 * Keep Virtuoso's firstItemIndex stable for appended messages and decrease it
 * only when flattened rows are inserted above the previous first message.
 */
export function advanceMessageItemIndex(previous, channelId, items, firstMessageId) {
  const currentAnchorIndex = firstMessageId
    ? items.findIndex((item) => item._id === firstMessageId)
    : -1;

  if (!previous || previous.channelId !== channelId) {
    return {
      channelId,
      firstMessageId,
      anchorIndex: currentAnchorIndex,
      firstItemIndex: INITIAL_MESSAGE_ITEM_INDEX,
    };
  }

  let firstItemIndex = previous.firstItemIndex;
  if (previous.firstMessageId) {
    const movedAnchorIndex = items.findIndex(
      (item) => item._id === previous.firstMessageId,
    );
    const prependedRowCount = movedAnchorIndex - previous.anchorIndex;
    if (movedAnchorIndex >= 0 && prependedRowCount > 0) {
      firstItemIndex = Math.max(0, firstItemIndex - prependedRowCount);
    }
  }

  return {
    channelId,
    firstMessageId,
    anchorIndex: currentAnchorIndex,
    firstItemIndex,
  };
}
