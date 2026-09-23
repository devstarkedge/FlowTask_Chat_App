export const INITIAL_MESSAGE_ITEM_INDEX = 1_000_000;

/**
 * Keep the rendered row mounted while an optimistic message is reconciled.
 * The server replaces the temporary message id, but `_virtuosoKey` retains
 * the original row identity so Virtuoso does not discard its measurements.
 */
export function getVirtuosoMessageKey(index, item) {
  return item?._virtuosoKey || item?.clientMessageId || item?._id || index;
}

// Message line heights are fractional (for example 41.6875px). Rounding each
// row makes Virtuoso's spacers disagree with the rendered rows as its window
// changes, moving the messages even though their actual heights did not change.
export function measureMessageItem(element) {
  return element.getBoundingClientRect().height;
}

/**
 * Preserve the absolute index of retained rows through prepends, cache-window
 * trimming, and optimistic reconciliation. Otherwise old height measurements
 * are reused for different messages after a refresh.
 */
export function advanceMessageItemIndex(previous, channelId, items, firstMessageId) {
  const currentAnchorIndex = firstMessageId
    ? items.findIndex((item) => item._id === firstMessageId)
    : -1;
  const rowIndices = new Map(items.map((item, index) => [getVirtuosoMessageKey(index, item), index]));
  const anchorKey = currentAnchorIndex >= 0
    ? getVirtuosoMessageKey(currentAnchorIndex, items[currentAnchorIndex])
    : null;

  if (!previous || previous.channelId !== channelId) {
    return {
      channelId,
      firstMessageId,
      anchorIndex: currentAnchorIndex,
      anchorKey,
      rowIndices,
      firstItemIndex: INITIAL_MESSAGE_ITEM_INDEX,
    };
  }

  let firstItemIndex = previous.firstItemIndex;
  let retainedKey = previous.anchorKey ?? previous.firstMessageId;
  let previousAnchorIndex = previous.anchorIndex;
  if (!rowIndices.has(retainedKey) && previous.rowIndices) {
    // A repeated date header can stay at index zero while messages underneath
    // it are trimmed. Prefer an actual retained message as the anchor.
    retainedKey = previous.rowIndices.has(anchorKey)
      ? anchorKey
      : [...previous.rowIndices.keys()].find((key) =>
        previous.rowIndices.get(key) >= previous.anchorIndex && rowIndices.has(key));
    previousAnchorIndex = previous.rowIndices.get(retainedKey);
  }
  if (rowIndices.has(retainedKey) && previousAnchorIndex >= 0) {
    firstItemIndex = Math.max(0, firstItemIndex + previousAnchorIndex - rowIndices.get(retainedKey));
  }

  return {
    channelId,
    firstMessageId,
    anchorIndex: currentAnchorIndex,
    anchorKey,
    rowIndices,
    firstItemIndex,
  };
}
