import WorkspaceMembership from '../workspaces/WorkspaceMembership.model.js';

export const isReportingChannel = channel => channel?.flowTaskRef?.entityType === 'attendance_department';
export function hasReportingAccess(channel, membership) {
  if (!isReportingChannel(channel) || !membership?.isActive ||
    String(channel.workspaceId) !== String(membership.workspaceId)) return false;
  const access = membership.attendanceReportingAccess;
  return !!access?.active && (access.allDepartments === true ||
    (access.departmentIds || []).map(String).includes(String(channel.flowTaskRef.entityId)));
}
export async function canAccessReportingChannel(channel, userId, workspaceId) {
  if (!workspaceId || String(channel.workspaceId) !== String(workspaceId)) return false;
  const member = await WorkspaceMembership.findOne({ workspaceId, userId, isActive: true }).lean();
  return hasReportingAccess(channel, member);
}
export async function reportingRecipients(channel) {
  const members = await WorkspaceMembership.find({ workspaceId: channel.workspaceId, isActive: true,
    'attendanceReportingAccess.active': true, $or: [
      { 'attendanceReportingAccess.allDepartments': true },
      { 'attendanceReportingAccess.departmentIds': String(channel.flowTaskRef.entityId) },
    ] }).select('userId').lean();
  return members.map(m => String(m.userId));
}
