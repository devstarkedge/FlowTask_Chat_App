import { effectiveLeaveScope } from './leaveVisibility.js';
import mongoose from 'mongoose';
import Channel from '../channels/Channel.model.js';
import Message from '../messages/Message.model.js';
import User from '../users/ChatUser.model.js';
import Membership from '../workspaces/WorkspaceMembership.model.js';
import Receipt from '../readReceipts/ReadReceipt.model.js';
import userRepository from '../users/user.repository.js';
import { encryptMessageData, decryptMessageData } from '../../services/encryption/messageEncryption.service.js';
import { emitToUser } from '../../sockets/socketManager.js';
import { messageSocketPayload } from '../../utils/socketPayload.js';
import { hasReportingAccess } from './reportingAccess.js';
import { reportingDigest, attachReportingProfiles } from './reportingHistory.service.js';
import { escapeHtml } from './reportingFormat.js';
import { ValidationError, ForbiddenError } from '../../middleware/errorHandler.js';

const validId = id => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);
export async function leaveAudience(channel, employeeId) {
  const members = await Membership.find({ workspaceId: channel.workspaceId, isActive: true, 'attendanceReportingAccess.active': true, $or: [{ 'attendanceReportingAccess.allDepartments': true }, { 'attendanceReportingAccess.departmentIds': String(channel.flowTaskRef.entityId) }] }).lean();
  const employee = await User.findById(employeeId).select('flowTaskUserId').lean();
  return members.filter(m => hasReportingAccess(channel, m) && (String(m.userId) === String(employeeId) || effectiveLeaveScope(m).allUsers ||
    (effectiveLeaveScope(m).employeeIds || []).includes(employee?.flowTaskUserId))).map(m => String(m.userId));
}
export async function reconcileLeaveUnread(userId, workspaceId, channelId = null) {
  const member = await Membership.findOne({ workspaceId, userId }).lean();
  for (const receipt of await Receipt.find({ workspaceId, userId, messageId: null, ...(channelId ? { channelId } : {}) }).lean()) {
    const channel = await Channel.findOne({ _id: receipt.channelId, workspaceId, 'flowTaskRef.entityType': 'attendance_department' }).lean();
    if (!channel) continue;
    let ids = [userId];
    const scope = effectiveLeaveScope(member);
    if (scope?.employeeIds?.length) ids.push(...(await User.find({ flowTaskUserId: { $in: scope.employeeIds } }).select('_id').lean()).map(u => u._id));
    const count = !channel.isArchived && hasReportingAccess(channel, member) ? await Message.countDocuments({ workspaceId, channelId: channel._id, isDeleted: false,
      ...((receipt.lastReadAt || member?.joinedAt) ? { createdAt: { $gt: receipt.lastReadAt || member.joinedAt } } : {}), 'reportingMeta.leaveRetracted': { $ne: true },
      ...(!scope?.allUsers ? { $or: [{ 'reportingMeta.eventType': { $ne: 'leave.daily_report' } }, { 'reportingMeta.employeeId': { $in: ids } }] } : {})
    }).setOptions({ includeLeaveReports: true }) : 0;
    await Receipt.updateOne({ _id: receipt._id, lastReadAt: receipt.lastReadAt }, { $set: { unreadCount: count } });
    emitToUser(String(userId), 'unread:updated', { channelId: String(channel._id), unreadCount: count }, String(workspaceId));
  }
}
export async function handleLeaveReport(payload, workspaceId) {
  if (!validId(payload.leaveRequestId) || !validId(payload.employee?.flowTaskUserId) || !/^\d{4}-\d{2}-\d{2}$/.test(payload.dateKey) ||
    !Number.isSafeInteger(payload.reportRevision) || payload.reportRevision < 1 || !Array.isArray(payload.departments) || !Array.isArray(payload.previousDepartmentIds)) throw new ValidationError('Invalid leave report');
  if (payload.eventId !== `leave-${payload.leaveRequestId}-${payload.employee.flowTaskUserId}-${payload.dateKey}`) throw new ValidationError('Leave event identity does not match its source');
  const employee = await User.findOne({ flowTaskUserId: payload.employee.flowTaskUserId }).lean();
  if (!employee || !await Membership.exists({ workspaceId, userId: employee._id })) throw new ForbiddenError('Verified employee mapping is missing');
  const bot = await userRepository.ensureBotUser();
  const current = new Set(payload.retracted ? [] : payload.departments.map(d => d.id));
  const departments = [...new Set([...current, ...payload.previousDepartmentIds])];
  if (!departments.every(validId)) throw new ValidationError('Invalid leave department');
  for (const departmentId of departments) {
    // Reuse only a directory-provisioned reporting channel. Never create one.
    const channel = await Channel.findOne({ workspaceId, 'flowTaskRef.entityType': 'attendance_department', 'flowTaskRef.entityId': departmentId });
    if (!channel) { if (current.has(departmentId)) throw new ValidationError('Existing reporting channel is not ready'); else continue; }
    const retracted = !current.has(departmentId);
    const filter = { workspaceId, channelId: channel._id, reportingEventId: payload.eventId };
    const recipients = await leaveAudience(channel, employee._id);
    let message = await Message.findOne(filter).setOptions({ includeLeaveReports: true }).lean();
    let created = false;
    if (message && (message.reportingRevision || 1) > payload.reportRevision) continue;
    const lines = ['🔔 On Leave — ' + employee.name, 'Employee: ' + employee.name, 'Workday: ' + payload.dateKey,
      'Leave Type: ' + String(payload.leaveType || 'Leave').slice(0,100), 'Coverage: ' + String(payload.coverage || '').slice(0,100)];
    const digest = reportingDigest({ employeeId: String(employee._id), request: payload.leaveRequestId, date: payload.dateKey, retracted, lines });
    const data = encryptMessageData({ content: lines.join('\n'), htmlContent: lines.map(escapeHtml).join('<br>'), contentType: 'system' }, workspaceId);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const existing = await Message.findOne(filter).setOptions({ includeLeaveReports: true }).session(session).lean();
        if (existing && existing.reportingRevision === payload.reportRevision && existing.reportingDigest !== digest) throw new ValidationError('Leave revision was reused with different data');
        if (existing && (existing.reportingRevision || 1) >= payload.reportRevision) { message = existing; return; }
        const changes = { ...data, reportingDigest: digest, reportingRevision: payload.reportRevision, isDeleted: retracted, reportingMeta: {
          eventType: 'leave.daily_report', employeeId: employee._id, flowTaskUserId: payload.employee.flowTaskUserId,
          employeeName: employee.name, workDateKey: payload.dateKey, leaveRequestId: payload.leaveRequestId, leaveRetracted: retracted,
        } };
        if (existing) { await Message.updateOne({ _id: existing._id, workspaceId }, { $set: { ...changes, isEdited: true }, $push: { editHistory: { content: existing.content, htmlContent: existing.htmlContent, editedBy: bot._id, editedAt: new Date() } } }, { session }); message = { ...existing, ...changes }; }
        else if (!retracted) {
          [message] = await Message.create([{ ...filter, ...changes, authorId: bot._id, senderSnapshot: { name: 'FlowTask', avatar: bot.avatar }, visibleTo: [] }], { session });
          created = true;
          if (recipients.length) await Receipt.bulkWrite(recipients.map(userId => ({ updateOne: { filter: { workspaceId, channelId: channel._id, userId, messageId: null }, update: { $inc: { unreadCount: 1 } }, upsert: true } })), { session });
        }
      });
    } finally { await session.endSession(); }
    if (!message) continue;
    const [profiled] = await attachReportingProfiles([decryptMessageData(message, workspaceId)], workspaceId);
    for (const recipient of recipients) {
      if (retracted) emitToUser(recipient, 'message:delete', { messageId: String(message._id), channelId: String(channel._id), isDeleted: false }, String(workspaceId));
      else emitToUser(recipient, created ? 'message:create' : 'message:update', { message: messageSocketPayload(profiled) }, String(workspaceId));
      await reconcileLeaveUnread(recipient, workspaceId, channel._id);
    }
  }
  return { status: 'processed' };
}
