// Desktop MembersTab/InviteTab use these three backend signals, in this order.
export function getWorkspaceOrigin(workspace) {
  if (workspace?.source === 'flowtask' || workspace?.settings?.flowtaskIntegration?.enabled === true || !!workspace?.flowTaskRole) {
    return 'flowtask';
  }
  // Workspace.model's native source/default is independent. Fetch full details
  // for incomplete list/storage records rather than guessing from missing data.
  return workspace?.source === 'independent' ? 'independent' : null;
}

const idString = value => {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || value.id || '');
  return String(value);
};

export function normalizeWorkspaceMembers(records, workspaceId) {
  if (!Array.isArray(records)) return [];
  const seen = new Set();
  return records.flatMap(record => {
    if (!record || typeof record !== 'object' || record.isActive === false || ['pending', 'invited', 'removed', 'inactive'].includes(record.status)) return [];
    const ownerWorkspaceId = idString(record.workspaceId);
    if (ownerWorkspaceId && ownerWorkspaceId !== idString(workspaceId)) return [];
    const identity = record.userId ?? record.user ?? record.profile;
    if (Object.hasOwn(record, 'userId') && !identity) return [];
    const profile = typeof identity === 'object' && identity ? identity : {};
    const userId = idString(identity) || idString(record.id || record._id);
    if (!userId || seen.has(userId)) return [];
    seen.add(userId);
    const name = profile.name || record.displayName || record.name || profile.displayName || 'Unknown';
    const email = profile.email || record.email || '';
    const avatar = profile.avatar || profile.avatarUrl || profile.profilePicture || record.avatar || record.avatarUrl || null;
    return [{
      ...record,
      userId: { ...profile, _id: userId, name, email, avatar },
      name, email, avatar,
      // WorkspaceMembership.role, never the global ChatUser.role.
      role: record.role || 'member',
    }];
  });
}

export function getWorkspaceMemberActions(workspace, member, currentUserId, canManage) {
  const origin = getWorkspaceOrigin(workspace);
  const isSelf = idString(member?.userId) === idString(currentUserId);
  const isOwner = member?.role === 'owner';
  const isSynced = !!member?.flowTaskAccess?.role;
  const canAct = !!canManage && !!idString(member?.userId) && !isSelf;
  return {
    canViewProfile: canAct,
    canMessage: canAct,
    // Desktop renders an editor for non-synced FlowTask guests, but the
    // server rejects all role mutations in FlowTask workspaces. Present that
    // existing effective restriction as read-only on mobile.
    canEditRole: canAct && !isOwner && workspace?.source === 'independent' && (origin !== 'flowtask' || !isSynced),
    // Desktop's removal handler rejects FlowTask workspaces OR synced members.
    canRemove: canAct && !isOwner && origin === 'independent' && !isSynced,
  };
}

export function mergeWorkspaceDetails(activeWorkspace, details, workspaceId) {
  const active = idString(activeWorkspace?._id) === idString(workspaceId) ? activeWorkspace : null;
  const fetched = idString(details?._id) === idString(workspaceId) ? details : null;
  return active || fetched ? { ...active, ...fetched } : null;
}
