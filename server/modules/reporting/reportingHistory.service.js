import mongoose from 'mongoose';
import crypto from 'node:crypto';
import Message from '../messages/Message.model.js';
import Channel from '../channels/Channel.model.js';
import ChatUser from '../users/ChatUser.model.js';
import WorkspaceMembership from '../workspaces/WorkspaceMembership.model.js';
import ReportingActivity from './ReportingActivity.model.js';
import { hasReportingAccess, isReportingChannel } from './reportingAccess.js';
import { encrypt, decrypt } from '../../services/encryption/crypto.service.js';
import { formatReportingMessage } from './reportingFormat.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../middleware/errorHandler.js';

export const INTERMEDIATE_REPORT_TYPES = ['tracking.work_started', 'tracking.work_switched', 'tracking.break_started', 'tracking.work_resumed'];
const plain = value => value?.toObject ? value.toObject() : { ...value };
const id = value => String(value?._id || value || '');
const safeId = value => /^[a-f\d]{24}$/i.test(id(value));
export const reportingDigest = value => crypto.createHash('sha256').update(JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)).digest('hex');

export async function historyPrincipal(userId, workspaceId) {
  if (!safeId(userId) || !safeId(workspaceId)) return null;
  const [member, user] = await Promise.all([
    WorkspaceMembership.findOne({ workspaceId, userId, isActive: true }).lean(),
    ChatUser.findOne({ _id: userId, isActive: true, flowTaskUserId: { $type: 'string' } }).select('_id flowTaskUserId').lean(),
  ]);
  return member && user?.flowTaskUserId ? { member, userId: id(userId), flowTaskUserId: user.flowTaskUserId, workspaceId: id(workspaceId) } : null;
}
export function mayReadHistory(message, channel, principal) {
  if (!principal || !isReportingChannel(channel) || channel.isArchived || message.reportingMeta?.eventType !== 'attendance.checked_in' ||
    id(message.workspaceId) !== principal.workspaceId || id(message.channelId) !== id(channel) || !hasReportingAccess(channel, principal.member)) return false;
  // A ChatApp admin/custom role or HR reporting scope is never an Admin grant.
  const admin = principal.member.flowTaskAccess?.role === 'admin' && principal.member.attendanceReportingAccess?.historyAdmin === true;
  return admin || id(message.reportingMeta.employeeId) === principal.userId &&
    (!message.reportingMeta.flowTaskUserId || message.reportingMeta.flowTaskUserId === principal.flowTaskUserId);
}

// Fan-out is batched per report rather than querying memberships/counts once
// for every recipient in a large department.
export async function reportingHistoryAudience(message, channel) {
  const members = await WorkspaceMembership.find({ workspaceId: channel.workspaceId, isActive: true,
    'attendanceReportingAccess.active': true, $or: [
      { 'attendanceReportingAccess.allDepartments': true },
      { 'attendanceReportingAccess.departmentIds': String(channel.flowTaskRef.entityId) },
    ] }).lean();
  if (message.reportingMeta?.eventType !== 'attendance.checked_in') return members.map(member => ({ recipient: id(member.userId), reportingHistory: null }));
  const users = await ChatUser.find({ _id: { $in: members.map(m => m.userId) }, isActive: true, flowTaskUserId: { $type: 'string' } }).select('_id flowTaskUserId').lean();
  const mappings = new Map(users.map(user => [id(user), user.flowTaskUserId]));
  const audience = members.map(member => ({ recipient: id(member.userId), canView: mayReadHistory(message, channel,
    mappings.get(id(member.userId)) ? { member, userId: id(member.userId), flowTaskUserId: mappings.get(id(member.userId)), workspaceId: id(channel.workspaceId) } : null) }));
  const count = audience.some(row => row.canView) ? await ReportingActivity.countDocuments({ workspaceId: channel.workspaceId, checkInMessageId: message._id }) : 0;
  return audience.map(row => ({ recipient: row.recipient, reportingHistory: {
    canView: row.canView, ...(row.canView ? { count } : {}), viewerId: row.recipient, workspaceId: id(channel.workspaceId),
  } }));
}

export async function attachReportingHistory(messages, userId, workspaceId) {
  const output = messages.map(plain);
  const roots = output.filter(message => message.reportingMeta?.eventType === 'attendance.checked_in');
  if (!roots.length) return output;
  const principal = await historyPrincipal(userId, workspaceId);
  const channels = await Channel.find({ workspaceId, _id: { $in: roots.map(m => m.channelId) } }).lean();
  const byId = new Map(channels.map(c => [id(c), c]));
  const allowed = roots.filter(m => mayReadHistory(m, byId.get(id(m.channelId)), principal));
  const counts = allowed.length ? await ReportingActivity.aggregate([
    { $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId), checkInMessageId: { $in: allowed.map(m => m._id) } } },
    { $group: { _id: '$checkInMessageId', count: { $sum: 1 } } },
  ]) : [];
  const countById = new Map(counts.map(row => [id(row), row.count]));
  const allowedIds = new Set(allowed.map(id));
  for (const root of roots) root.reportingHistory = allowedIds.has(id(root))
    ? { canView: true, count: countById.get(id(root)) || 0, viewerId: id(userId), workspaceId: id(workspaceId) }
    : { canView: false, viewerId: id(userId), workspaceId: id(workspaceId) };
  return output;
}

export async function storeReportingActivity(payload, root, { legacy = false, legacyMessageId = null, legacyContent = null } = {}) {
  const filter = { workspaceId: root.workspaceId, channelId: root.channelId, eventId: payload.eventId };
  // Explicit snapshot whitelist; no policy, evidence, or unrelated user data.
  const snapshot = legacy ? { content: legacyContent } : Object.fromEntries([
    'eventType', 'occurredAt', 'workDateKey', 'timezone', 'employee', 'previous', 'current', 'previousSeconds',
    'workSeconds', 'breakSeconds', 'breakStartedAt', 'trackingStarted', 'workMode', 'checkInAt',
  ].filter(key => payload[key] !== undefined).map(key => [key, payload[key]]));
  const digest = reportingDigest(snapshot);
  const document = { ...filter, checkInMessageId: root._id, employeeId: root.reportingMeta.employeeId,
    attendanceSessionId: root.reportingMeta.attendanceSessionId, eventType: payload.eventType,
    occurredAt: payload.occurredAt, sequence: payload.eventSequence || 0, digest,
    payloadCipher: encrypt(JSON.stringify(snapshot), root.workspaceId), legacy, legacyMessageId };
  let existing = await ReportingActivity.findOne(filter).select('+payloadCipher').lean();
  if (!existing) {
    try { return await ReportingActivity.create(document); }
    catch (error) { if (error.code !== 11000) throw error; existing = await ReportingActivity.findOne(filter).select('+payloadCipher').lean(); }
  }
  if (!existing || id(existing.checkInMessageId) !== id(root) || id(existing.employeeId) !== id(root.reportingMeta.employeeId) ||
    existing.attendanceSessionId !== root.reportingMeta.attendanceSessionId || existing.eventType !== payload.eventType ||
    +new Date(existing.occurredAt) !== +new Date(payload.occurredAt)) throw new ValidationError('Activity identity cannot change');
  if (existing.legacy && !legacy) await ReportingActivity.updateOne({ ...filter, legacy: true }, { $set: { ...document, legacyMessageId: existing.legacyMessageId } });
  else if (!legacy && existing.digest !== digest) {
    if (reportingDigest(JSON.parse(decrypt(existing.payloadCipher, root.workspaceId))) !== digest) throw new ValidationError('Activity event ID was reused with different data');
    await ReportingActivity.updateOne(filter, { $set: { digest } });
  }
  return existing;
}

export async function readReportingActivity(messageId, userId, workspaceId, query = {}) {
  if (!safeId(messageId)) throw new NotFoundError('Check-in message');
  const root = await Message.findOne({ _id: messageId, workspaceId, 'reportingMeta.eventType': 'attendance.checked_in' }).lean();
  if (!root) throw new NotFoundError('Check-in message');
  const [channel, principal] = await Promise.all([
    Channel.findOne({ _id: root.channelId, workspaceId }).lean(), historyPrincipal(userId, workspaceId),
  ]);
  if (!mayReadHistory(root, channel, principal)) throw new ForbiddenError('Activity history is available only to this employee and the FlowTask workspace Admin');
  const filter = { workspaceId, channelId: root.channelId, checkInMessageId: root._id };
  let after = null;
  if (query.cursor) {
    try {
      const cursor = JSON.parse(Buffer.from(String(query.cursor).slice(0, 1000), 'base64url').toString());
      if (!Number.isFinite(+new Date(cursor.at)) || !Number.isSafeInteger(cursor.sequence) || typeof cursor.eventId !== 'string') throw new Error();
      after = { $or: [ { occurredAt: { $gt: new Date(cursor.at) } },
        { occurredAt: new Date(cursor.at), sequence: { $gt: cursor.sequence } },
        { occurredAt: new Date(cursor.at), sequence: cursor.sequence, eventId: { $gt: cursor.eventId } } ] };
    } catch { throw new ValidationError('Invalid history cursor'); }
  }
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 50, 1), 100);
  const [rows, count] = await Promise.all([
    ReportingActivity.find({ ...filter, ...after }).select('+payloadCipher').sort({ occurredAt: 1, sequence: 1, eventId: 1 }).limit(limit + 1).lean(),
    ReportingActivity.countDocuments(filter),
  ]);
  // Recheck after the DB read as a role/access update may have raced it.
  const current = await historyPrincipal(userId, workspaceId);
  const currentChannel = await Channel.findOne({ _id: root.channelId, workspaceId }).lean();
  if (!mayReadHistory(root, currentChannel, current)) throw new ForbiddenError('Activity history access changed');
  const page = rows.slice(0, limit), last = page.at(-1);
  return { count, items: page.map(row => {
    const snapshot = JSON.parse(decrypt(row.payloadCipher, workspaceId));
    return { eventId: row.eventId, eventType: row.eventType, occurredAt: row.occurredAt,
      content: row.legacy ? snapshot.content : formatReportingMessage(snapshot).content,
      reportingMeta: { eventType: row.eventType, occurredAt: row.occurredAt, workDateKey: root.reportingMeta.workDateKey } };
  }), nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify({ at: last.occurredAt, sequence: last.sequence, eventId: last.eventId })).toString('base64url') : null };
}
