import { useState } from 'react'
import { Clock, X } from 'lucide-react'
import { scheduledMessageAPI } from '../../services/api'
import toast from 'react-hot-toast'

function getQuickOptions() {
  const now = new Date()
  const options = []

  // Later today at 4:00 PM — only show if before 3:30 PM
  const laterToday = new Date(now)
  laterToday.setHours(16, 0, 0, 0)
  if (now.getHours() < 15 || (now.getHours() === 15 && now.getMinutes() < 30)) {
    options.push({
      label: `Later today (${laterToday.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})`,
      date: laterToday,
    })
  }

  // Tomorrow morning at 9:00 AM
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)
  options.push({
    label: `Tomorrow morning (${tomorrow.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} 9:00 AM)`,
    date: tomorrow,
  })

  // Next Monday at 9:00 AM
  const monday = new Date(now)
  const dayOfWeek = monday.getDay()
  const daysUntilMonday = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7
  monday.setDate(monday.getDate() + daysUntilMonday)
  monday.setHours(9, 0, 0, 0)
  options.push({
    label: `Next Monday (${monday.toLocaleDateString([], { month: 'short', day: 'numeric' })} 9:00 AM)`,
    date: monday,
  })

  return options
}

export default function ScheduleMessageModal({
  channelId,
  content,
  htmlContent,
  attachments = [],
  mentions = [],
  threadId = null,
  onClose,
  onScheduled,
}) {
  const [scheduledAt, setScheduledAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [minDate] = useState(() => new Date().toISOString().slice(0, 16))
  const quickOptions = getQuickOptions()

  const handleQuickOption = async (date) => {
    await submitSchedule(date.toISOString())
  }

  const handleCustomSubmit = async () => {
    if (!scheduledAt) {
      toast.error('Please select a date and time')
      return
    }
    const date = new Date(scheduledAt)
    if (date <= new Date()) {
      toast.error('Scheduled time must be in the future')
      return
    }
    await submitSchedule(date.toISOString())
  }

  const submitSchedule = async (isoDate) => {
    setSubmitting(true)
    try {
      await scheduledMessageAPI.create(channelId, {
        content,
        htmlContent,
        scheduledAt: isoDate,
        attachments,
        mentions,
        ...(threadId ? { threadId } : {}),
      })
      toast.success('Message scheduled')
      onScheduled?.()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to schedule')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 400, width: '100%' }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <Clock size={18} style={{ color: 'var(--accent-primary)' }} />
          <h3 className="font-semibold text-sm flex-1" style={{ color: 'var(--text-primary)' }}>
            Schedule Message
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md cursor-pointer transition-colors"
            style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          {/* Quick Options */}
          <div className="flex flex-col gap-1.5 mb-4">
            {quickOptions.map((opt) => (
              <button
                key={opt.label}
                onClick={() => handleQuickOption(opt.date)}
                disabled={submitting}
                className="text-left px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors"
                style={{
                  color: 'var(--text-primary)',
                  background: 'var(--bg-hover)',
                  border: 'none',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-active)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Custom Date/Time */}
          <div className="mb-4">
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Custom date & time
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              min={minDate}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
              }}
            />
          </div>

          {/* Custom submit */}
          <button
            onClick={handleCustomSubmit}
            disabled={submitting || !scheduledAt}
            className="w-full py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
            style={{
              background: submitting || !scheduledAt ? 'var(--bg-hover)' : 'var(--accent-primary)',
              color: submitting || !scheduledAt ? 'var(--text-muted)' : 'white',
              border: 'none',
            }}
          >
            {submitting ? 'Scheduling...' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  )
}
