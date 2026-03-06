import { useState, useEffect } from 'react'
import { Clock, X } from 'lucide-react'
import { scheduledMessageAPI } from '../../services/api'
import toast from 'react-hot-toast'

const QUICK_OPTIONS = [
  { label: 'In 30 minutes', minutes: 30 },
  { label: 'In 1 hour', minutes: 60 },
  { label: 'In 3 hours', minutes: 180 },
  { label: 'Tomorrow 9:00 AM', custom: true },
]

export default function ScheduleMessageModal({ channelId, content, htmlContent, onClose, onScheduled }) {
  const [scheduledAt, setScheduledAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [minDate, setMinDate] = useState(() => new Date().toISOString().slice(0, 16))

  useEffect(() => {
    const timer = setInterval(() => setMinDate(new Date().toISOString().slice(0, 16)), 60_000)
    return () => clearInterval(timer)
  }, [])

  const handleQuickOption = async (opt) => {
    let date
    if (opt.custom) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(9, 0, 0, 0)
      date = tomorrow
    } else {
      date = new Date(Date.now() + opt.minutes * 60 * 1000)
    }
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
            {QUICK_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => handleQuickOption(opt)}
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
