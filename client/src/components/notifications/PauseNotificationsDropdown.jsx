import { useEffect, useRef, useState } from 'react'
import { useNotificationStore } from '../../stores/notificationStore'
import {
  Clock, Play, Pause, Moon, Coffee, Timer, ChevronRight,
} from 'lucide-react'

const PAUSE_OPTIONS = [
  { label: '30 minutes', minutes: 30, icon: Timer },
  { label: '1 hour', minutes: 60, icon: Coffee },
  { label: '2 hours', minutes: 120, icon: Clock },
  { label: 'Until tomorrow 9 AM', minutes: null, icon: Moon, custom: 'tomorrow' },
]

export default function PauseNotificationsDropdown({ onClose }) {
  const { isPaused, pauseResumeAt, pauseNotifications, resumeNotifications } = useNotificationStore()
  const dropdownRef = useRef(null)
  const [countdown, setCountdown] = useState('')

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  // Countdown timer when paused
  useEffect(() => {
    if (!isPaused || !pauseResumeAt) {
      setCountdown('')
      return
    }

    const update = () => {
      const diff = new Date(pauseResumeAt) - new Date()
      if (diff <= 0) {
        setCountdown('Resuming...')
        resumeNotifications()
        return
      }
      const hours = Math.floor(diff / 3600000)
      const minutes = Math.floor((diff % 3600000) / 60000)
      const secs = Math.floor((diff % 60000) / 1000)
      if (hours > 0) {
        setCountdown(`${hours}h ${minutes}m remaining`)
      } else if (minutes > 0) {
        setCountdown(`${minutes}m ${secs}s remaining`)
      } else {
        setCountdown(`${secs}s remaining`)
      }
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [isPaused, pauseResumeAt, resumeNotifications])

  const handlePause = async (option) => {
    if (option.custom === 'tomorrow') {
      const now = new Date()
      const tomorrow9am = new Date(now)
      tomorrow9am.setDate(tomorrow9am.getDate() + 1)
      tomorrow9am.setHours(9, 0, 0, 0)
      const minutes = Math.ceil((tomorrow9am - now) / 60000)
      await pauseNotifications(minutes)
    } else {
      await pauseNotifications(option.minutes)
    }
    onClose()
  }

  const handleResume = async () => {
    await resumeNotifications()
    onClose()
  }

  return (
    <div
      ref={dropdownRef}
      className="notif-pause-dropdown"
      id="pause-notifications-dropdown"
    >
      <div className="notif-pause-dropdown__header">
        <Pause size={14} />
        <span>Pause notifications</span>
      </div>

      {isPaused ? (
        <div className="notif-pause-dropdown__active">
          <div className="notif-pause-dropdown__countdown">
            <div className="notif-pause-countdown-ring">
              <Pause size={16} />
            </div>
            <div>
              <p className="notif-pause-dropdown__label">Notifications paused</p>
              {countdown && (
                <p className="notif-pause-dropdown__time">{countdown}</p>
              )}
            </div>
          </div>
          <button
            onClick={handleResume}
            className="notif-pause-dropdown__resume-btn"
            id="resume-notifications-btn"
          >
            <Play size={14} />
            Resume notifications
          </button>
        </div>
      ) : (
        <div className="notif-pause-dropdown__options">
          {PAUSE_OPTIONS.map((option) => {
            const Icon = option.icon
            return (
              <button
                key={option.label}
                onClick={() => handlePause(option)}
                className="notif-pause-dropdown__option"
              >
                <Icon size={15} />
                <span>{option.label}</span>
                <ChevronRight size={13} className="notif-pause-dropdown__arrow" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
