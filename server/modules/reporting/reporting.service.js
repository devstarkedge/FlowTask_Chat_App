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
import { reportingRecipients, hasReportingAccess } from './reportingAccess.js';
import { REPORT_TYPES, DIRECTORY_TYPES, reportingChannelName, formatReportingMessage } from './reportingFormat.js';

const validId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
export async function ensureAttendanceReportingIndexes() {
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
    const membershipHash = crypto.createHash('sha256').update(JSON.stringify([payload.active === true && access.active === true, access.allDepartments === true, [...access.departmentIds].sort(), member.isActive])).digest('hex');
    const updated = await WorkspaceMembership.findOneAndUpdate({ workspaceId, userId: user._id, $or: [
      { 'attendanceReportingAccess.version': { $lte: version } }, { 'attendanceReportingAccess.version': { $exists: false } },
    ] }, { $set: { attendanceReportingAccess: { active: payload.active === true && access.active === true,
      allDepartments: access.allDepartments === true, departmentIds: access.departmentIds, version, syncedAt: new Date(), membershipHash: member.attendanceReportingAccess?.membershipHash } } }, { returnDocument: 'after' });
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
  const digest = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const sent = new Set();
  for (const department of payload.departments) {
    if (sent.has(department.id)) continue;
    sent.add(department.id);
    const channel = await provisionReportingChannel(workspaceId, department);
    const filter = { workspaceId, channelId: channel._id, reportingEventId: payload.eventId };
    let created = false;
    let message = await Message.findOne(filter).select('_id reportingDigest reportingRevision').lean();
    const revision = payload.reportRevision || 1;
    if (!Number.isSafeInteger(revision) || revision < 1) throw new ValidationError('Invalid reporting revision');
    const updateMessage = async existing => {
      if (existing.reportingDigest === digest || (existing.reportingRevision || 1) > revision) return;
      if (payload.eventType !== 'attendance.checked_out' || (existing.reportingRevision || 1) === revision) throw new ValidationError('Reporting event ID was reused with different data');
      // Compare-and-set serializes summary revisions. Repository encryption is
      // reused, including search tokens, for every content update.
      const { encryptMessageData } = await import('../../services/encryption/messageEncryption.service.js');
      const encrypted = encryptMessageData({ ...formatReportingMessage(payload, department), contentType: 'system' }, workspaceId);
      await Message.updateOne({ _id: existing._id, workspaceId, reportingRevision: { $lt: revision } }, { $set: { ...encrypted, reportingDigest: digest, reportingRevision: revision } });
    };
    if (message) await updateMessage(message);
    if (!message) {
      try { message = await messageRepository.create({ ...filter, ...formatReportingMessage(payload, department),
        authorId: bot._id, senderSnapshot: { name: 'FlowTask', avatar: bot.avatar }, contentType: 'system',
        reportingDigest: digest, reportingRevision: revision, reportingMeta: { eventType: payload.eventType, occurredAt: payload.occurredAt,
          workDateKey: payload.workDateKey, employeeName: payload.employee.name, employeeId: user._id }, visibleTo: [] }); created = true; }
      catch (error) { if (error.code !== 11000) throw error; message = await Message.findOne(filter).select('_id reportingDigest reportingRevision').lean(); if (!message) throw error; await updateMessage(message); }
    }
    // Always re-emit the same persisted message on retry. Clients already dedup
    // message:create by _id; a crash after insert cannot lose realtime delivery.
    if (created) {
      const { default: messageService } = await import('../messages/message.service.js');
      await messageService._incrementUnreadForChannel(channel._id, bot._id, String(workspaceId));
    }
    const persisted = await messageRepository.findById(message._id, { workspaceId });
    const socketPayload = messageSocketPayload(persisted);
    for (const recipient of await reportingRecipients(channel)) {
      emitToUser(recipient, 'message:create', { message: socketPayload }, String(workspaceId));
      if (revision > 1) emitToUser(recipient, 'message:update', { message: socketPayload }, String(workspaceId));
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
