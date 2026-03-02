import { useState, useEffect } from 'react'
import { X, Bell, BellOff, Volume2, VolumeX, Monitor, Moon, Sun, AlignLeft, Loader2 } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useThemeStore } from '../../stores/themeStore'
import { authAPI } from '../../services/api'
import toast from 'react-hot-toast'

/**
 * PreferencesModal — User chat settings: notifications, theme, display.
 */
export default function PreferencesModal({ onClose }) {
  const { user } = useAuthStore()
  const { theme, setTheme } = useThemeStore()

  const [prefs, setPrefs] = useState({
    notificationSound: true,
    desktopNotifications: true,
    compactMode: false,
  })
  const [saving, setSaving] = useState(false)
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  )

  // Load current preferences from user
  useEffect(() => {
    if (user?.chatPreferences) {
      setPrefs((p) => ({
        ...p,
        notificationSound: user.chatPreferences.notificationSound ?? true,
        desktopNotifications: user.chatPreferences.desktopNotifications ?? true,
        compactMode: user.chatPreferences.compactMode ?? false,
      }))
    }
  }, [user])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleToggle = (key) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }))
  }

  const requestNotifPermission = async () => {
    if (typeof Notification === 'undefined') return
    try {
      const result = await Notification.requestPermission()
      setNotifPermission(result)
      if (result === 'granted') {
        setPrefs((p) => ({ ...p, desktopNotifications: true }))
      }
    } catch (error) {
      setNotifPermission(Notification.permission)
      console.error('Failed to request notification permission:', error)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await authAPI.updatePreferences(prefs)
      toast.success('Preferences saved')
      onClose()
    } catch {
      toast.error('Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  const themeOptions = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-2xl flex flex-col"
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          maxHeight: '85vh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border-primary)' }}
        >
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-white)' }}>
            Preferences
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Theme */}
          <section>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-white)' }}>
              Appearance
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {themeOptions.map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className="flex flex-col items-center gap-2 py-3 px-2 rounded-lg transition-all cursor-pointer"
                  style={{
                    background: theme === value ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: theme === value ? 'white' : 'var(--text-secondary)',
                    border: `1px solid ${theme === value ? 'var(--accent-primary)' : 'var(--border-secondary)'}`,
                  }}
                >
                  <Icon size={20} />
                  <span className="text-xs font-medium">{label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Notifications */}
          <section>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-white)' }}>
              Notifications
            </h3>
            <div className="space-y-3">
              {/* Desktop Notifications */}
              <ToggleRow
                icon={prefs.desktopNotifications ? Bell : BellOff}
                label="Desktop notifications"
                description={
                  notifPermission === 'denied'
                    ? 'Blocked by browser — update browser settings'
                    : notifPermission === 'default'
                    ? 'Click to enable browser notifications'
                    : 'Show browser notifications for new messages'
                }
                checked={prefs.desktopNotifications && notifPermission === 'granted'}
                onChange={() => {
                  if (notifPermission !== 'granted') {
                    requestNotifPermission()
                  } else {
                    handleToggle('desktopNotifications')
                  }
                }}
                disabled={notifPermission === 'denied'}
              />

              {/* Sound */}
              <ToggleRow
                icon={prefs.notificationSound ? Volume2 : VolumeX}
                label="Notification sounds"
                description="Play a sound when you receive a message"
                checked={prefs.notificationSound}
                onChange={() => handleToggle('notificationSound')}
              />
            </div>
          </section>

          {/* Display */}
          <section>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-white)' }}>
              Display
            </h3>
            <ToggleRow
              icon={AlignLeft}
              label="Compact mode"
              description="Show messages with less spacing"
              checked={prefs.compactMode}
              onChange={() => handleToggle('compactMode')}
            />
          </section>
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-2 px-6 py-4 shrink-0"
          style={{ borderTop: '1px solid var(--border-primary)' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--text-secondary)', background: 'var(--bg-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
            style={{ background: 'var(--accent-primary)', color: 'white' }}
            onMouseEnter={(e) => { if (!saving) e.currentTarget.style.opacity = '0.9' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function ToggleRow({ icon: Icon, label, description, checked, onChange, disabled }) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg transition-colors"
      style={{ background: 'var(--bg-tertiary)' }}
    >
      <Icon size={18} style={{ color: checked ? 'var(--accent-primary)' : 'var(--text-muted)', flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--text-white)' }}>{label}</p>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</p>
      </div>
      <button
        onClick={onChange}
        disabled={disabled}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className="relative w-10 h-5 rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        style={{
          background: checked ? 'var(--accent-primary)' : 'var(--border-primary)',
          border: 'none',
          padding: 0,
          width: 40,
          height: 22,
        }}
      >
        <span
          className="absolute top-0.5 rounded-full transition-transform"
          style={{
            width: 18,
            height: 18,
            background: 'white',
            left: checked ? 20 : 2,
            transition: 'left 0.2s ease',
          }}
        />
      </button>
    </div>
  )
}
