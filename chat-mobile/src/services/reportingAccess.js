import { invalidateReportingHistory, useReportingHistoryStore } from '../stores/reportingHistoryStore';
import { queryClient } from '../queries/queryClient';

const revokedChannels = new Set();
const visibleTypes = new Set(['attendance.checked_in', 'attendance.checked_out', 'leave.daily_report']);
const channelIdOf = message => String(message?.channelId?._id || message?.channelId || '');

export function isVisibleReport(message) {
  return !message?.reportingMeta || (!revokedChannels.has(channelIdOf(message)) && visibleTypes.has(message.reportingMeta.eventType));
}

export function reportingSnapshot() {
  return {
    revision: useReportingHistoryStore.getState().revision,
    workspaceId: require('../stores/workspaceStore').useWorkspaceStore.getState().activeWorkspaceId,
    viewerId: require('../stores/authStore').useAuthStore.getState().user?._id,
  };
}

export function isReportingSnapshotCurrent(snapshot, channelId) {
  const current = reportingSnapshot();
  return !revokedChannels.has(String(channelId)) && current.revision === snapshot.revision && current.workspaceId === snapshot.workspaceId && current.viewerId === snapshot.viewerId;
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
  invalidateReportingHistory();
  if (reset) revokedChannels.clear();
  if (channelId) revokedChannels.add(String(channelId));
  for (const key of ['messages', 'pinnedMessages', 'threadReplies', 'search', 'notifications']) {
    void queryClient.cancelQueries({ queryKey: [key] });
    queryClient.setQueriesData({ queryKey: [key] }, value => scrub(value, channelId ? String(channelId) : undefined));
    if (refetch) void queryClient.invalidateQueries({ queryKey: [key] });
  }
  const store = require('../chat/store').useChatStore;
  store.setState(state => ({ messagesByChannel: scrub(state.messagesByChannel, channelId ? String(channelId) : undefined) }));
}

export function restoreReportingChannel(channelId) { revokedChannels.delete(String(channelId)); }
export function resetReportingAccess() { invalidateReportingAccess({ reset: true, refetch: false }); }
