// The board reference is written by the FlowTask integration and is unique
// per workspace. Legacy project channels can also have a public/private type.
const projectChannelTypes = new Set(['project', 'private', 'public']);
const automatedTypes = new Set(['activity', 'system', 'bot', 'task_update']);
const projectEntities = new Set(['board', 'card', 'comment', 'subtask', 'nano']);
const id = value => String(value?._id || value || '');
const isObjectId = value => /^[a-f\d]{24}$/i.test(id(value));

export function supportsProjectActivity(channel, workspaceId) {
  return Boolean(
    channel?.workspaceId &&
    (!workspaceId || id(channel.workspaceId) === id(workspaceId)) &&
    !channel.recipientOnly &&
    projectChannelTypes.has(channel.type) &&
    channel.flowTaskRef?.entityType === 'board' &&
    isObjectId(channel.flowTaskRef.entityId)
  );
}

export function hasFlowTaskSystemAuthor(message) {
  // Socket sends carry this server-generated flag. History has a populated author.
  return message?.isFlowTaskSystemMessage === true || message?.authorId?.flowTaskUserId === 'SYSTEM_BOT';
}

export function messageTimeline(channel, message, workspaceId) {
  if (!supportsProjectActivity(channel, workspaceId) || !automatedTypes.has(message?.contentType) ||
      !hasFlowTaskSystemAuthor(message) || message.forwardMeta?.isForwarded ||
      message.reportingMeta || message.reportingEventId || message.huddleMeta ||
      (message.channelId && id(message.channelId) !== id(channel)) ||
      (message.workspaceId && id(message.workspaceId) !== id(channel.workspaceId))) return 'messages';

  const projectId = id(channel.flowTaskRef.entityId);
  const ref = message.flowTaskRef;
  const activity = message.activityMeta;
  if ((activity?.projectId && id(activity.projectId) !== projectId) ||
      (ref?.entityType === 'board' && id(ref.entityId) !== projectId) ||
      (activity?.channelId && id(activity.channelId) !== id(channel))) return 'messages';

  const hasProjectReference = ref && projectEntities.has(ref.entityType) && isObjectId(ref.entityId);
  const hasProjectEvent = activity?.eventType && id(activity.projectId) === projectId;
  // Keep records without reliable project metadata accessible in Messages.
  return hasProjectReference || hasProjectEvent ? 'activity' : 'messages';
}
