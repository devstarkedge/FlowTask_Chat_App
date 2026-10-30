import { invalidateReportingHistory, useReportingHistoryStore } from '../stores/reportingHistoryStore';
import { queryClient } from '../queries/queryClient';

const revokedChannels = new Set();
const visibleTypes = new Set(['attendance.checked_in', 'attendance.checked_out', 'leave.daily_report']);
const channelIdOf = message => String(message?.channelId?._id || message?.channelId || '');

export function isVisibleReport(message) {
  return !message?.reportingMeta || (!revokedChannels.has(channelIdOf(message)) && visibleTypes.has(message.reportingMeta.eventType));
}

export function reportingSnapshot() {
  try {
    return {
      revision: useReportingHistoryStore?.getState?.()?.revision ?? 0,
      workspaceId: require('../stores/workspaceStore')?.useWorkspaceStore?.getState?.()?.activeWorkspaceId ?? null,
      viewerId: require('../stores/authStore')?.useAuthStore?.getState?.()?.user?._id ?? null,
    };
  } catch {
    return { revision: 0, workspaceId: null, viewerId: null };
  }
}

export function isReportingSnapshotCurrent(snapshot, channelId) {
  const current = reportingSnapshot();
  return !revokedChannels.has(String(channelId)) && current.revision === snapshot?.revision && current.workspaceId === snapshot?.workspaceId && current.viewerId === snapshot?.viewerId;
}

// These queries remain in memory only. Clear every projection, including search
// and pinned results, before asking the server for newly authorized data.
function scrub(value, removedChannel) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.filter(item => !item?.reportingMeta || (item.reportingMeta.eventType !== 'leave.daily_report' && channelIdOf(item) !== removedChannel)).map(item => scrub(item, removedChannel));
  if (value.reportingMeta?.eventType === 'leave.daily_report' || (value.reportingMeta && channelIdOf(value) === removedChannel)) return null;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'reportingHistory').map(([key, item]) => [key, scrub(item, removedChannel)]));
}

export function invalidateReportingAccess({ channelId, reset = false, refetch = true } = {}) {
  try {
    invalidateReportingHistory();
    if (reset) revokedChannels.clear();
    if (channelId) revokedChannels.add(String(channelId));
    for (const key of ['messages', 'pinnedMessages', 'threadReplies', 'search', 'notifications']) {
      try {
        void queryClient.cancelQueries({ queryKey: [key] });
        queryClient.setQueriesData({ queryKey: [key] }, value => scrub(value, channelId ? String(channelId) : undefined));
        if (refetch) void queryClient.invalidateQueries({ queryKey: [key] });
      } catch {}
    }
    const store = require('../chat/store')?.useChatStore;
    if (store?.setState) {
      store.setState(state => ({
        messagesByChannel: scrub(state?.messagesByChannel || {}, channelId ? String(channelId) : undefined)
      }));
    }
  } catch (err) {
    console.warn('[ReportingAccess] Invalidation failed:', err?.message);
  }
}

export function restoreReportingChannel(channelId) { revokedChannels.delete(String(channelId)); }
export function resetReportingAccess() { invalidateReportingAccess({ reset: true, refetch: false }); }
