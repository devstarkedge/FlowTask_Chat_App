const idOf = value => {
  if (!value) return null;
  if (typeof value === 'object') return idOf(value._id || value.id);
  return String(value);
};

const byName = (a, b) => (a.name || '').trim().localeCompare((b.name || '').trim(), undefined, {
  sensitivity: 'base', numeric: true,
});

export function buildNewMessageSections({ dms, channels, recent, people, filtered, currentUserId }) {
  const sections = [];
  const conversations = new Set();
  const recipients = new Set();
  const ownId = idOf(currentUserId);
  const addConversations = (title, items, type, alphabetical) => {
    const ordered = alphabetical ? [...items].sort(byName) : items;
    const data = ordered.filter(item => {
      const id = idOf(item);
      if (id && conversations.has(id)) return false;
      if (id) conversations.add(id);
      if (type === 'dm') {
        const recipient = idOf(item.dmRecipientId);
        if (recipient && recipient !== ownId) recipients.add(recipient);
        for (const participant of item.dmParticipants || []) {
          const participantId = idOf(participant);
          if (participantId && participantId !== ownId) recipients.add(participantId);
          const externalId = idOf(participant?.flowTaskUserId);
          if (externalId && participantId !== ownId) recipients.add(externalId);
        }
      }
      return true;
    });
    if (data.length) sections.push({ title, data, type });
  };
  addConversations('Direct Messages', dms, 'dm', true);

  const seenPeople = new Set(recipients);
  const uniquePeople = [...people].sort(byName).filter(person => {
    const ids = [idOf(person), idOf(person.flowTaskUserId)].filter(Boolean);
    if (ids.some(id => id === ownId || seenPeople.has(id))) return false;
    ids.forEach(id => seenPeople.add(id));
    return true;
  });
  const directSection = sections[0];
  const directData = [...(directSection?.data || []), ...uniquePeople].sort(byName);
  if (directData.length) {
    sections[0] = { title: 'Direct Messages', data: directData, type: 'direct' };
  }
  addConversations('Channels', channels, 'channel', true);
  if (!filtered) addConversations('Recent', recent, 'dm', false);
  return sections;
}
