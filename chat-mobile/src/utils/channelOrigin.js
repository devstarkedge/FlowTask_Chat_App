const FLOWTASK_CHANNEL_TYPES = new Set(['project', 'department', 'team']);

const toId = (val) => {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val._id != null) return String(val._id);
  return String(val);
};

export function isFlowTaskSyncedChannel(channel) {
  if (!channel) return false;
  if (channel.systemManaged) return true;
  if (channel.flowTaskRef?.entityType || channel.flowTaskRef?.entityId) return true;
  if (channel.slug && (channel.slug.startsWith('flowtask-') || channel.slug === 'general')) return true;
  return FLOWTASK_CHANNEL_TYPES.has(channel.type);
}

export function isChatAppChannel(channel) {
  if (!channel || channel.isArchived) return false;
  const type = channel.type;
  if (type === 'dm' || type === 'self' || type === 'system') return false;
  return !isFlowTaskSyncedChannel(channel);
}

export function isMemberChannelHost(member, channel) {
  if (!member) return false;
  if (member.isHost || member.channelRole === 'owner') return true;
  const creatorId = toId(channel?.createdBy);
  const memberId = toId(member._id || member.userId?._id || member.userId);
  return Boolean(creatorId && memberId && creatorId === memberId);
}

export function resolveChannelHost({ channel, members = [], workspaceMembers = [], currentUser } = {}) {
  const memberList = Array.isArray(members) ? members : [];
  const hostInMembers = memberList.find((m) => isMemberChannelHost(m, channel));
  if (hostInMembers) {
    return { ...hostInMembers, isHost: true };
  }

  const creatorId = toId(channel?.createdBy);
  if (!creatorId) return null;

  if (typeof channel?.createdBy === 'object' && channel.createdBy?.name) {
    return {
      ...channel.createdBy,
      _id: creatorId,
      isHost: true,
      channelRole: 'owner',
    };
  }

  const wsList = Array.isArray(workspaceMembers) ? workspaceMembers : [];
  const wsMatch = wsList.find(
    (wm) => toId(wm._id || wm.userId?._id || wm.userId) === creatorId
  );
  if (wsMatch) {
    const profile = wsMatch.userId && typeof wsMatch.userId === 'object' ? wsMatch.userId : wsMatch;
    return {
      ...profile,
      _id: toId(profile._id) || creatorId,
      isHost: true,
      channelRole: 'owner',
    };
  }

  if (currentUser && toId(currentUser._id) === creatorId) {
    return {
      ...currentUser,
      _id: creatorId,
      isHost: true,
      channelRole: 'owner',
    };
  }

  return null;
}

export function sortMembersWithHostFirst(members = [], channel = null, hostMember = null) {
  const list = Array.isArray(members) ? members : [];
  const seen = new Set();
  const annotated = [];

  for (const m of list) {
    const id = toId(m._id || m.userId?._id || m.userId);
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    annotated.push({
      ...m,
      isHost: isMemberChannelHost(m, channel),
    });
  }

  if (hostMember && channel?.type !== 'dm') {
    const hostId = toId(hostMember._id || hostMember.userId?._id || hostMember.userId);
    if (hostId && !seen.has(hostId) && hostMember.name) {
      annotated.unshift({ ...hostMember, isHost: true });
    }
  }

  return annotated.sort((a, b) => {
    if (Boolean(a.isHost) !== Boolean(b.isHost)) return a.isHost ? -1 : 1;
    return 0;
  });
}

/**
 * Shared permission computation for channels:
 * - Only the custom channel owner can delete the custom channel.
 * - All other members (including workspace admins who do not own the channel)
 *   get Leave Channel in custom channels instead of Delete Channel.
 */
export function getChannelPermissions({ channel, members = [], user, activeWorkspace } = {}) {
  const isDM = channel?.type === 'dm';
  const isSystem = channel?.type === 'system';
  const isProject = channel?.type === 'project';
  const isLocked = isSystem || isProject;
  const isSystemManagedProject = isProject && Boolean(channel?.systemManaged);
  const isCustom = isChatAppChannel(channel);

  const currentUserId = toId(user?._id);
  const memberList = Array.isArray(members) ? members : [];
  const myMembership = currentUserId
    ? memberList.find((m) => toId(m._id || m.userId?._id || m.userId) === currentUserId)
    : null;

  const isChannelOwner = Boolean(
    myMembership?.channelRole === 'owner' ||
      myMembership?.isHost ||
      (currentUserId != null && toId(channel?.createdBy) === currentUserId) ||
      channel?.isOwner?.(user?._id)
  );
  const isWsAdmin = ['owner', 'admin'].includes(activeWorkspace?.role);
  const isChannelAdmin = Boolean(
    isChannelOwner ||
      myMembership?.channelRole === 'admin' ||
      (Array.isArray(channel?.admins) &&
        currentUserId != null &&
        channel.admins.some((a) => toId(a) === currentUserId)) ||
      isWsAdmin
  );

  const ownerCount = memberList.filter(
    (m) => m.channelRole === 'owner' || m.role === 'owner'
  ).length;
  const memberCount = channel?.memberCount ?? memberList.length;
  const isResolvingMembers = memberCount > 0 && memberList.length === 0;
  const isLastOwner = isChannelOwner && (isResolvingMembers || ownerCount <= 1);

  const canAddMember = isCustom;
  const canEditChannel = !isDM && isChannelAdmin && !isSystemManagedProject;
  const canMoveToCategory = canEditChannel && isCustom;
  const canDeleteChannel = isCustom && isChannelOwner;
  const canLeaveChannel = isCustom
    ? !isChannelOwner
    : !isDM && !isSystem && !isSystemManagedProject && !isLastOwner;

  return {
    isDM,
    isSystem,
    isProject,
    isLocked,
    isSystemManagedProject,
    isCustom,
    isChannelOwner,
    isWsAdmin,
    isChannelAdmin,
    canAddMember,
    canEditChannel,
    canMoveToCategory,
    canDeleteChannel,
    canLeaveChannel,
  };
}
