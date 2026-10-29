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
export function formatReportingMessage(payload, department) {
  let zone = payload.timezone || 'UTC';
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); } catch { zone = 'UTC'; }
  const time = value => value ? new Intl.DateTimeFormat('en-IN', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(value)) : '—';
  const titles = { 'attendance.checked_in': '🟢 CHECK-IN — Work Started', 'tracking.work_started': '🟢 WORK TRACKING STARTED',
    'tracking.work_switched': '🔄 WORK SWITCHED', 'tracking.break_started': '☕ PERSONAL BREAK STARTED',
    'tracking.work_resumed': '▶️ WORK RESUMED', 'attendance.checked_out': '🔴 CHECK-OUT — Daily Work Completed' };
  const title = payload.eventType === 'attendance.checked_in' && !payload.trackingStarted ? '🟢 CHECK-IN — Attendance Confirmed' : titles[payload.eventType];
  const lines = [title, `Employee: ${clean(payload.employee.name)}`, `Department: ${clean(department.name)}`,
    `Workday: ${clean(payload.workDateKey)}`, `Time: ${time(payload.occurredAt)} (${zone})`];
  switch (payload.eventType) {
    case 'attendance.checked_in':
    case 'tracking.work_started':
      lines.push(`Check-In: ${time(payload.checkInAt)}`, `Work Mode: ${clean(payload.workMode) || '—'}`,
        `Tracking: ${payload.current?.kind === 'TASK' ? 'Assigned Task' : payload.current ? 'Individual Work' : 'Not started'}`,
        contextLabel(payload.current), `Status: ${payload.trackingStarted ? 'Checked In & Tracking Started' : 'Checked In — Work tracking not started'}`); break;
    case 'tracking.work_switched':
      lines.push('', 'Previous Work', contextLabel(payload.previous), `Started: ${time(payload.previous?.startedAt)}`,
        `Ended: ${time(payload.previous?.endedAt || payload.occurredAt)}`, `Duration: ${duration(payload.previousSeconds)}`,
        '', 'New Work', contextLabel(payload.current), `Started: ${time(payload.current?.startedAt)}`, 'Status: Tracking Continued'); break;
    case 'tracking.break_started':
      lines.push(`Previous Work: ${contextLabel(payload.previous)}`, `Work Completed So Far: ${duration(payload.workSeconds)}`, 'Status: On Personal Pause'); break;
    case 'tracking.work_resumed':
      lines.push(`Break Started: ${time(payload.breakStartedAt)}`, `Personal Break Duration: ${duration(payload.breakSeconds)}`,
        `Resuming: ${contextLabel(payload.current)}`, 'Status: Tracking Running'); break;
    case 'attendance.checked_out':
      lines.push(`Check-In: ${time(payload.checkInAt)}`, `Check-Out: ${time(payload.checkOutAt)}`, '', 'Attendance',
        `Attendance Duration: ${duration(payload.attendanceSeconds)}`, `Attendance Status: ${clean(payload.outcome?.label || payload.outcome?.presenceState)}`,
        `Leave: ${clean(payload.outcome?.leaveState) || 'NONE'}`, '', 'Work Summary');
      for (const [index, row] of (payload.summary?.rows || []).entries()) lines.push(`${index + 1}. ${contextLabel(row)} — ${duration(row.seconds)}`);
      lines.push(`Total Tracked Work: ${duration(payload.summary?.workSeconds)}`, `Total Personal Pause: ${duration(payload.summary?.personalPauseSeconds)}`);
      if (payload.outcome?.provisional) lines.push('Attendance outcome is provisional — review required.');
      if (payload.pendingEvidenceUploads) lines.push(`Pending evidence uploads: ${payload.pendingEvidenceUploads} (work time comes from saved tracking segments).`);
      lines.push('Status: Checked Out — Work Completed'); break;
  }
  const content = lines.join('\n');
  return { content, htmlContent: `<p>${lines.map(escapeHtml).join('<br>')}</p>` };
}
