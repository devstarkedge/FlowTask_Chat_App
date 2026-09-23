const pendingSendsByConversation = new Map();

let lastOptimisticTimestampMs = 0;

/** Return a strictly increasing timestamp, including for same-tick sends. */
export function nextOptimisticTimestamp() {
  const timestampMs = Math.max(Date.now(), lastOptimisticTimestampMs + 1);
  lastOptimisticTimestampMs = timestampMs;
  return new Date(timestampMs).toISOString();
}

/**
 * Serialize server writes for one conversation while optimistic messages stay
 * immediate. Rejections are isolated so one failure cannot block later sends.
 */
export function enqueueMessageSend(conversationId, sendRequest) {
  const key = String(conversationId);
  const previous = pendingSendsByConversation.get(key) || Promise.resolve();
  const current = previous.then(sendRequest, sendRequest);

  pendingSendsByConversation.set(key, current);
  current
    .finally(() => {
      if (pendingSendsByConversation.get(key) === current) {
        pendingSendsByConversation.delete(key);
      }
    })
    .catch(() => {});

  return current;
}

export function resetMessageSendQueueForTests() {
  pendingSendsByConversation.clear();
  lastOptimisticTimestampMs = 0;
}
