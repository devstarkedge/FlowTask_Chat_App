import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function load(relative, mocks = {}) {
  const result = await build({ entryPoints: [path.join(root, relative)], bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent', external: Object.keys(mocks) });
  const module = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: name => { if (name in mocks) return mocks[name]; throw Error('Unexpected dependency ' + name); }, setTimeout, clearTimeout, console, process });
  return module.exports;
}
const report = (eventType, content) => ({ _id: 'report', channelId: 'department', content, reportingMeta: { eventType, employeeName: 'John Doe', workDateKey: '2026-10-29' } });

test('checkout uses the compact total and hides attendance/outcome/private details', async () => {
  const { reportPresentation } = await load('src/utils/attendanceReport.js');
  const actual = reportPresentation(report('attendance.checked_out', 'Checked out\nEmployee: John Doe\nDepartment: Frontend\nTime: 03:43 pm (Asia/Kolkata)\nAttendance: 02h 54m\nPersonal breaks: 0m\nOutcome: Absent\nHours: 12:49 pm–03:43 pm\nFlow Task / Test — 44m\nTracked work: 02h 53m'));
  assert.equal(actual.employee, 'John Doe'); assert.equal(actual.date, '29 Oct 2026'); assert.equal(actual.time, '03:43 pm');
  assert.equal(actual.details.at(-1).label, 'Total working time'); assert.equal(actual.details.at(-1).value, '2h 53m');
  assert.equal(actual.details.some(row => ['Attendance', 'Personal breaks', 'Outcome', 'Department'].includes(row.label)), false);
});
test('break history shows only On a break, and approved initial work fixes attendance-only check-in', async () => {
  const { reportPresentation } = await load('src/utils/attendanceReport.js');
  const pause = reportPresentation(report('tracking.break_started', 'On a break\nWork: Project / Task\nWorked: 1m'));
  assert.equal(pause.title, 'On a break'); assert.equal(pause.details.length, 0);
  const checkIn = report('attendance.checked_in', 'Checked in\nWork: Attendance only\nTracking: Not started');
  assert.equal(reportPresentation(checkIn).details[0].value, 'Attendance only');
  const authorized = reportPresentation({ ...checkIn, reportingHistory: { canView: true, initialWork: { label: 'Project / Task' } } });
  assert.equal(authorized.details[0].value, 'Project / Task'); assert.equal(authorized.details.length, 1);
});
for (const [type, coverage] of [['Full Day', 'Full Day'], ['Half Day', 'Second Half'], ['Short Leave', '02:00 pm–03:00 pm']]) {
  test(type + ' leave preserves actual approved coverage', async () => {
    const { reportPresentation } = await load('src/utils/attendanceReport.js');
    const actual = reportPresentation(report('leave.daily_report', `🔔 On Leave — John Doe\nEmployee: John Doe\nWorkday: 2026-10-29\nLeave Type: ${type}\nCoverage: ${coverage}`));
    assert.equal(actual.title, '🔔 On Leave'); assert.equal(actual.details.find(row => row.label === 'Coverage').value, coverage);
  });
}
test('access changes scrub private leave and cached history in all projections and reject stale requests', async () => {
  let revision = 0, workspaceId = 'workspace', viewerId = 'owner';
  const leave = report('leave.daily_report', 'private leave');
  const attendance = { ...report('attendance.checked_in', 'Checked in'), reportingHistory: { canView: true, count: 4 } };
  const data = { messages: { pages: [{ items: [attendance, leave, { _id: 'ordinary', content: 'hello' }] }] }, pinnedMessages: [leave], search: { results: [leave] } };
  let secondary = { messagesByChannel: { department: [attendance, leave] } };
  const cancelled = [], refreshed = [];
  const access = await load('src/services/reportingAccess.js', {
    '../stores/reportingHistoryStore': { invalidateReportingHistory: () => revision++, useReportingHistoryStore: { getState: () => ({ revision }) } },
    '../queries/queryClient': { queryClient: { cancelQueries: ({ queryKey }) => cancelled.push(queryKey[0]), setQueriesData: ({ queryKey }, update) => { if (data[queryKey[0]]) data[queryKey[0]] = update(data[queryKey[0]]); }, invalidateQueries: ({ queryKey }) => refreshed.push(queryKey[0]) } },
    '../stores/workspaceStore': { useWorkspaceStore: { getState: () => ({ activeWorkspaceId: workspaceId }) } },
    '../stores/authStore': { useAuthStore: { getState: () => ({ user: { _id: viewerId } }) } },
    '../chat/store': { useChatStore: { setState: update => { secondary = { ...secondary, ...update(secondary) }; } } },
  });
  const original = access.reportingSnapshot();
  access.invalidateReportingAccess();
  assert.equal(access.isReportingSnapshotCurrent(original, 'department'), false);
  assert.equal(data.messages.pages[0].items.length, 2); assert.equal(data.messages.pages[0].items[0].reportingHistory, undefined);
  assert.equal(data.pinnedMessages.length, 0); assert.equal(data.search.results.length, 0); assert.equal(secondary.messagesByChannel.department.length, 1);
  assert.ok(cancelled.includes('messages')); assert.ok(refreshed.includes('messages'));
  const tenantA = access.reportingSnapshot(); workspaceId = 'other'; assert.equal(access.isReportingSnapshotCurrent(tenantA, 'department'), false);
  workspaceId = 'workspace'; viewerId = 'other'; assert.equal(access.isReportingSnapshotCurrent(tenantA, 'department'), false);
  access.invalidateReportingAccess({ channelId: 'department' }); assert.equal(access.isVisibleReport(attendance), false);
  assert.equal(data.messages.pages[0].items.some(item => item.reportingMeta), false);
  access.restoreReportingChannel('department'); assert.equal(access.isVisibleReport(attendance), true);
  assert.equal(access.isVisibleReport(report('tracking.work_started', 'hidden event')), false);
});
test('native message cache permanently removes revoked leave instead of retaining an empty card', async () => {
  let cache = { pages: [{ items: [report('leave.daily_report', 'private'), { _id: 'ordinary', content: 'hello' }] }] };
  const { removeMessageFromCache } = await load('src/queries/cacheUtils.js', {
    './queryClient': { queryClient: { getQueryData: () => cache, setQueryData: (_, value) => { cache = value; } } },
    './queryKeys': { queryKeys: { messages: id => ['messages', id] } },
    '../services/reportingAccess': { isVisibleReport: () => true },
  });
  removeMessageFromCache('department', 'report', true);
  assert.equal(cache.pages[0].items.length, 1); assert.equal(cache.pages[0].items[0]._id, 'ordinary');
});

test('web, Windows, Mac and mobile use identical report formatting', async () => {
 const {readFile} = await import('node:fs/promises');
 const local = await readFile(path.join(root,'src/utils/attendanceReport.js'),'utf8');
 for(const app of ['client','chat-desktop','chat-desktop(mac)']) assert.equal((await readFile(path.join(root,'..',app,'src/utils/attendanceReport.js'),'utf8')).replace(/\r\n/g,'\n'),local.replace(/\r\n/g,'\n'));
});
