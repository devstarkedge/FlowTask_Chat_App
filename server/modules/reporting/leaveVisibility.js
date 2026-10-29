import mongoose from 'mongoose';
import { AsyncLocalStorage } from 'node:async_hooks';
export const leaveViewer = new AsyncLocalStorage();
export function effectiveLeaveScope(member) {
  const scope = member?.attendanceReportingAccess?.leaveScope;
  const access = member?.flowTaskAccess;
  if (!scope || scope.role !== access?.role || access.role === 'employee' || JSON.stringify([...(scope.memberDepartments || [])].sort()) !== JSON.stringify([...(access.departmentIds || [])].sort())) return {};
  return scope;
}
export function maySeeLeave(employeeId, membership, viewerId) {
  const access = membership?.attendanceReportingAccess;
  if (!membership?.isActive || !access?.active) return false;
  if (String(employeeId) === String(viewerId)) return true;
  const scope = effectiveLeaveScope(membership);
  return scope?.allUsers === true || (scope?.employeeIds || []).map(String).includes(String(employeeId));
}
export async function leaveVisibilityFilter(options = {}) {
  if (options.includeLeaveReports) return {};
  const context = leaveViewer.getStore();
  if (!context?.userId || !context.workspaceId) return { 'reportingMeta.eventType': { $ne: 'leave.daily_report' } };
  // Resolve current authorization from the workspace membership.
  const { default: Membership } = await import('../workspaces/WorkspaceMembership.model.js');
  const { default: User } = await import('../users/ChatUser.model.js');
  const member = await Membership.findOne({ workspaceId: context.workspaceId, userId: context.userId, isActive: true }).lean();
  const access = member?.attendanceReportingAccess;
  if (!access?.active) return { 'reportingMeta.eventType': { $ne: 'leave.daily_report' } };
  const scope = effectiveLeaveScope(member);
  let ids = [context.userId];
  if (scope?.allUsers) return { 'reportingMeta.leaveRetracted': { $ne: true } };
  if (scope?.employeeIds?.length) ids = [...ids, ...(await User.find({ flowTaskUserId: { $in: scope.employeeIds } }).select('_id').lean()).map(u => u._id)];
  return { $or: [{ 'reportingMeta.eventType': { $ne: 'leave.daily_report' } },
    { 'reportingMeta.employeeId': { $in: ids.map(id => new mongoose.Types.ObjectId(id)) }, 'reportingMeta.leaveRetracted': { $ne: true } }] };
}
