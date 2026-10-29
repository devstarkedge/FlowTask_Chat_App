import ReportingActivity from './ReportingActivity.model.js';
import { INTERMEDIATE_REPORT_TYPES, storeReportingActivity, reportingHistoryAudience, reportingDigest } from './reportingHistory.service.js';
import { reconcileLegacyReportingHistory } from './reportingHistory.migration.js';
import { normalizeFlowTaskAccess } from '../flowtask/flowTaskWorkspaceRoleMap.js';
import crypto from 'node:crypto';
import Channel from '../channels/Channel.model.js';
import ChannelMember from '../channels/ChannelMember.model.js';
import ChatUser from '../users/ChatUser.model.js';
import WorkspaceMembership from '../workspaces/WorkspaceMembership.model.js';
import Message from '../messages/Message.model.js';
import messageRepository from '../messages/message.repository.js';
import { encryptPreview } from '../../services/encryption/messageEncryption.service.js';
import userRepository from '../users/user.repository.js';
import { emitToUser, joinChannelRoom, leaveChannelRoom, reconcileChannelRoomAccess } from '../../sockets/socketManager.js';
import { messageSocketPayload } from '../../utils/socketPayload.js';
import { ValidationError, ForbiddenError } from '../../middleware/errorHandler.js';
import { hasReportingAccess } from './reportingAccess.js';
import { REPORT_TYPES, DIRECTORY_TYPES, reportingChannelName, formatReportingMessage } from './reportingFormat.js';

const validId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
export async function ensureAttendanceReportingIndexes() {
  await ReportingActivity.createIndexes();
  await Message.collection.createIndex({ workspaceId: 1, channelId: 1, 'reportingMeta.attendanceSessionId': 1, 'reportingMeta.eventType': 1 });
  await Message.collection.createIndex({ workspaceId: 1, channelId: 1, 'reportingMeta.employeeId': 1, 'reportingMeta.eventType': 1, 'reportingMeta.occurredAt': -1 });
  await reconcileLegacyReportingHistory();
  await Message.collection.createIndex({ workspaceId: 1, channelId: 1, reportingEventId: 1 }, { unique: true, partialFilterExpression: { reportingEventId: { $type: 'string' } } });
  await Channel.collection.createIndex({ workspaceId: 1, 'flowTaskRef.entityType': 1, 'flowTaskRef.entityId': 1 }, { unique: true, partialFilterExpression: { 'flowTaskRef.entityType': { $type: 'string' }, 'flowTaskRef.entityId': { $type: 'string' } } });
  await WorkspaceMembership.collection.createIndex({ workspaceId: 1, 'attendanceReportingAccess.active': 1, 'attendanceReportingAccess.departmentIds': 1 });
  await WorkspaceMembership.collection.createIndex({ workspaceId: 1, 'attendanceReportingAccess.active': 1, 'attendanceReportingAccess.allDepartments': 1 });
}

const reportFilter = workspaceId => ({ workspaceId, 'flowTaskRef.entityType': 'attendance_department' });

export async function provisionReportingChannel(workspaceId, department, version = null) {
  if (!validId(department?.id) || typeof department.name !== 'string' || !department.name.trim()) throw new ValidationError('Invalid reporting department');
  const filter = { ...reportFilter(workspaceId), 'flowTaskRef.entityId': department.id };
  let channel = await Channel.findOne(filter);
  if (channel && version != null && (channel.reportingDirectoryVersion || 0) > version) return channel;
  // Slug includes the immutable source ID, so normalization collisions do not
  // merge departments. Display names follow the requested readable format.
  const updates = { name: reportingChannelName(department.name), systemManaged: true,
    type: 'system', visibility: 'private', departmentRef: { departmentId: department.id, departmentName: department.name },
    ...(version != null ? { reportingDirectoryVersion: version, isArchived: department.active === false,
      archivedReason: department.active === false ? 'flowtask_department_inactive' : null,
      archivedAt: department.active === false ? new Date() : null } : {}) };
  if (!channel) {
    try { channel = await Channel.create({ ...updates, workspaceId, slug: `attendance-${department.id}`,
      flowTaskRef: { entityType: 'attendance_department', entityId: department.id },
      ...(version == null ? { isArchived: true, archivedReason: 'awaiting_department_reconciliation' } : {}),
      description: 'Attendance and work activity reported by the verified FlowTask integration.' }); }
    catch (error) { if (error.code !== 11000) throw error; channel = await Channel.findOne(filter); if (!channel) throw error; }
  } else if (version != null) {
    channel = await Channel.findOneAndUpdate({ _id: channel._id, workspaceId, $or: [
      { reportingDirectoryVersion: { $lte: version } }, { reportingDirectoryVersion: { $exists: false } },
    ] }, { $set: updates }, { returnDocument: 'after' }) || channel;
  }
  return channel;
}

async function syncChannelMember(channel, userId, membership) {
  // Resolve again so a slow older directory handler cannot regrant access.
  membership = membership ? await WorkspaceMembership.findOne({ workspaceId: channel.workspaceId, userId }).lean() : null;
  const allowed = hasReportingAccess(channel, membership) && !channel.isArchived;
  const previous = await ChannelMember.findOne({ workspaceId: channel.workspaceId, channelId: channel._id, userId, isActive: true }).lean();
  if (allowed) {
    await ChannelMember.addMember(channel._id, userId, channel.workspaceId);
    if (!previous) {
      emitToUser(String(userId), 'channel:added', { channel: channel.toObject ? channel.toObject() : channel }, String(channel.workspaceId));
      await joinChannelRoom(String(userId), String(channel._id), String(channel.workspaceId));
    } else emitToUser(String(userId), 'channel:updated', { channelId: String(channel._id), updates: { name: channel.name, isArchived: channel.isArchived } }, String(channel.workspaceId));
  } else if (previous) {
    await ChannelMember.removeMember(channel._id, userId);
    await leaveChannelRoom(String(userId), String(channel._id), String(channel.workspaceId));
    emitToUser(String(userId), 'channel:removed', { channelId: String(channel._id) }, String(channel.workspaceId));
  }
}

async function syncDirectory(payload, workspaceId) {
  const version = payload.directoryVersion;
  if (!Number.isSafeInteger(version) || version <= 0) throw new ValidationError('Directory version is required');
  if (payload.eventType === 'reporting.department_synced') {
    const channel = await provisionReportingChannel(workspaceId, payload.department, version);
    const departmentHash = crypto.createHash('sha256').update(JSON.stringify(payload.department)).digest('hex');
    if (channel.reportingDirectoryHash === departmentHash && !payload.reconcile) return;
    const memberships = await WorkspaceMembership.find({ workspaceId, isActive: true, 'attendanceReportingAccess.active': true, $or: [
      { 'attendanceReportingAccess.allDepartments': true }, { 'attendanceReportingAccess.departmentIds': payload.department.id },
    ] }).lean();
    for (const member of memberships) await syncChannelMember(channel, member.userId, member);
    // Archival also revokes stale channel rooms and persists history.
    if (channel.isArchived) {
      const old = await ChannelMember.find({ workspaceId, channelId: channel._id, isActive: true }).lean();
      for (const member of old) await syncChannelMember(channel, member.userId, null);
    }
    await Channel.updateOne({ _id: channel._id, workspaceId, reportingDirectoryVersion: version }, { $set: { reportingDirectoryHash: departmentHash } });
  } else if (payload.eventType === 'reporting.departments_reconciled') {
    if (!Array.isArray(payload.departmentIds) || !payload.departmentIds.every(validId)) throw new ValidationError('Invalid department directory');
    const channels = await Channel.find({ ...reportFilter(workspaceId), 'flowTaskRef.entityId': { $nin: payload.departmentIds },
      $or: [{ reportingDirectoryVersion: { $lte: version } }, { reportingDirectoryVersion: { $exists: false } }] });
    for (const channel of channels) {
      await Channel.updateOne({ _id: channel._id, workspaceId, $or: [{ reportingDirectoryVersion: { $lte: version } }, { reportingDirectoryVersion: { $exists: false } }] },
        { $set: { isArchived: true, archivedReason: 'flowtask_department_deleted', archivedAt: new Date(), reportingDirectoryVersion: version } });
      channel.isArchived = true;
      for (const member of await ChannelMember.find({ workspaceId, channelId: channel._id, isActive: true }).lean()) await syncChannelMember(channel, member.userId, null);
    }
  } else {
    if (!validId(payload.employee?.flowTaskUserId)) throw new ValidationError('Invalid employee mapping');
    const user = await ChatUser.findOne({ flowTaskUserId: payload.employee.flowTaskUserId }).lean();
    // Directory provisioning does not guess identity by email or create a
    // membership. Existing SSO/provisioning owns these verified mappings.
    if (!user) return;
    const member = await WorkspaceMembership.findOne({ workspaceId, userId: user._id });
    if (!member) return;
    if ((member.attendanceReportingAccess?.version || 0) > version) return;
    const access = payload.reportingAccess;
    if (!access || !Array.isArray(access.departmentIds) || !access.departmentIds.every(validId)) throw new ValidationError('Invalid reporting access');
    const membershipHash = crypto.createHash('sha256').update(JSON.stringify([payload.active === true && access.active === true, access.allDepartments === true, access.historyAdmin === true, payload.access?.role, [...access.departmentIds].sort(), member.isActive])).digest('hex');
    let sourceAccess = null;
    if (payload.access?.role) {
      const { _workspaceRole, _isCustomRole, ...normalized } = normalizeFlowTaskAccess(payload.access);
      sourceAccess = normalized;
    }
    const sourceIsCurrent = sourceAccess && (!member.flowTaskAccess?.syncedAt || +new Date(sourceAccess.syncedAt) >= +new Date(member.flowTaskAccess.syncedAt));
    const updated = await WorkspaceMembership.findOneAndUpdate({ workspaceId, userId: user._id,
      ...(sourceIsCurrent ? { $and: [{ $or: [{ 'flowTaskAccess.syncedAt': null }, { 'flowTaskAccess.syncedAt': { $lte: sourceAccess.syncedAt } }] }] } : {}), $or: [
      { 'attendanceReportingAccess.version': { $lte: version } }, { 'attendanceReportingAccess.version': { $exists: false } },
    ] }, { $set: { ...(sourceIsCurrent ? { flowTaskAccess: sourceAccess } : {}), attendanceReportingAccess: { active: payload.active === true && access.active === true,
      allDepartments: access.allDepartments === true, historyAdmin: sourceIsCurrent && sourceAccess.role === 'admin' && access.historyAdmin === true, departmentIds: access.departmentIds, version, syncedAt: new Date(), membershipHash: member.attendanceReportingAccess?.membershipHash } } }, { returnDocument: 'after' });
    if (!updated) return;
    if (updated.attendanceReportingAccess.membershipHash === membershipHash && !payload.reconcile) return;
    const previousChannels = await ChannelMember.find({ workspaceId, userId: user._id, isActive: true }).select('channelId').lean();
    const channelFilter = reportFilter(workspaceId);
    if (!access.allDepartments) channelFilter.$or = [{ 'flowTaskRef.entityId': { $in: access.departmentIds } }, { _id: { $in: previousChannels.map(m => m.channelId) } }];
    for (const channel of await Channel.find(channelFilter)) await syncChannelMember(channel, user._id, updated);
    await WorkspaceMembership.updateOne({ workspaceId, userId: user._id, 'attendanceReportingAccess.version': version }, { $set: { 'attendanceReportingAccess.membershipHash': membershipHash } });
    emitToUser(String(user._id), 'reporting:access-updated', { workspaceId: String(workspaceId) }, String(workspaceId));
  }
}

export async function handleReportingEvent(payload, workspaceId) {
  if (!validId(payload.workspaceId) || !payload.eventId || typeof payload.eventId !== 'string' || payload.eventId.length > 250) throw new ValidationError('Invalid reporting event identity');
  if (DIRECTORY_TYPES.has(payload.eventType)) { await syncDirectory(payload, workspaceId); return { status: 'processed' }; }
  if (!REPORT_TYPES.has(payload.eventType) || !validId(payload.employee?.flowTaskUserId) || !validId(payload.attendanceSessionId) ||
    !Array.isArray(payload.departments) || !/^\d{4}-\d{2}-\d{2}$/.test(payload.workDateKey) || !Number.isFinite(+new Date(payload.occurredAt))) throw new ValidationError('Invalid attendance report');
  const user = await ChatUser.findOne({ flowTaskUserId: payload.employee.flowTaskUserId }).lean();
  if (!user || !await WorkspaceMembership.exists({ userId: user._id, workspaceId })) throw new ForbiddenError('Verified employee workspace mapping is missing; retry after SSO provisioning');
  const bot = await userRepository.ensureBotUser();
  const digest = reportingDigest(payload);
  const sent = new Set();
  for (const department of payload.departments) {
    if (sent.has(department.id)) continue;
    sent.add(department.id);
    const channel = await provisionReportingChannel(workspaceId, department);
    const rootEventId = 'report-checkin-' + payload.attendanceSessionId;
    if (INTERMEDIATE_REPORT_TYPES.includes(payload.eventType)) {
      let root = await Message.findOne({ workspaceId, channelId: channel._id, reportingEventId: rootEventId }).lean();
      if (!root && payload.initialCheckIn?.attendanceSessionId === payload.attendanceSessionId &&
        payload.initialCheckIn?.employee?.flowTaskUserId === payload.employee.flowTaskUserId && payload.initialCheckIn.workspaceId === payload.workspaceId) {
        await handleReportingEvent({ ...payload.initialCheckIn, eventId: rootEventId, eventType: 'attendance.checked_in',
          presentationVersion: 2, departments: [department] }, workspaceId);
        root = await Message.findOne({ workspaceId, channelId: channel._id, reportingEventId: rootEventId }).lean();
      }
      if (!root || String(root.reportingMeta.employeeId) !== String(user._id)) throw new ValidationError('Verified check-in anchor is missing; retry source delivery');
      if (!root.reportingMeta.attendanceSessionId) {
        await Message.updateOne({ _id: root._id, workspaceId }, { $set: { 'reportingMeta.attendanceSessionId': payload.attendanceSessionId } });
        root.reportingMeta.attendanceSessionId = payload.attendanceSessionId;
      }
      if (root.reportingMeta.attendanceSessionId !== payload.attendanceSessionId) throw new ValidationError('Activity belongs to another attendance session');
      await storeReportingActivity(payload, root);
      // Retain any old standalone message, but retire it from all public reads.
      await Message.updateOne({ workspaceId, channelId: channel._id, reportingEventId: payload.eventId }, { $set: {
        'reportingMeta.attendanceSessionId': payload.attendanceSessionId, 'reportingMeta.historySchemaVersion': 2,
      } });
      for (const { recipient, reportingHistory } of await reportingHistoryAudience(root, channel)) {
        if (reportingHistory?.canView) emitToUser(recipient, 'reporting:activity-updated', {
          workspaceId: String(workspaceId), channelId: String(channel._id), messageId: String(root._id), reportingHistory,
        }, String(workspaceId));
      }
      continue;
    }
    const filter = { workspaceId, channelId: channel._id, reportingEventId: payload.eventId };
    let created = false;
    let message = await Message.findOne(filter).select('_id reportingDigest reportingRevision reportingMeta reportingDigestVersion').lean();
    const revision = payload.reportRevision || 1;
    if (!Number.isSafeInteger(revision) || revision < 1) throw new ValidationError('Invalid reporting revision');
    const updateMessage = async existing => {
      if (existing.reportingMeta && (String(existing.reportingMeta.employeeId) !== String(user._id) || existing.reportingMeta.attendanceSessionId && existing.reportingMeta.attendanceSessionId !== payload.attendanceSessionId)) throw new ValidationError('Report identity cannot change');
      if (existing.reportingDigest === digest || (existing.reportingRevision || 1) > revision) return;
      const upgrade = payload.presentationVersion === 2 && (existing.reportingMeta?.historySchemaVersion !== 2 || existing.reportingDigestVersion !== 2);
      if (!upgrade && (payload.eventType !== 'attendance.checked_out' || (existing.reportingRevision || 1) === revision)) throw new ValidationError('Reporting event ID was reused with different data');
      // Compare-and-set serializes summary revisions. Repository encryption is
      // reused, including search tokens, for every content update.
      const { encryptMessageData } = await import('../../services/encryption/messageEncryption.service.js');
      const encrypted = encryptMessageData({ ...formatReportingMessage(payload, department), contentType: 'system' }, workspaceId);
      await Message.updateOne({ _id: existing._id, workspaceId, ...(upgrade ? { 'reportingMeta.historySchemaVersion': { $ne: 2 } } : { reportingRevision: { $lt: revision } }) }, { $set: { ...encrypted, reportingDigest: digest, reportingDigestVersion: 2, reportingRevision: revision, 'reportingMeta.attendanceSessionId': payload.attendanceSessionId, 'reportingMeta.flowTaskUserId': payload.employee.flowTaskUserId, 'reportingMeta.historySchemaVersion': 2 } });
    };
    if (message) await updateMessage(message);
    if (!message) {
      try { message = await messageRepository.create({ ...filter, ...formatReportingMessage(payload, department),
        authorId: bot._id, senderSnapshot: { name: 'FlowTask', avatar: bot.avatar }, contentType: 'system',
        reportingDigest: digest, reportingDigestVersion: 2, reportingRevision: revision, reportingMeta: { eventType: payload.eventType, occurredAt: payload.occurredAt,
          workDateKey: payload.workDateKey, employeeName: payload.employee.name, employeeId: user._id, flowTaskUserId: payload.employee.flowTaskUserId, attendanceSessionId: payload.attendanceSessionId, historySchemaVersion: payload.presentationVersion === 2 ? 2 : 1 }, visibleTo: [] }); created = true; }
      catch (error) { if (error.code !== 11000) throw error; message = await Message.findOne(filter).select('_id reportingDigest reportingRevision reportingMeta reportingDigestVersion').lean(); if (!message) throw error; await updateMessage(message); }
    }
    // Re-emit the persisted ID on retry; message:update can also recover a
    // missing client entry without issuing another unread increment.
    if (created) {
      const { default: messageService } = await import('../messages/message.service.js');
      await messageService._incrementUnreadForChannel(channel._id, bot._id, String(workspaceId));
    }
    const persisted = await messageRepository.findById(message._id, { workspaceId });
    for (const { recipient, reportingHistory } of await reportingHistoryAudience(persisted, channel)) {
      const socketPayload = messageSocketPayload(persisted, { reportingHistory });
      emitToUser(recipient, created ? 'message:create' : 'message:update', { message: socketPayload }, String(workspaceId));
    }
    // A corrected checkout may be older than another employee's newest
    // report. Preserve the channel's current position in the sidebar.
    await Channel.updateOne({ _id: channel._id, workspaceId, $or: [
      { lastMessageAt: null }, { lastMessageAt: { $lte: persisted.createdAt } },
    ] }, { $set: { lastMessagePreview: encryptPreview('FlowTask attendance report', workspaceId), lastMessageAt: persisted.createdAt } });
    await reconcileChannelRoomAccess(String(channel._id), String(workspaceId));
  }
  return { status: 'processed' };
}
