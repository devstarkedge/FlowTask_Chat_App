const idOf = value => value == null ? '' : String(value);
const isServerId = id => /^[a-f\d]{24}$/i.test(id);
const isLocal = message => !isServerId(idOf(message._id)) &&
  (message.pending === true || /^(temp|optimistic)[-:]/.test(idOf(message._id)));

// Channel history is sorted/cursored by Mongo _id, not by media type or time.
// Unknown/non-Mongo IDs retain timestamp/insertion order as a safe fallback.
export function compareMessageRecords(a, b) {
  const aLocal = isLocal(a), bLocal = isLocal(b);
  if (aLocal !== bLocal) return aLocal ? 1 : -1;
  const aId = idOf(a._id), bId = idOf(b._id);
  if (isServerId(aId) && isServerId(bId)) return aId.toLowerCase().localeCompare(bId.toLowerCase());
  const aTime = Date.parse(a.createdAt), bTime = Date.parse(b.createdAt);
  return Number.isFinite(aTime) && Number.isFinite(bTime) ? aTime - bTime : 0;
}

export function orderMessageRecords(messages = []) {
  const rows = new Map();
  const anonymous = [];
  for (const message of messages) {
    if (!message) continue;
    const id = idOf(message._id || message.tempId || message.clientMessageId);
    if (!id) { anonymous.push(message); continue; }
    // Deduplicate only the same record ID; never sender/timestamp/attachments.
    rows.set(id, message);
  }
  const confirmedAliases = new Set();
  for (const message of rows.values()) {
    if (isLocal(message)) continue;
    for (const alias of [message.tempId, message.clientMessageId]) {
      if (alias) confirmedAliases.add(idOf(alias));
    }
  }
  const records = [...rows.values(), ...anonymous].filter(message => !isLocal(message) ||
    ![message._id, message.tempId, message.clientMessageId].some(id => id && confirmedAliases.has(idOf(id))));
  return records.map((message, index) => ({ message, index }))
    .sort((a, b) => compareMessageRecords(a.message, b.message) || a.index - b.index)
    .map(entry => entry.message);
}

export function messagesFromPages(pages = []) {
  return orderMessageRecords([...pages].reverse().flatMap(page => page.items || []));
}
