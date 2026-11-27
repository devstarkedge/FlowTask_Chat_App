const DEFAULT_WAIT_TIMEOUT_MS = 1500;
const ENTRY_TTL_MS = 60_000;

const sequencesByKey = new Map();

function pruneStaleEntries(now = Date.now()) {
  for (const [key, entry] of sequencesByKey.entries()) {
    if (entry.waiters.size === 0 && now - entry.lastActiveAt > ENTRY_TTL_MS) {
      sequencesByKey.delete(key);
    }
  }
}

/**
 * Ensure concurrent message-send requests from the same client session in the
 * same channel persist and broadcast in client-send order without forcing the
 * client to wait for each HTTP round-trip before sending the next message.
 */
export async function runInClientOrder(
  { authorId, channelId, clientSessionId, clientSeq, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS },
  taskFn,
) {
  if (!clientSessionId || !Number.isInteger(clientSeq) || clientSeq < 1) {
    return taskFn();
  }

  const now = Date.now();
  if (sequencesByKey.size > 1000) {
    pruneStaleEntries(now);
  }

  const key = `${String(authorId)}:${String(channelId)}:${String(clientSessionId)}`;
  let entry = sequencesByKey.get(key);
  if (!entry) {
    entry = { nextSeq: 1, waiters: new Map(), lastActiveAt: now };
    sequencesByKey.set(key, entry);
  }
  entry.lastActiveAt = now;

  if (clientSeq > entry.nextSeq) {
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const list = entry.waiters.get(clientSeq);
        if (list) {
          const idx = list.indexOf(finish);
          if (idx !== -1) list.splice(idx, 1);
          if (list.length === 0) entry.waiters.delete(clientSeq);
        }
        resolve();
      };

      const timer = setTimeout(finish, timeoutMs);
      const list = entry.waiters.get(clientSeq) || [];
      list.push(finish);
      entry.waiters.set(clientSeq, list);
    });
  }

  try {
    return await taskFn();
  } finally {
    entry.lastActiveAt = Date.now();
    if (clientSeq >= entry.nextSeq) {
      entry.nextSeq = clientSeq + 1;
    }
    for (const [waitingSeq, callbacks] of Array.from(entry.waiters.entries())) {
      if (waitingSeq <= entry.nextSeq) {
        for (const cb of [...callbacks]) {
          cb();
        }
      }
    }
  }
}

export function resetMessageSendSequencerForTests() {
  sequencesByKey.clear();
}
