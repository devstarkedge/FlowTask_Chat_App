/* eslint-disable react/prop-types */
import { ExternalLink } from 'lucide-react'
import { buildRedirectFromMeta } from '../../utils/flowTaskUrl'

/**
 * EVENT_CONFIG — maps event types to display labels and accent colors.
 */
const EVENT_CONFIG = {
  TASK_CREATED:          { label: 'created a new task',        accent: 'var(--accent-primary)' },
  TASK_UPDATED:          { label: 'updated task',              accent: 'var(--accent-primary)' },
  TASK_DELETED:          { label: 'deleted task',              accent: 'var(--accent-red)' },
  TASK_ASSIGNED:         { label: 'assigned task',             accent: 'var(--accent-purple)' },
  TASK_COMMENTED:        { label: 'commented on task',         accent: 'var(--text-link)' },
  TASK_STATUS_CHANGED:   { label: 'changed task status',       accent: 'var(--accent-primary)' },
  TASK_DUE_DATE_CHANGED: { label: 'changed due date',          accent: 'var(--accent-yellow)' },
  TIME_ENTRY_ADDED:      { label: 'logged time',               accent: 'var(--accent-orange)' },
  ANNOUNCEMENT_CREATED:  { label: 'posted an announcement',    accent: 'var(--accent-primary)' },
  SUBTASK_CREATED:       { label: 'added subtask',             accent: 'var(--accent-primary)' },
  SUBTASK_UPDATED:       { label: 'updated subtask',           accent: 'var(--accent-primary)' },
  SUBTASK_COMPLETED:     { label: 'completed subtask',         accent: 'var(--accent-green, #22c55e)' },
  SUBTASK_DELETED:       { label: 'deleted subtask',           accent: 'var(--accent-red)' },
  NANO_CREATED:          { label: 'added checklist item',      accent: 'var(--accent-primary)' },
  NANO_COMPLETED:        { label: 'completed checklist item',  accent: 'var(--accent-green, #22c55e)' },
  NANO_DELETED:          { label: 'deleted checklist item',    accent: 'var(--accent-red)' },
  ATTACHMENT_ADDED:      { label: 'uploaded attachment',        accent: 'var(--text-link)' },
}

const FIELD_LABELS = {
  title: 'Title',
  status: 'Status',
  priority: 'Priority',
  dueDate: 'Due Date',
  startDate: 'Start Date',
  description: 'Description',
  labels: 'Labels',
  listId: 'List',
}

/**
 * Premium auto-activity message card for FlowTask bot notifications.
 * Handles all event types: tasks, subtasks, nano, attachments, announcements.
 * Features: clean blue theme, structured info hierarchy, hover CTA with deep-link,
 * field-level diffs for TASK_UPDATED events.
 */
export default function AutoActivityMessage({ message }) {
  const meta = message.activityMeta || {}
  const config = EVENT_CONFIG[meta.eventType] || { label: 'activity', accent: 'var(--accent-primary)' }
  const redirect = buildRedirectFromMeta(meta)

  const eventType = meta.eventType || ''
  const isAnnouncement = eventType === 'ANNOUNCEMENT_CREATED'
  const isTaskUpdate = eventType === 'TASK_UPDATED'
  const isStatusChange = eventType === 'TASK_STATUS_CHANGED'
  const isDueDateChange = eventType === 'TASK_DUE_DATE_CHANGED'
  const isAssignment = eventType === 'TASK_ASSIGNED'
  const isTimeEntry = eventType === 'TIME_ENTRY_ADDED'
  const isSubtask = eventType.startsWith('SUBTASK_')
  const isNano = eventType.startsWith('NANO_')
  const isAttachment = eventType === 'ATTACHMENT_ADDED'

  // For messages without activityMeta (legacy), render text-only fallback
  if (!meta.eventType) {
    return (
      <div className="auto-activity-card" style={{ borderLeftColor: 'var(--accent-primary)' }}>
        <div style={{ lineHeight: 1.5 }}>
          <span className="activity-action" dangerouslySetInnerHTML={{ __html: formatBold(message.content) }} />
        </div>
        <div className="activity-timestamp">{formatTime(message.createdAt)}</div>
      </div>
    )
  }

  return (
    <div className="auto-activity-card" style={{ borderLeftColor: config.accent }}>
      {/* Hover CTA */}
      {redirect && (
        <div className="activity-cta">
          <a href={redirect.url} target="_blank" rel="noopener noreferrer" className="activity-cta-btn" title="Open in FlowTask">
            {redirect.label}
            <ExternalLink size={11} />
          </a>
        </div>
      )}

      <div style={{ paddingRight: redirect ? 100 : 0 }}>
        {/* Actor + Action */}
        <div style={{ lineHeight: 1.5 }}>
          <span className="activity-actor">{meta.actorName || 'Someone'}</span>
          {' '}
          <span className="activity-action">{config.label}</span>
        </div>

        {/* Task title (for task events) */}
        {!isAnnouncement && !isSubtask && !isNano && meta.taskTitle && (
          <div className="activity-detail" style={{ marginTop: 3 }}>
            <span className="activity-detail-label">Task:</span>
            <span className="activity-target">{meta.taskTitle}</span>
          </div>
        )}

        {/* ─── TASK_UPDATED: Field-level diffs ─── */}
        {isTaskUpdate && meta.changedFields && (
          <div className="activity-changes" style={{ marginTop: 4 }}>
            {Object.entries(meta.changedFields).map(([field, diff]) => {
              if (field === 'status') {
                return (
                  <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span className="activity-detail-label">{FIELD_LABELS[field]}:</span>
                    <StatusPill status={diff.old} />
                    <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 500 }}>→</span>
                    <StatusPill status={diff.new} />
                  </div>
                )
              }
              if (field === 'description') {
                return (
                  <div key={field} className="activity-detail" style={{ marginTop: 3 }}>
                    <span className="activity-detail-label">Description:</span>
                    <span className="activity-detail-value">content updated</span>
                  </div>
                )
              }
              if (field === 'labels') {
                return (
                  <div key={field} className="activity-detail" style={{ marginTop: 3 }}>
                    <span className="activity-detail-label">Labels:</span>
                    <span className="activity-detail-value">updated</span>
                  </div>
                )
              }
              return (
                <div key={field} className="activity-detail" style={{ marginTop: 3 }}>
                  <span className="activity-detail-label">{FIELD_LABELS[field] || field}:</span>
                  <span className="activity-detail-value">{diff.old || '—'}</span>
                  <span style={{ color: 'var(--text-muted)', margin: '0 4px', fontSize: 12 }}>→</span>
                  <span className="activity-detail-value" style={{ fontWeight: 600 }}>{diff.new || '—'}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Status change pills (for dedicated TASK_STATUS_CHANGED event) */}
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
            <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>→</span>
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

        {/* ─── Subtask events ─── */}
        {isSubtask && (
          <>
            {meta.parentTaskTitle && (
              <div className="activity-detail" style={{ marginTop: 3 }}>
                <span className="activity-detail-label">Task:</span>
                <span className="activity-target">{meta.parentTaskTitle}</span>
              </div>
            )}
            {meta.subtaskTitle && (
              <div className="activity-detail" style={{ marginTop: 2 }}>
                <span className="activity-detail-label">Subtask:</span>
                <span className="activity-detail-value">{meta.subtaskTitle}</span>
              </div>
            )}
          </>
        )}

        {/* ─── Nano subtask events ─── */}
        {isNano && (
          <>
            {meta.parentTaskTitle && (
              <div className="activity-detail" style={{ marginTop: 3 }}>
                <span className="activity-detail-label">Task:</span>
                <span className="activity-target">{meta.parentTaskTitle}</span>
              </div>
            )}
            {meta.subtaskTitle && (
              <div className="activity-detail" style={{ marginTop: 2 }}>
                <span className="activity-detail-label">Subtask:</span>
                <span className="activity-detail-value">{meta.subtaskTitle}</span>
              </div>
            )}
            {meta.nanoTitle && (
              <div className="activity-detail" style={{ marginTop: 2 }}>
                <span className="activity-detail-label">Item:</span>
                <span className="activity-detail-value">{meta.nanoTitle}</span>
              </div>
            )}
          </>
        )}

        {/* ─── Attachment events ─── */}
        {isAttachment && meta.fileName && (
          <>
            {meta.taskTitle && (
              <div className="activity-detail" style={{ marginTop: 3 }}>
                <span className="activity-detail-label">Task:</span>
                <span className="activity-target">{meta.taskTitle}</span>
              </div>
            )}
            <div className="activity-detail" style={{ marginTop: 2 }}>
              <span className="activity-detail-label">File:</span>
              <span className="activity-detail-value">{meta.fileName}</span>
            </div>
          </>
        )}

        {/* ─── Announcement events ─── */}
        {isAnnouncement && (
          <>
            {meta.announcementTitle && (
              <div className="activity-detail" style={{ marginTop: 3 }}>
                <span className="activity-detail-label">Title:</span>
                <span className="activity-target">{meta.announcementTitle}</span>
              </div>
            )}
            {meta.announcementDescription && (
              <div className="activity-detail" style={{ marginTop: 2 }}>
                <span className="activity-detail-value" style={{ fontStyle: 'italic' }}>{meta.announcementDescription}</span>
              </div>
            )}
            {meta.category && (
              <div className="activity-detail" style={{ marginTop: 2 }}>
                <span className="activity-detail-label">Category:</span>
                <span className="activity-detail-value">{meta.category}</span>
              </div>
            )}
            {meta.priority && (
              <div className="activity-detail" style={{ marginTop: 2 }}>
                <span className="activity-detail-label">Priority:</span>
                <PriorityBadge priority={meta.priority} />
              </div>
            )}
          </>
        )}

        {/* Project name (non-announcement, non-subtask/nano) */}
        {!isAnnouncement && !isSubtask && !isNano && !isAttachment && meta.projectName && (
          <div className="activity-detail">
            <span className="activity-detail-label">Project:</span>
            <span className="activity-detail-value">{meta.projectName}</span>
          </div>
        )}

        {/* Subtask/nano/attachment — show project if available */}
        {(isSubtask || isNano || isAttachment) && meta.projectName && (
          <div className="activity-detail">
            <span className="activity-detail-label">Project:</span>
            <span className="activity-detail-value">{meta.projectName}</span>
          </div>
        )}

        {/* Timestamp */}
        <div className="activity-timestamp">{formatTime(message.createdAt)}</div>
      </div>
    </div>
  )
}

function StatusPill({ status }) {
  const STATUS_COLORS = {
    planning:       { bg: 'color-mix(in srgb, var(--accent-color) 12%, transparent)', text: 'var(--accent-color)' },
    todo:           { bg: 'color-mix(in srgb, var(--accent-color) 12%, transparent)', text: 'var(--accent-color)' },
    'to do':        { bg: 'color-mix(in srgb, var(--accent-color) 12%, transparent)', text: 'var(--accent-color)' },
    'to-do':        { bg: 'color-mix(in srgb, var(--accent-color) 12%, transparent)', text: 'var(--accent-color)' },
    'in-progress':  { bg: 'color-mix(in srgb, var(--accent-color) 14%, transparent)', text: 'var(--accent-color)' },
    'in progress':  { bg: 'color-mix(in srgb, var(--accent-color) 14%, transparent)', text: 'var(--accent-color)' },
    review:         { bg: 'color-mix(in srgb, var(--accent-purple) 13%, transparent)', text: 'var(--accent-purple)' },
    'in review':    { bg: 'color-mix(in srgb, var(--accent-purple) 13%, transparent)', text: 'var(--accent-purple)' },
    completed:      { bg: 'color-mix(in srgb, var(--success-color) 13%, transparent)', text: 'var(--success-color)' },
    done:           { bg: 'color-mix(in srgb, var(--success-color) 13%, transparent)', text: 'var(--success-color)' },
    'on-hold':      { bg: 'color-mix(in srgb, var(--warning-color) 16%, transparent)', text: 'var(--warning-color)' },
    blocked:        { bg: 'color-mix(in srgb, var(--danger-color) 13%, transparent)', text: 'var(--danger-color)' },
  }
  const normalized = (status || '').toLowerCase()
  const c = STATUS_COLORS[normalized] || { bg: 'color-mix(in srgb, var(--accent-color) 12%, transparent)', text: 'var(--accent-color)' }

  return (
    <span className="status-pill" style={{ background: c.bg, color: c.text }}>
      {status?.replace(/-/g, ' ')}
    </span>
  )
}

function PriorityBadge({ priority }) {
  const PRIORITY_COLORS = {
    high:   { bg: 'color-mix(in srgb, var(--danger-color) 13%, transparent)', text: 'var(--danger-color)' },
    medium: { bg: 'color-mix(in srgb, var(--warning-color) 16%, transparent)', text: 'var(--warning-color)' },
    low:    { bg: 'color-mix(in srgb, var(--success-color) 13%, transparent)', text: 'var(--success-color)' },
  }
  const normalized = (priority || '').toLowerCase()
  const c = PRIORITY_COLORS[normalized] || { bg: 'color-mix(in srgb, var(--accent-color) 12%, transparent)', text: 'var(--accent-color)' }

  return (
    <span className="status-pill" style={{ background: c.bg, color: c.text }}>
      {priority}
    </span>
  )
}

function formatBold(content) {
  if (!content) return ''
  return content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
