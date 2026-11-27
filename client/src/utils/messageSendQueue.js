const pendingSendsByConversation = new Map();
const sendSeqByConversation = new Map();

let clientSessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
let lastOptimisticTimestampMs = 0;

/** Return a strictly increasing timestamp, including for same-tick sends. */
export function nextOptimisticTimestamp() {
  const timestampMs = Math.max(Date.now(), lastOptimisticTimestampMs + 1);
  lastOptimisticTimestampMs = timestampMs;
  return new Date(timestampMs).toISOString();
}

/**
 * Return a monotonic per-conversation sequence number and session ID so rapid
 * message requests can be pipelined concurrently while the server preserves order.
 */
export function nextClientSendOrder(conversationId) {
  const key = String(conversationId);
  const nextSeq = (sendSeqByConversation.get(key) || 0) + 1;
  sendSeqByConversation.set(key, nextSeq);
  return { clientSessionId, clientSeq: nextSeq };
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
  sendSeqByConversation.clear();
  clientSessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  lastOptimisticTimestampMs = 0;
}
