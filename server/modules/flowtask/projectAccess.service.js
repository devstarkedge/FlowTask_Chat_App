import ChannelMember from '../channels/ChannelMember.model.js';
import WorkspaceMembership from '../workspaces/WorkspaceMembership.model.js';
import Channel from '../channels/Channel.model.js';
import ReadReceipt from '../readReceipts/readReceipt.model.js';
import Notification from '../notifications/Notification.model.js';

export function isFlowTaskProjectChannel(channel) {
  return channel?.type === 'project' || channel?.flowTaskRef?.entityType === 'board';
}

const SOURCE_VISIBILITIES = ['public', 'workspace', 'department', 'private'];

export function isFlowTaskWorkspaceAdmin(membership) {
  return membership?.isActive === true && (
    membership.role === 'admin' || membership.role === 'owner' ||
    membership.flowTaskAccess?.role === 'admin'
  );
}

export function projectSourceVisibility(board) {
  const visibility = board?.sourceVisibility || board?.visibility;
  return SOURCE_VISIBILITIES.includes(visibility) ? visibility : null;
}

/**
 * Returns only the access granted by a FlowTask workspace snapshot. Direct
 * board/task/subtask/nano access remains an explicit ChannelMember record and
 * is checked by the caller. This separation prevents a role in one workspace
 * from becoming a global ChatUser bypass.
 */
export function hasSnapshotProjectAccess(channel, membership) {
  if (!isFlowTaskProjectChannel(channel) || !membership?.isActive ||
      !channel.workspaceId || String(channel.workspaceId) !== String(membership.workspaceId)) return false;
  // Workspace administrators can access every project, including private and
  // legacy channels with no source visibility. Assignment still gates members.
  return isFlowTaskWorkspaceAdmin(membership);
}

export async function getWorkspaceMembership(userId, workspaceId) {
  if (!userId || !workspaceId) return null;
  return WorkspaceMembership.findOne({ userId, workspaceId, isActive: true }).lean();
}

export async function canAccessFlowTaskProjectChannel(channel, userId, workspaceId, membership = null) {
  if (!isFlowTaskProjectChannel(channel) || !channel.workspaceId ||
      workspaceId && String(channel.workspaceId) !== String(workspaceId)) return false;
  const activeMembership = membership || await getWorkspaceMembership(userId, channel.workspaceId);
  if (!activeMembership?.isActive || String(activeMembership.workspaceId) !== String(channel.workspaceId) ||
      String(activeMembership.userId) !== String(userId)) return false;
  return hasSnapshotProjectAccess(channel, activeMembership) || ChannelMember.isMember(channel._id, userId);
}

/**
 * Recipients for a project message/event are direct participants (`ChannelMember`)
 * as well as workspace Owners and Admins who have workspace-wide channel visibility.
 */
export async function getAuthorizedProjectUserIds(channel, workspaceId) {
  const effectiveWsId = workspaceId || channel?.workspaceId;
  if (!effectiveWsId || String(channel?.workspaceId) !== String(effectiveWsId)) return [];
  const directIds = await ChannelMember.getMemberIds(channel._id);
  const audience = [
    { userId: { $in: directIds } },
    { role: { $in: ['owner', 'admin'] } },
    { 'flowTaskAccess.role': 'admin' },
  ];
  const memberships = await WorkspaceMembership.find({ workspaceId: effectiveWsId, isActive: true, $or: audience })
    .select('userId').lean();
  return memberships.map(member => String(member.userId));
}

/**
 * Removes stale project activity after a FlowTask workspace role/scope change.
 * This is deliberately based on the authoritative current membership and does
 * not touch channels that remain available through a direct participant entry.
 */
export async function purgeUnauthorizedProjectActivity(userId, workspaceId, membership = null) {
  const activeMembership = membership || await getWorkspaceMembership(userId, workspaceId);
  if (!activeMembership) return [];

  const projectChannels = await Channel.find({
    workspaceId,
    isArchived: false,
    $or: [
      { type: 'project' },
      { 'flowTaskRef.entityType': 'board' },
    ],
  }).select('_id workspaceId type flowTaskRef flowTaskMetadata departmentRef').lean();

  const revokedChannelIds = [];
  for (const channel of projectChannels) {
    const allowed = await canAccessFlowTaskProjectChannel(
      channel,
      userId,
      workspaceId,
      activeMembership,
    );
    if (allowed) continue;

    await Promise.all([
      ReadReceipt.deleteMany({ userId, channelId: channel._id, workspaceId }),
      Notification.deleteMany({ recipientId: userId, channelId: channel._id, workspaceId }),
    ]);
    revokedChannelIds.push(channel._id.toString());
  }

  return revokedChannelIds;
}

export default {
  isFlowTaskProjectChannel,
  hasSnapshotProjectAccess,
  getWorkspaceMembership,
  canAccessFlowTaskProjectChannel,
  getAuthorizedProjectUserIds,
  purgeUnauthorizedProjectActivity,
};
