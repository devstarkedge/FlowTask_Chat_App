import ReportingHistory from './ReportingHistory'
/* eslint-disable react/prop-types */
import './AttendanceReportMessage.css'

import { reportPresentation } from '../../utils/attendanceReport'

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
          <div className={'attendance-report__row' + (detail.total ? ' attendance-report__row--total' : detail.label ? '' : ' attendance-report__row--full')} key={index}>
            {detail.label && <dt>{detail.label}</dt>}
            <dd>{detail.value}</dd>
          </div>
        ))}
      </dl>
      {message.reportingMeta?.eventType === 'attendance.checked_in' && <ReportingHistory message={message} present={reportPresentation} />}
    </article>
  )
}
