import Message from '../messages/Message.model.js';
import { decryptMessageData } from '../../services/encryption/messageEncryption.service.js';
import { INTERMEDIATE_REPORT_TYPES, storeReportingActivity } from './reportingHistory.service.js';
import logger from '../../utils/logger.js';

// Additive, restart-safe conversion. Legacy messages remain intact as source
// records, hidden by the Message query guard. Never delete or guess an overlap.
export async function reconcileLegacyReportingHistory() {
  let cursor = null, unresolved = 0;
  for (;;) {
    const rows = await Message.find({ 'reportingMeta.eventType': { $in: INTERMEDIATE_REPORT_TYPES },
      'reportingMeta.historySchemaVersion': { $ne: 2 }, ...(cursor ? { _id: { $gt: cursor } } : {}) })
      .setOptions({ includeReportingActivity: true }).sort('_id').limit(100).lean();
    if (!rows.length) break;
    for (const row of rows) {
      const scope = { workspaceId: row.workspaceId, channelId: row.channelId, 'reportingMeta.employeeId': row.reportingMeta.employeeId };
      const at = row.reportingMeta.occurredAt;
      const roots = await Message.find({ ...scope, 'reportingMeta.eventType': 'attendance.checked_in', 'reportingMeta.occurredAt': { $lte: at } })
        .sort({ 'reportingMeta.occurredAt': -1 }).limit(2).lean();
      const root = roots[0];
      const sessionId = root?.reportingMeta.attendanceSessionId || root?.reportingEventId?.match(/^report-checkin-([a-f\d]{24})$/i)?.[1];
      if (!sessionId || roots[1] && +new Date(roots[1].reportingMeta.occurredAt) === +new Date(root.reportingMeta.occurredAt)) { unresolved++; continue; }
      const closed = await Message.exists({ ...scope, 'reportingMeta.eventType': 'attendance.checked_out',
        'reportingMeta.occurredAt': { $gte: root.reportingMeta.occurredAt, $lt: at } });
      if (closed) { unresolved++; continue; }
      root.reportingMeta.attendanceSessionId = sessionId;
      await Message.updateOne({ _id: root._id, workspaceId: root.workspaceId }, { $set: { 'reportingMeta.attendanceSessionId': sessionId } });
      const decrypted = decryptMessageData(row, row.workspaceId);
      await storeReportingActivity({ eventId: row.reportingEventId, eventType: row.reportingMeta.eventType, occurredAt: at }, root,
        { legacy: true, legacyMessageId: row._id, legacyContent: decrypted.content });
      await Message.updateOne({ _id: row._id, workspaceId: row.workspaceId }, { $set: { 'reportingMeta.historySchemaVersion': 2, 'reportingMeta.attendanceSessionId': sessionId } });
    }
    cursor = rows.at(-1)._id;
  }
  if (unresolved) logger.warn('Reporting history retained unresolved legacy events for verified source replay', { unresolved });
}
