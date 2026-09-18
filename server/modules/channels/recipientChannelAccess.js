export function isRecipientChannel(channel) {
  return channel?.type === 'dm' || channel?.recipientOnly === true;
}

export function hasRecipientMembership(channel, userId) {
  const id = String(userId?._id || userId);
  if (channel?.hasMember?.(id)) return true;
  return channel?.members?.some((member) => String(member.userId?._id || member.userId) === id)
    || channel?.dmParticipants?.some((participant) => String(participant?._id || participant) === id)
    || false;
}

export function recipientDiscoveryFilter(userId, memberChannelIds = []) {
  const nativeChannels = { type: { $ne: 'dm' }, recipientOnly: { $ne: true } };
  if (!userId) return nativeChannels;
  return { $or: [nativeChannels,
    { _id: { $in: memberChannelIds } },
    { 'members.userId': userId },
    { type: 'dm', dmParticipants: String(userId) },
  ] };
}
