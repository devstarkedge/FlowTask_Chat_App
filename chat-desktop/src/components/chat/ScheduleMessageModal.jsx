import { useState, useRef, useEffect, useCallback } from 'react'
import { Clock, X, ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { scheduledMessageAPI } from '../../services/api'
import toast from 'react-hot-toast'

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function getQuickOptions() {
  const now = new Date()
  const options = []

  const laterToday = new Date(now)
  laterToday.setHours(16, 0, 0, 0)
  if (now.getHours() < 15 || (now.getHours() === 15 && now.getMinutes() < 30)) {
    options.push({
      label: `Later today (${laterToday.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})`,
      date: laterToday,
    })
  }

  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)
  options.push({
    label: `Tomorrow morning (${tomorrow.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} 9:00 AM)`,
    date: tomorrow,
  })

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

function formatDisplayDate(date) {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const dateStr = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const timeStr = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `${dateStr} \u2022 ${timeStr}`
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay()
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const HOURS = Array.from({ length: 24 }, (_, i) => i)

/* ─── Mini Calendar Component ────────────────────────────────────────── */

function MiniCalendar({ selectedDate, onSelectDate }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(
    selectedDate ? new Date(selectedDate).getFullYear() : today.getFullYear()
  )
  const [viewMonth, setViewMonth] = useState(
    selectedDate ? new Date(selectedDate).getMonth() : today.getMonth()
  )

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(viewYear - 1)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(viewYear + 1)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }

  const isToday = (day) => {
    return (
      day === today.getDate() &&
      viewMonth === today.getMonth() &&
      viewYear === today.getFullYear()
    )
  }

  const isSelected = (day) => {
    if (!selectedDate) return false
    const sel = new Date(selectedDate)
    return (
      day === sel.getDate() &&
      viewMonth === sel.getMonth() &&
      viewYear === sel.getFullYear()
    )
  }

  const isPast = (day) => {
    const cellDate = new Date(viewYear, viewMonth, day)
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    return cellDate < todayStart
  }

  const cells = []
  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`empty-${i}`} className="smm-cal-cell smm-cal-cell--empty" />)
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const past = isPast(day)
    const selected = isSelected(day)
    const todayCell = isToday(day)
    cells.push(
      <button
        key={day}
        type="button"
        disabled={past}
        className={[
          'smm-cal-cell',
          selected && 'smm-cal-cell--selected',
          todayCell && !selected && 'smm-cal-cell--today',
          past && 'smm-cal-cell--disabled',
        ].filter(Boolean).join(' ')}
        onClick={() => !past && onSelectDate(new Date(viewYear, viewMonth, day))}
        aria-label={`${MONTH_NAMES[viewMonth]} ${day}, ${viewYear}`}
      >
        {day}
      </button>
    )
  }

  return (
    <div className="smm-cal">
      {/* Month/Year navigation */}
      <div className="smm-cal-header">
        <button type="button" className="smm-cal-nav" onClick={prevMonth} aria-label="Previous month">
          <ChevronLeft size={14} />
        </button>
        <span className="smm-cal-title">{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button type="button" className="smm-cal-nav" onClick={nextMonth} aria-label="Next month">
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Day headers */}
      <div className="smm-cal-days-header">
        {DAY_LABELS.map((d) => (
          <div key={d} className="smm-cal-day-label">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="smm-cal-grid">{cells}</div>
    </div>
  )
}

/* ─── Time Picker Component ──────────────────────────────────────────── */

function TimePicker({ selectedDate, onSelectTime }) {
  const hour = selectedDate ? new Date(selectedDate).getHours() : 12
  const minute = selectedDate ? new Date(selectedDate).getMinutes() : 0
  const hourRef = useRef(null)
  const minuteRef = useRef(null)

  useEffect(() => {
    // Scroll selected hour/minute into view
    if (hourRef.current) {
      const el = hourRef.current.querySelector(`[data-value="${hour}"]`)
      if (el) el.scrollIntoView({ block: 'nearest' })
    }
  }, [hour])

  useEffect(() => {
    if (minuteRef.current) {
      const el = minuteRef.current.querySelector(`[data-value="${minute}"]`)
      if (el) el.scrollIntoView({ block: 'nearest' })
    }
  }, [minute])

  const setHour = (h) => {
    const d = selectedDate ? new Date(selectedDate) : new Date()
    d.setHours(h)
    onSelectTime(d)
  }

  const setMinute = (m) => {
    const d = selectedDate ? new Date(selectedDate) : new Date()
    d.setMinutes(m)
    onSelectTime(d)
  }

  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  const period = hour < 12 ? 'AM' : 'PM'

  const togglePeriod = () => {
    const d = selectedDate ? new Date(selectedDate) : new Date()
    d.setHours(hour < 12 ? hour + 12 : hour - 12)
    onSelectTime(d)
  }

  return (
    <div className="smm-time">
      <div className="smm-time-label">Time</div>
      <div className="smm-time-picker">
        {/* Hour column */}
        <div className="smm-time-col" ref={hourRef}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => {
            const h24 = period === 'AM' ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12)
            return (
              <button
                key={h}
                type="button"
                data-value={h24}
                className={`smm-time-opt ${displayHour === h ? 'smm-time-opt--active' : ''}`}
                onClick={() => setHour(h24)}
              >
                {h}
              </button>
            )
          })}
        </div>

        {/* Minute column */}
        <div className="smm-time-col" ref={minuteRef}>
          {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
            <button
              key={m}
              type="button"
              data-value={m}
              className={`smm-time-opt ${minute === m ? 'smm-time-opt--active' : ''}`}
              onClick={() => setMinute(m)}
            >
              {String(m).padStart(2, '0')}
            </button>
          ))}
        </div>

        {/* AM/PM toggle */}
        <div className="smm-time-col smm-time-col--period">
          <button
            type="button"
            className={`smm-time-opt ${period === 'AM' ? 'smm-time-opt--active' : ''}`}
            onClick={() => period === 'PM' && togglePeriod()}
          >
            AM
          </button>
          <button
            type="button"
            className={`smm-time-opt ${period === 'PM' ? 'smm-time-opt--active' : ''}`}
            onClick={() => period === 'AM' && togglePeriod()}
          >
            PM
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Main Modal ─────────────────────────────────────────────────────── */

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
  const [scheduledAt, setScheduledAt] = useState(null)
  const [draftDate, setDraftDate] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const quickOptions = getQuickOptions()
  const pickerRef = useRef(null)

  const openPicker = useCallback(() => {
    // Preload draft with current scheduled value or now
    setDraftDate(scheduledAt ? new Date(scheduledAt) : new Date())
    setPickerOpen(true)
  }, [scheduledAt])

  const closePicker = useCallback(() => {
    setPickerOpen(false)
    setDraftDate(null)
  }, [])

  const handleSavePicker = useCallback(() => {
    if (!draftDate) {
      toast.error('Please select a date and time')
      return
    }
    if (new Date(draftDate) <= new Date()) {
      toast.error('Scheduled time must be in the future')
      return
    }
    setScheduledAt(new Date(draftDate))
    setPickerOpen(false)
  }, [draftDate])

  const handleCancelPicker = useCallback(() => {
    closePicker()
  }, [closePicker])

  const handleSelectDate = useCallback((date) => {
    // Merge selected date with existing draft time
    const draft = draftDate ? new Date(draftDate) : new Date()
    const merged = new Date(date)
    merged.setHours(draft.getHours(), draft.getMinutes(), 0, 0)
    setDraftDate(merged)
  }, [draftDate])

  const handleSelectTime = useCallback((dateWithTime) => {
    // Merge time into current draft date
    const draft = draftDate ? new Date(draftDate) : new Date()
    const t = new Date(dateWithTime)
    draft.setHours(t.getHours(), t.getMinutes(), 0, 0)
    setDraftDate(draft)
  }, [draftDate])

  const handleQuickOption = async (date) => {
    await submitSchedule(date.toISOString())
  }

  const handleScheduleSubmit = async () => {
    if (!scheduledAt) {
      toast.error('Please select a date and time')
      return
    }
    if (new Date(scheduledAt) <= new Date()) {
      toast.error('Scheduled time must be in the future')
      return
    }
    await submitSchedule(scheduledAt.toISOString())
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

  // Close picker on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && pickerOpen) {
        closePicker()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [pickerOpen, closePicker])

  // Close picker when clicking outside
  useEffect(() => {
    if (!pickerOpen) return
    const handleClick = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        closePicker()
      }
    }
    // Use setTimeout to avoid the current click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [pickerOpen, closePicker])

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
            <button onClick={onClose} className="sml-action-btn">
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
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleQuickOption(opt.date)
                  }
                }}
              >
                <div className="sml-card-top">
                  <span className="sml-preview">{opt.label}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Custom Date & Time Trigger */}
          <div style={{ marginBottom: 14 }}>
            <label className="sml-group-label">
              Custom date & time
            </label>

            <div
              className={`smm-trigger ${pickerOpen ? 'smm-trigger--active' : ''} ${scheduledAt ? 'smm-trigger--has-value' : ''}`}
              onClick={pickerOpen ? undefined : openPicker}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  if (!pickerOpen) openPicker()
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={scheduledAt ? formatDisplayDate(scheduledAt) : 'Select Date & Time'}
              aria-expanded={pickerOpen}
              style={{ marginTop: 6 }}
            >
              <Calendar size={14} className="smm-trigger-icon" />
              <span className={`smm-trigger-text ${!scheduledAt ? 'smm-trigger-text--placeholder' : ''}`}>
                {scheduledAt ? formatDisplayDate(scheduledAt) : 'Select Date & Time'}
              </span>
              {scheduledAt && (
                <button
                  type="button"
                  className="smm-trigger-clear"
                  onClick={(e) => {
                    e.stopPropagation()
                    setScheduledAt(null)
                  }}
                  aria-label="Clear selection"
                  tabIndex={0}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Inline Picker Dropdown */}
          {pickerOpen && (
            <div className="smm-picker" ref={pickerRef}>
              <MiniCalendar
                selectedDate={draftDate}
                onSelectDate={handleSelectDate}
              />
              <TimePicker
                selectedDate={draftDate}
                onSelectTime={handleSelectTime}
              />

              {/* Picker Footer: Cancel / Save */}
              <div className="smm-picker-footer">
                <button
                  type="button"
                  className="smm-picker-btn smm-picker-btn--cancel"
                  onClick={handleCancelPicker}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="smm-picker-btn smm-picker-btn--save"
                  onClick={handleSavePicker}
                  disabled={!draftDate}
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleScheduleSubmit}
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
