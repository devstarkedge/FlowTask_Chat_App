/* eslint-disable react/prop-types */
import './AttendanceReportMessage.css'

const titles = {
  'attendance.checked_in': 'Checked in',
  'tracking.work_started': 'Work started',
  'tracking.work_switched': 'Switched work',
  'tracking.break_started': 'On a break',
  'tracking.work_resumed': 'Work resumed',
  'attendance.checked_out': 'Checked out',
}

const compact = value => value
  .replace(/\s*\([A-Za-z_]+\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?\)/g, '')
  .replace(/\b0*(\d+)h 0*(\d+)m\b/g, (_, h, m) => Number(h) ? h + 'h' + (Number(m) ? ' ' + Number(m) + 'm' : '') : Number(m) + 'm')

// Older persisted reports used verbose sections. Present those with the same
// compact layout as new reports without rewriting historical messages.
export function reportPresentation(message) {
  const lines = (message.content || '').split('\n').map(line => line.trim()).filter(Boolean)
  const field = label => lines.find(line => line.toLowerCase().startsWith(label.toLowerCase() + ':'))?.slice(label.length + 1).trim()
  const details = []
  let group = null
  const flush = () => {
    if (group) details.push({ label: group.label, value: compact([group.work, group.start && group.end ? group.start + '–' + group.end : null, group.duration].filter(Boolean).join(' · ')) })
    group = null
  }
  for (const line of lines.slice(1)) {
    if (/^Tracking: Not started$/i.test(line)) { details.push({ label: '', value: 'Tracking has not started.' }); continue }
    if (/^(Employee|Department|Workday|Time|Status|Tracking):/i.test(line)) continue
    if (line === 'Previous Work' || line === 'New Work') {
      flush()
      group = { label: line === 'Previous Work' ? 'From' : 'Now' }
      continue
    }
    if (group) {
      if (line.startsWith('Started:')) group.start = line.slice(8).trim()
      else if (line.startsWith('Ended:')) group.end = line.slice(6).trim()
      else if (line.startsWith('Duration:')) group.duration = line.slice(9).trim()
      else group.work = line
      continue
    }
    if (line === 'Attendance' || line === 'Work Summary') continue
    if (/^Leave:\s*NONE$/i.test(line)) continue
    const match = line.match(/^([^:]+):\s*(.*)$/)
    const labels = { 'Check-In': 'Check-in', 'Check-Out': 'Check-out', 'Work Mode': 'Work mode', 'Previous Work': 'Work', 'Work Completed So Far': 'Worked', 'Break Started': 'Break started', 'Personal Break Duration': 'Break', 'Resuming': 'Work', 'Attendance Duration': 'Attendance', 'Attendance Status': 'Outcome', 'Total Tracked Work': 'Tracked work', 'Total Personal Pause': 'Personal breaks' }
    if (match && (labels[match[1]] || ['Work mode', 'Work', 'From', 'Now', 'Worked', 'Break', 'Hours', 'Attendance', 'Tracked work', 'Personal breaks', 'Outcome', 'Leave', 'Pending uploads', 'Pending evidence uploads'].includes(match[1]))) details.push({ label: labels[match[1]] || match[1], value: compact(match[2]) })
    else details.push({ label: '', value: compact(line.replace(/^\d+\.\s*/, '')) })
  }
  flush()
  const rawDate = field('Workday') || message.reportingMeta?.workDateKey
  // This is a calendar date, so avoid converting it through the viewer's zone.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate || '') ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(rawDate + 'T00:00:00Z')) : rawDate
  return {
    title: titles[message.reportingMeta?.eventType] || lines[0] || 'Attendance',
    employee: field('Employee') || message.reportingMeta?.employeeName || 'Team member',
    stamp: [date, compact(field('Time') || '')].filter(Boolean).join(' · '),
    details,
  }
}

export default function AttendanceReportMessage({ message }) {
  const report = reportPresentation(message)
  return (
    <article className="attendance-report" aria-label={report.title + ' by ' + report.employee}>
      <header className="attendance-report__header">
        <strong className="attendance-report__employee">{report.employee}</strong>
        <span className="attendance-report__event">{report.title}</span>
      </header>
      <div className="attendance-report__stamp">{report.stamp}</div>
      <dl className="attendance-report__details">
        {report.details.map((detail, index) => (
          <div className={'attendance-report__row' + (detail.label ? '' : ' attendance-report__row--full')} key={index}>
            {detail.label && <dt>{detail.label}</dt>}
            <dd>{detail.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}
