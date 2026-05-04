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
      className="sml-card"
      onClick={(e) => e.stopPropagation()}
      style={{ maxWidth: 420, width: '100%', margin: 'auto' }}
    >
      {/* Header */}
      <div className="sml-header">
        <div className="sml-header-top">
          <div className="sml-title">
            <div className="sml-title-icon">
              <Clock size={16} />
            </div>
            Schedule Message
          </div>

          <button
            onClick={onClose}
            className="sml-action-btn"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="sml-body">
        {/* Quick Options */}
        <div style={{ marginBottom: 16 }}>
          {quickOptions.map((opt) => (
            <div
              key={opt.label}
              className="sml-card"
              style={{ padding: '10px 12px', marginBottom: 6 }}
              onClick={() => handleQuickOption(opt.date)}
            >
              <div className="sml-card-top">
                <span className="sml-preview">{opt.label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Custom Date */}
        <div style={{ marginBottom: 14 }}>
          <label className="sml-group-label">
            Custom date & time
          </label>

          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            min={minDate}
            className="sml-reschedule-input"
            style={{ marginTop: 6, width: '100%' }}
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleCustomSubmit}
          disabled={submitting || !scheduledAt}
          className="sml-reschedule-save"
          style={{ width: '100%', height: 38 }}
        >
          {submitting ? 'Scheduling...' : 'Schedule Message'}
        </button>
      </div>
    </div>
  </div>
)
}
