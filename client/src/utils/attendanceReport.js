const titles = {
  'leave.daily_report': '🔔 On Leave',
  'attendance.checked_in': 'Checked in',
  'tracking.work_started': 'Work started',
  'tracking.work_switched': 'Switched work',
  'tracking.break_started': 'On a break',
  'tracking.work_resumed': 'Work resumed',
  'attendance.checked_out': 'Checked out',
}

const compact = value => value
  .replace(/\b0*(\d+)h 0*(\d+)m\b/g, (_, h, m) => Number(h) ? h + 'h' + (Number(m) ? ' ' + Number(m) + 'm' : '') : Number(m) + 'm')

// Older persisted reports used verbose sections. Present those with the same
// compact layout as new reports without rewriting historical messages.
export function reportPresentation(message) {
  const lines = (message.content || '').split('\n').map(line => line.trim()).filter(Boolean)
  const field = label => lines.find(line => line.toLowerCase().startsWith(label.toLowerCase() + ':'))?.slice(label.length + 1).trim()
  const auto = message.reportingMeta?.eventType === 'attendance.checked_out' && lines[0] === 'Auto Check-Out'
  const details = []
  let group = null
  const flush = () => {
    if (group) details.push({ label: group.label, value: compact([group.work, group.start && group.end ? group.start + '–' + group.end : null, group.duration].filter(Boolean).join(' · ')) })
    group = null
  }
  for (const line of lines.slice(1)) {
    // Hide this informational status in both current and legacy report cards.
    if (/^(Tracking: Not started|Tracking has not started\.?)$/i.test(line)) continue
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
    const labels = { 'Check-In': 'Check-in', 'Check-Out': 'Check-out', 'Work Mode': 'Work mode', 'Previous Work': 'Work', 'Work Completed So Far': 'Worked', 'Break Started': 'Break started', 'Personal Break Duration': 'Break', 'Resuming': 'Work', 'Attendance Duration': 'Attendance', 'Attendance Status': 'Outcome', 'Total Tracked Work': 'Tracked work', 'Total Work Time': 'Tracked work', 'Total Office Time': 'Office time', 'Total Personal Pause': 'Personal breaks' }
    if (match && (labels[match[1]] || ['Work mode', 'Work', 'From', 'Now', 'Worked', 'Break', 'Hours', 'Attendance', 'Tracked work', 'Personal breaks', 'Outcome', 'Leave', 'Pending uploads', 'Pending evidence uploads', 'Leave Type', 'Coverage', 'Effective checkout', 'Last activity', 'Reason'].includes(match[1]))) details.push({ label: labels[match[1]] || match[1], value: compact(match[2]) })
    else details.push({ label: '', value: compact(line.replace(/^\d+\.\s*/, '')) })
  }
  flush()
  if (message.reportingMeta?.eventType === 'attendance.checked_in' && message.reportingHistory?.canView && message.reportingHistory.initialWork?.label) {
    const work = details.find(row => row.label === 'Work')
    if (work?.value === 'Attendance only') {
      work.value = message.reportingHistory.initialWork.label
    }
  }
  if (message.reportingMeta?.eventType === 'tracking.break_started') details.length = 0
  if (message.reportingMeta?.eventType === 'attendance.checked_out') {
    const kept = details.filter(row => !['Attendance', 'Personal breaks', 'Outcome', 'Leave', 'Pending uploads', 'Pending evidence uploads', 'Check-in', 'Check-out', 'Tracked work', 'Office time'].includes(row.label)
      && !/^(Attendance outcome|Attendance pending review|Status:|Work Summary)/.test(row.value))
    const checkIn = details.find(row => row.label === 'Check-in')?.value
    const checkOut = details.find(row => row.label === 'Check-out')?.value
    if (!kept.some(row => row.label === 'Hours') && checkIn && checkOut) kept.unshift({ label: 'Hours', value: checkIn + '–' + checkOut })
    const total = details.find(row => row.label === 'Tracked work')
    if (total) kept.push({ label: details.some(row => row.label === 'Office time') ? 'Total Work Time' : 'Total working time', value: total.value, total: true })
    const office = details.find(row => row.label === 'Office time')
    if (office) kept.push({ label: 'Total Office Time', value: office.value, total: true })
    details.splice(0, details.length, ...kept)
  }
  const rawDate = field('Workday') || message.reportingMeta?.workDateKey
  // This is a calendar date, so avoid converting it through the viewer's zone.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate || '') ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(rawDate + 'T00:00:00Z')) : rawDate
  return {
    title: auto ? lines[0] : titles[message.reportingMeta?.eventType] || lines[0] || 'Attendance',
    employee: field('Employee') || message.reportingMeta?.employeeName || 'Team member',
    date,
    time: compact((field('Time') || '').replace(/\s*\([^)]*\)$/, '')),
    stamp: [date, compact((field('Time') || '').replace(/\s*\([^)]*\)$/, ''))].filter(Boolean).join(' · '),
    details,
  }
}

