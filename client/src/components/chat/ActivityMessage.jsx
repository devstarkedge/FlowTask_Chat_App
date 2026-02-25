import { ClipboardList, ArrowRightLeft, Trash2, UserPlus, MessageSquare, CalendarClock, Timer } from 'lucide-react'

const ACTIVITY_CONFIG = {
  TASK_CREATED:        { icon: ClipboardList,  emoji: '📋', color: 'var(--accent-green)' },
  TASK_STATUS_CHANGED: { icon: ArrowRightLeft, emoji: '🔄', color: 'var(--accent-primary)' },
  TASK_DELETED:        { icon: Trash2,         emoji: '🗑️', color: 'var(--accent-red)' },
  TASK_ASSIGNED:       { icon: UserPlus,       emoji: '👤', color: 'var(--accent-purple)' },
  TASK_COMMENT_ADDED:  { icon: MessageSquare,  emoji: '💬', color: 'var(--text-link)' },
  TASK_DUE_DATE_CHANGED: { icon: CalendarClock, emoji: '📅', color: 'var(--accent-yellow)' },
  TASK_TIME_LOGGED:    { icon: Timer,          emoji: '⏱️', color: 'var(--accent-orange)' },
}

export default function ActivityMessage({ message }) {
  const meta = message.activityMeta || {}
  const config = ACTIVITY_CONFIG[meta.eventType] || ACTIVITY_CONFIG.TASK_CREATED
  const IconComponent = config.icon

  return (
    <div className="activity-message animate-fade-in-up" style={{ borderLeftColor: config.color }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Icon */}
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--radius-md)',
            background: `${config.color}15`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          <IconComponent size={14} style={{ color: config.color }} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="activity-text" style={{ lineHeight: 1.4 }}>
            <span dangerouslySetInnerHTML={{ __html: formatActivityContent(message.content) }} />
          </p>

          {/* Status change pills */}
          {meta.eventType === 'TASK_STATUS_CHANGED' && meta.oldValue && meta.newValue && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <StatusPill status={meta.oldValue} />
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>→</span>
              <StatusPill status={meta.newValue} />
            </div>
          )}

          {/* Timestamp */}
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'block' }}>
            {formatTime(message.createdAt)}
          </span>
        </div>
      </div>
    </div>
  )
}

function StatusPill({ status }) {
  const colors = {
    'planning':     { bg: '#6366f115', text: '#818cf8' },
    'in-progress':  { bg: '#3b82f615', text: '#60a5fa' },
    'completed':    { bg: '#22c55e15', text: '#4ade80' },
    'on-hold':      { bg: '#f59e0b15', text: '#fbbf24' },
  }
  const c = colors[status] || colors['planning']

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 'var(--radius-full)',
        fontSize: 11,
        fontWeight: 600,
        background: c.bg,
        color: c.text,
        textTransform: 'capitalize',
      }}
    >
      {status?.replace(/-/g, ' ')}
    </span>
  )
}

function formatActivityContent(content) {
  if (!content) return ''
  // Bold text between ** **
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/"(.*?)"/g, '"<strong>$1</strong>"')
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
