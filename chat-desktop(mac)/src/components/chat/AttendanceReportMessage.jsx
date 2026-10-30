import { Avatar } from './MemberAvatarGroup'
import { useLiveProfileData } from '../../hooks/useLiveProfileData'
import { useState } from 'react'
import { useReportingHistoryStore } from '../../stores/reportingHistoryStore'
import { useAuthStore } from '../../stores/authStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import ReportingHistory from './ReportingHistory'
/* eslint-disable react/prop-types */
import './AttendanceReportMessage.css'

import { reportPresentation } from '../../utils/attendanceReport'

export default function AttendanceReportMessage({ message }) {
  const [initialWork, setInitialWork] = useState(null)
  const revision = useReportingHistoryStore(state => state.revision)
  const viewerId = useAuthStore(state => state.user?._id)
  const workspaceId = useWorkspaceStore(state => state.activeWorkspaceId)
  const validInitial = initialWork?.revision === revision && initialWork?.viewerId === viewerId && initialWork?.workspaceId === workspaceId
  const report = reportPresentation({ ...message, reportingHistory: validInitial ? { canView: true, initialWork } : null })
  const employee = useLiveProfileData(message.reportingEmployee || { _id: message.reportingMeta?.employeeId, flowTaskUserId: message.reportingMeta?.flowTaskUserId, name: report.employee, avatar: null })
  return (
    <article className="attendance-report" aria-label={report.title + ' by ' + report.employee}>
      <header className="attendance-report__header">
        <div className="attendance-report__identity">
          <Avatar member={employee} size={28} showStatus={false} />
          <div className="attendance-report__person">
            <div className="attendance-report__name-row">
              <strong className="attendance-report__employee">{employee.name || report.employee}</strong>
              <span className={"attendance-report__event" + (message.reportingMeta?.eventType === "attendance.checked_in" ? " attendance-report__event--checked-in" : "")}>{report.title}</span>
            </div>
            <div className="attendance-report__stamp">{report.date}</div>
          </div>
        </div>
        {report.time && <time className="attendance-report__time" dateTime={message.reportingMeta?.occurredAt}>{report.time}</time>}
      </header>
      <dl className="attendance-report__details">
        {report.details.map((detail, index) => (
          <div className={'attendance-report__row' + (detail.total ? ' attendance-report__row--total' : detail.label ? '' : ' attendance-report__row--full')} key={index}>
            {detail.label && <dt>{detail.label}</dt>}
            <dd>{detail.total ? "- " : ""}{detail.value}</dd>
          </div>
        ))}
      </dl>
      {message.reportingMeta?.eventType === 'attendance.checked_in' && <ReportingHistory message={message} present={reportPresentation} onInitialWork={setInitialWork} />}
    </article>
  )
}
