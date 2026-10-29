export const REPORT_TYPES = new Set(['attendance.checked_in', 'tracking.work_started', 'tracking.work_switched',
  'tracking.break_started', 'tracking.work_resumed', 'attendance.checked_out']);
export const DIRECTORY_TYPES = new Set(['reporting.department_synced', 'reporting.departments_reconciled', 'reporting.member_synced']);
const clean = value => String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, 1000);
export const escapeHtml = value => clean(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function reportingChannelName(name) {
  const normalized = clean(name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').replace(/team$/, '');
  return `${(normalized || 'department').slice(0, 52)}team-reporting-attendance`;
}
export function duration(seconds) {
  const minutes = Math.floor(Math.max(0, Number(seconds) || 0) / 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}h ${String(minutes % 60).padStart(2, '0')}m`;
}
export function contextLabel(context) {
  if (!context) return 'Attendance only';
  if (context.kind === 'INDIVIDUAL') return `Individual / ${clean(context.agenda) || 'Individual work'}${context.description ? ` — ${clean(context.description)}` : ''}${context.attributed ? ` (attributed to ${clean(context.project)} / ${clean(context.task)})` : ''}`;
  return `${clean(context.project) || 'Project'} / ${clean(context.task) || 'Task'}`;
}
export function formatReportingMessage(payload) {
  let zone = payload.timezone || 'UTC';
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); } catch { zone = 'UTC'; }
  const time = value => value ? new Intl.DateTimeFormat('en-IN', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(value)) : '—';
  const titles = { 'attendance.checked_in': 'Checked in', 'tracking.work_started': 'Work started',
    'tracking.work_switched': 'Switched work', 'tracking.break_started': 'On a break',
    'tracking.work_resumed': 'Work resumed', 'attendance.checked_out': 'Checked out' };
  const lines = [titles[payload.eventType], 'Employee: ' + clean(payload.employee.name),
    'Workday: ' + clean(payload.workDateKey), 'Time: ' + time(payload.occurredAt)];
  switch (payload.eventType) {
    case 'attendance.checked_in':
    case 'tracking.work_started':
      if (payload.workMode) lines.push('Work mode: ' + clean(payload.workMode));
      lines.push('Work: ' + contextLabel(payload.current));
      if (!payload.trackingStarted) lines.push('Tracking has not started.');
      break;
    case 'tracking.work_switched':
      lines.push('From: ' + contextLabel(payload.previous) + ' · ' + time(payload.previous?.startedAt) + '–' + time(payload.previous?.endedAt || payload.occurredAt) + ' · ' + duration(payload.previousSeconds),
        'Now: ' + contextLabel(payload.current));
      break;
    case 'tracking.break_started':
      lines.push('Work: ' + contextLabel(payload.previous), 'Worked: ' + duration(payload.workSeconds));
      break;
    case 'tracking.work_resumed':
      lines.push('Break: ' + duration(payload.breakSeconds), 'Work: ' + contextLabel(payload.current));
      break;
    case 'attendance.checked_out':
      lines.push('Hours: ' + time(payload.checkInAt) + '–' + time(payload.checkOutAt));
      for (const row of payload.summary?.rows || []) lines.push(contextLabel(row) + ' — ' + duration(row.seconds));
      lines.push('Total Tracked Work: ' + duration(payload.summary?.workSeconds));
      break;
  }
  const content = lines.join('\n');
  return { content, htmlContent: '<p>' + lines.map(escapeHtml).join('<br>') + '</p>' };
}
