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

// Custom categories are personal organization only. They must not change
// FlowTask channel authority, so every active channel already returned by the
// workspace-scoped channel endpoint can be grouped except private-message and
// system channel types.
export function isPersonalCategoryChannel(channel) {
  if (!channel || channel.isArchived) return false;
  return !['dm', 'self', 'system'].includes(channel.type);
}
