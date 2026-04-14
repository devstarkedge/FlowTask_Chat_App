/* eslint-disable react/prop-types */
import { ExternalLink } from 'lucide-react'
import { buildRedirectFromMeta } from '../../utils/flowTaskUrl'

/**
 * EVENT_CONFIG — maps event types to display labels and accent colors.
 * Colors use CSS custom properties from the app's design system.
 */
const EVENT_CONFIG = {
  TASK_CREATED:          { label: 'created a new task',      accent: 'var(--accent-primary)' },
  TASK_UPDATED:          { label: 'updated task',            accent: 'var(--accent-primary)' },
  TASK_DELETED:          { label: 'deleted task',            accent: 'var(--accent-red)' },
  TASK_ASSIGNED:         { label: 'assigned task',           accent: 'var(--accent-purple)' },
  TASK_COMMENTED:        { label: 'commented on task',       accent: 'var(--text-link)' },
  TASK_STATUS_CHANGED:   { label: 'changed task status',     accent: 'var(--accent-primary)' },
  TASK_DUE_DATE_CHANGED: { label: 'changed due date',        accent: 'var(--accent-yellow)' },
  TIME_ENTRY_ADDED:      { label: 'logged time',             accent: 'var(--accent-orange)' },
  ANNOUNCEMENT_CREATED:  { label: 'posted an announcement',  accent: 'var(--accent-primary)' },
}

/**
 * Premium auto-activity message card for FlowTask bot notifications.
 * Features: clean blue theme, structured info hierarchy, hover CTA with deep-link.
 */
export default function AutoActivityMessage({ message }) {
  const meta = message.activityMeta || {}
  const config = EVENT_CONFIG[meta.eventType] || EVENT_CONFIG.TASK_CREATED
  const redirect = buildRedirectFromMeta(meta)

  const isAnnouncement = meta.eventType === 'ANNOUNCEMENT_CREATED'
  const isStatusChange = meta.eventType === 'TASK_STATUS_CHANGED'
  const isDueDateChange = meta.eventType === 'TASK_DUE_DATE_CHANGED'
  const isAssignment = meta.eventType === 'TASK_ASSIGNED'
  const isTimeEntry = meta.eventType === 'TIME_ENTRY_ADDED'

  return (
    <div className="auto-activity-card" style={{ borderLeftColor: config.accent }}>
      {/* Hover CTA — only rendered when a valid redirect URL exists */}
      {redirect && (
        <div className="activity-cta">
          <a
            href={redirect.url}
            target="_blank"
            rel="noopener noreferrer"
            className="activity-cta-btn"
            title="Open in FlowTask"
          >
            {redirect.label}
            <ExternalLink size={11} />
          </a>
        </div>
      )}

      {/* Main content */}
      <div style={{ paddingRight: redirect ? 100 : 0 }}>
        {/* Actor + Action line */}
        <div style={{ lineHeight: 1.5 }}>
          <span className="activity-actor">{meta.actorName || 'Someone'}</span>
          {' '}
          <span className="activity-action">{config.label}</span>
        </div>

        {/* Target — task title or announcement title */}
        {!isAnnouncement && meta.taskTitle && (
          <div className="activity-detail" style={{ marginTop: 3 }}>
            <span className="activity-detail-label">Task:</span>
            <span className="activity-target">{meta.taskTitle}</span>
          </div>
        )}

        {isAnnouncement && meta.announcementTitle && (
          <div className="activity-detail" style={{ marginTop: 3 }}>
            <span className="activity-detail-label">Announcement:</span>
            <span className="activity-target">{meta.announcementTitle}</span>
          </div>
        )}

        {/* Status change pills */}
        {isStatusChange && meta.oldValue && meta.newValue && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
            <StatusPill status={meta.oldValue} />
            <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 500 }}>→</span>
            <StatusPill status={meta.newValue} />
          </div>
        )}

        {/* Due date change */}
        {isDueDateChange && (meta.oldValue || meta.newValue) && (
          <div className="activity-detail" style={{ marginTop: 5 }}>
            <span className="activity-detail-label">From:</span>
            <span className="activity-detail-value">{meta.oldValue || 'none'}</span>
            <span style={{ color: 'var(--text-muted)', margin: '0 2px' }}>→</span>
            <span className="activity-detail-label">To:</span>
            <span className="activity-detail-value">{meta.newValue || 'removed'}</span>
          </div>
        )}

        {/* Assignment target */}
        {isAssignment && meta.newValue && (
          <div className="activity-detail" style={{ marginTop: 3 }}>
            <span className="activity-detail-label">Assigned to:</span>
            <span className="activity-detail-value">{meta.newValue}</span>
          </div>
        )}

        {/* Time entry duration */}
        {isTimeEntry && meta.newValue && (
          <div className="activity-detail" style={{ marginTop: 3 }}>
            <span className="activity-detail-label">Duration:</span>
            <span className="activity-detail-value">{meta.newValue}</span>
          </div>
        )}

        {/* Project name */}
        {meta.projectName && (
          <div className="activity-detail">
            <span className="activity-detail-label">Project:</span>
            <span className="activity-detail-value">{meta.projectName}</span>
          </div>
        )}

        {/* Category (announcements) */}
        {isAnnouncement && meta.category && (
          <div className="activity-detail">
            <span className="activity-detail-label">Category:</span>
            <span className="activity-detail-value">{meta.category}</span>
          </div>
        )}

        {/* Timestamp */}
        <div className="activity-timestamp">
          {formatTime(message.createdAt)}
        </div>
      </div>
    </div>
  )
}

function StatusPill({ status }) {
  const STATUS_COLORS = {
    'planning':     { bg: 'rgba(99, 102, 241, 0.10)', text: '#818cf8' },
    'todo':         { bg: 'rgba(99, 102, 241, 0.10)', text: '#818cf8' },
    'in-progress':  { bg: 'rgba(59, 130, 246, 0.10)', text: '#60a5fa' },
    'in progress':  { bg: 'rgba(59, 130, 246, 0.10)', text: '#60a5fa' },
    'review':       { bg: 'rgba(168, 85, 247, 0.10)', text: '#c084fc' },
    'in review':    { bg: 'rgba(168, 85, 247, 0.10)', text: '#c084fc' },
    'completed':    { bg: 'rgba(34, 197, 94, 0.10)',  text: '#4ade80' },
    'done':         { bg: 'rgba(34, 197, 94, 0.10)',  text: '#4ade80' },
    'on-hold':      { bg: 'rgba(245, 158, 11, 0.10)', text: '#fbbf24' },
    'blocked':      { bg: 'rgba(239, 68, 68, 0.10)',  text: '#f87171' },
  }

  const normalized = (status || '').toLowerCase()
  const c = STATUS_COLORS[normalized] || { bg: 'rgba(99, 102, 241, 0.10)', text: '#818cf8' }

  return (
    <span
      className="status-pill"
      style={{ background: c.bg, color: c.text }}
    >
      {status?.replace(/-/g, ' ')}
    </span>
  )
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
