export function profileId(value) {
  if (!value) return null;
  return typeof value === 'object' ? profileId(value._id || value.id || value.userId) : String(value);
}

function lookup(value, profiles) {
  if (!value) return null;
  const ids = typeof value === 'object'
    ? [value.chatUserId, value.flowTaskUserId, value._id, value.id, value.userId, value.type === 'user' ? value.targetId : null]
    : [value];
  return ids.map(profileId).map((id) => profiles[id]).find(Boolean) || null;
}

// Project profile metadata by stable ID. Strings (including HTML and message
// bodies), dates and sets are deliberately opaque to this transformation.
export function projectUserProfiles(value, profiles) {
  if (!value || typeof value !== 'object' || !Object.keys(profiles).length) return value;
  if (Array.isArray(value)) {
    const next = value.map((item) => projectUserProfiles(item, profiles));
    return next.some((item, index) => item !== value[index]) ? next : value;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  let next = value;
  const assign = (key, item) => {
    if (next[key] === item) return;
    if (next === value) next = { ...value };
    next[key] = item;
  };
  for (const [key, item] of Object.entries(value)) assign(key, projectUserProfiles(item, profiles));
  const profile = lookup(value, profiles);
  if (profile && (['name', 'displayName', 'email', 'avatar', 'flowTaskUserId'].some((key) => key in value) || (value.type === 'user' && 'label' in value))) {
    assign('name', profile.name);
    for (const key of ['avatar', 'email']) if (key in profile && key in value) assign(key, profile[key]);
    if (value.type === 'user' && 'label' in value) assign('label', profile.name);
  }
  const author = lookup(value.authorId, profiles);
  if (author && value.senderSnapshot && value.senderSnapshot.name !== author.name) assign('senderSnapshot', { ...value.senderSnapshot, name: author.name });
  const sender = lookup(value.senderId || (value.senderName ? value.authorId : null), profiles);
  if (sender) {
    if ('senderName' in value) assign('senderName', sender.name);
    if ('senderAvatar' in value) assign('senderAvatar', sender.avatar);
  }
  const originalSender = lookup(value.originalSenderId, profiles);
  if (originalSender && 'originalSenderName' in value) assign('originalSenderName', originalSender.name);
  const uploader = lookup(value.uploadedById, profiles);
  if (uploader && typeof value.uploadedBy === 'string') assign('uploadedBy', uploader.name);
  // DM labels are reconstructed from participant IDs, never split/replaced
  // by an old name that another person could also use.
  if (value.type === 'dm' && value.dmParticipants?.length) {
    const recipient = lookup(value.dmRecipientId, profiles);
    if (value.dmRecipientId) {
      if (recipient) {
        assign('name', recipient.name);
        if ('avatar' in value) assign('avatar', recipient.avatar);
      }
      return next;
    }
    const names = value.dmParticipants.map((id, index) => lookup(id, profiles)?.name || value.dmParticipantNames?.[index]);
    if (names.every(Boolean)) {
      if (names.some((name, index) => name !== value.dmParticipantNames?.[index])) assign('dmParticipantNames', names);
      assign('name', names.join(', '));
    }
  }
  return next;
}
