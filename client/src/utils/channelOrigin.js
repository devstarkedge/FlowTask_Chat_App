const FLOWTASK_CHANNEL_TYPES = new Set(['project', 'department', 'team']);

export function isFlowTaskSyncedChannel(channel) {
  if (!channel) return false;
  if (channel.systemManaged) return true;
  if (channel.flowTaskRef?.entityType || channel.flowTaskRef?.entityId) return true;
  return FLOWTASK_CHANNEL_TYPES.has(channel.type);
}

export function isChatAppChannel(channel) {
  if (!channel || channel.isArchived) return false;
  const type = channel.type;
  if (type === 'dm' || type === 'self' || type === 'system') return false;
  return !isFlowTaskSyncedChannel(channel);
}
