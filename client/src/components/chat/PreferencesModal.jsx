import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  X,
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Monitor,
  Moon,
  Sun,
  AlignLeft,
  Loader2,
  Check,
  RotateCcw,
  Palette,
  Sidebar,
  MessageSquare,
  ClipboardList,
  Inbox,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import {
  getSidebarThemeColors,
  SIDEBAR_THEME_PRESETS,
  THEME_MODES,
  useThemeStore,
} from '../../stores/themeStore'
import { authAPI } from '../../services/api'
import logger from '../../utils/logger'
import toast from 'react-hot-toast'

const MODE_ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

const COLOR_FIELDS = [
  { key: 'sidebarBg', label: 'Sidebar background' },
  { key: 'sidebarText', label: 'Sidebar text' },
  { key: 'accentColor', label: 'Accent color' },
  { key: 'sidebarActive', label: 'Active item color' },
]

export default function PreferencesModal({ onClose }) {
  const { user } = useAuthStore()
  const mode = useThemeStore((s) => s.mode)
  const effectiveTheme = useThemeStore((s) => s.effectiveTheme)
  const sidebarTheme = useThemeStore((s) => s.sidebarTheme)
  const customTheme = useThemeStore((s) => s.customTheme)
  const setMode = useThemeStore((s) => s.setMode)
  const setSidebarTheme = useThemeStore((s) => s.setSidebarTheme)
  const setCustomTheme = useThemeStore((s) => s.setCustomTheme)
  const resetAppearance = useThemeStore((s) => s.resetAppearance)

  const [prefs, setPrefs] = useState({
    notificationSound: true,
    desktopNotifications: true,
    compactMode: false,
  })
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [appearanceSaveState, setAppearanceSaveState] = useState('idle')
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  )
  const skipAppearanceSaveRef = useRef(true)
  const appearanceTimerRef = useRef(null)
  const savedTimerRef = useRef(null)

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
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      window.clearTimeout(appearanceTimerRef.current)
      window.clearTimeout(savedTimerRef.current)
    }
  }, [onClose])

  const appearancePayload = useMemo(() => ({
    theme: mode,
    sidebarTheme,
    customTheme,
  }), [customTheme, mode, sidebarTheme])

  useEffect(() => {
    if (skipAppearanceSaveRef.current) {
      skipAppearanceSaveRef.current = false
      return undefined
    }

    window.clearTimeout(appearanceTimerRef.current)
    window.clearTimeout(savedTimerRef.current)
    setAppearanceSaveState('saving')

    appearanceTimerRef.current = window.setTimeout(async () => {
      try {
        const { data } = await authAPI.updatePreferences(appearancePayload)
        if (data?.data?.user) {
          useAuthStore.setState({ user: data.data.user })
        }
        setAppearanceSaveState('saved')
        savedTimerRef.current = window.setTimeout(() => {
          setAppearanceSaveState('idle')
        }, 1600)
      } catch (error) {
        logger.error('Failed to save appearance preferences:', error)
        setAppearanceSaveState('error')
      }
    }, 420)

    return () => window.clearTimeout(appearanceTimerRef.current)
  }, [appearancePayload])

  const sidebarColors = useMemo(
    () => getSidebarThemeColors(sidebarTheme, customTheme),
    [customTheme, sidebarTheme],
  )

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
      logger.error('Failed to request notification permission:', error)
    }
  }

  const handleSavePrefs = async () => {
    setSavingPrefs(true)
    try {
      const { data } = await authAPI.updatePreferences(prefs)
      if (data?.data?.user) {
        useAuthStore.setState({ user: data.data.user })
      }
      toast.success('Preferences saved')
    } catch (error) {
      logger.error('Failed to save preferences:', error)
      toast.error('Failed to save preferences')
    } finally {
      setSavingPrefs(false)
    }
  }

  const handleColorChange = useCallback((key, value) => {
    setCustomTheme({ [key]: value })
  }, [setCustomTheme])

  return (
    <div
      className="appearance-modal-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className="appearance-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="appearance-modal-title"
      >
        <header className="appearance-modal__header">
          <div>
            <p className="appearance-modal__eyebrow">Preferences</p>
            <h2 id="appearance-modal-title">Appearance</h2>
          </div>
          <div className="appearance-modal__header-actions">
            <SaveStateIndicator state={appearanceSaveState} />
            <button className="appearance-icon-btn" onClick={onClose} aria-label="Close preferences">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="appearance-modal__body">
          <main className="appearance-modal__main">
            <section className="appearance-section">
              <SectionTitle
                icon={Monitor}
                title="Theme mode"
                description="Choose the app chrome style or follow your device."
              />
              <div className="appearance-mode-grid">
                {THEME_MODES.map((option) => {
                  const Icon = MODE_ICONS[option.id]
                  const selected = mode === option.id
                  return (
                    <button
                      key={option.id}
                      className={`appearance-mode-card ${selected ? 'is-selected' : ''}`}
                      onClick={() => setMode(option.id)}
                      aria-pressed={selected}
                    >
                      <span className="appearance-mode-card__icon">
                        <Icon size={20} />
                      </span>
                      <span className="appearance-mode-card__label">{option.label}</span>
                      {selected && <Check className="appearance-check" size={16} />}
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="appearance-section">
              <SectionTitle
                icon={Sidebar}
                title="Sidebar theme"
                description="Apply a workspace-style palette to navigation instantly."
              />
              <div className="appearance-theme-grid">
                {SIDEBAR_THEME_PRESETS.map((preset) => {
                  const colors = getSidebarThemeColors(preset.id, customTheme)
                  const selected = sidebarTheme === preset.id
                  return (
                    <button
                      key={preset.id}
                      className={`appearance-theme-card ${selected ? 'is-selected' : ''}`}
                      style={{
                        '--theme-card-bg': colors.sidebarBg,
                        '--theme-card-text': colors.sidebarText,
                        '--theme-card-hover': colors.sidebarHover,
                        '--theme-card-active': colors.sidebarActive,
                        '--theme-card-accent': colors.accentColor,
                      }}
                      onClick={() => setSidebarTheme(preset.id)}
                      aria-pressed={selected}
                    >
                      <span className="appearance-theme-card__mock">
                        <span />
                        <span />
                        <span />
                      </span>
                      <span className="appearance-theme-card__copy">
                        <strong>{preset.name}</strong>
                        <small>{preset.description}</small>
                      </span>
                      {selected && <Check className="appearance-check" size={16} />}
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="appearance-section">
              <SectionTitle
                icon={Palette}
                title="Custom theme"
                description="Fine-tune the sidebar and accent colors."
              />
              <div className="appearance-color-grid">
                {COLOR_FIELDS.map((field) => (
                  <ColorField
                    key={field.key}
                    label={field.label}
                    value={customTheme[field.key]}
                    onChange={(value) => handleColorChange(field.key, value)}
                  />
                ))}
              </div>
            </section>

            <section className="appearance-section">
              <SectionTitle
                icon={Bell}
                title="Notifications and display"
                description="Keep the rest of your preferences close by."
              />
              <div className="appearance-toggle-list">
                <ToggleRow
                  icon={prefs.desktopNotifications ? Bell : BellOff}
                  label="Desktop notifications"
                  description={
                    notifPermission === 'denied'
                      ? 'Blocked by browser settings'
                      : notifPermission === 'default'
                        ? 'Ask before showing browser notifications'
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
                <ToggleRow
                  icon={prefs.notificationSound ? Volume2 : VolumeX}
                  label="Notification sounds"
                  description="Play a sound when a new message arrives"
                  checked={prefs.notificationSound}
                  onChange={() => handleToggle('notificationSound')}
                />
                <ToggleRow
                  icon={AlignLeft}
                  label="Compact mode"
                  description="Use tighter spacing in dense chat views"
                  checked={prefs.compactMode}
                  onChange={() => handleToggle('compactMode')}
                />
              </div>
            </section>
          </main>

          <aside className="appearance-modal__preview" aria-label="Live appearance preview">
            <LivePreview
              effectiveTheme={effectiveTheme}
              mode={mode}
              sidebarColors={sidebarColors}
            />
          </aside>
        </div>

        <footer className="appearance-modal__footer">
          <button className="appearance-secondary-btn" onClick={resetAppearance}>
            <RotateCcw size={16} />
            Reset to default
          </button>
          <div className="appearance-footer-actions">
            <span>Appearance saves automatically</span>
            <button className="appearance-secondary-btn" onClick={handleSavePrefs} disabled={savingPrefs}>
              {savingPrefs && <Loader2 size={15} className="animate-spin" />}
              Save preferences
            </button>
            <button className="appearance-primary-btn" onClick={onClose}>
              Done
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}

function SectionTitle({ icon: Icon, title, description }) {
  return (
    <div className="appearance-section-title">
      <span><Icon size={17} /></span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  )
}

function SaveStateIndicator({ state }) {
  if (state === 'saving') {
    return (
      <span className="appearance-save-state">
        <Loader2 size={13} className="animate-spin" />
        Saving
      </span>
    )
  }
  if (state === 'saved') {
    return (
      <span className="appearance-save-state is-saved">
        <Check size={13} />
        Saved
      </span>
    )
  }
  if (state === 'error') {
    return <span className="appearance-save-state is-error">Save failed</span>
  }
  return null
}

function ColorField({ label, value, onChange }) {
  return (
    <label className="appearance-color-field">
      <span>{label}</span>
      <div>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const next = e.target.value.trim()
            if (/^#[0-9a-fA-F]{6}$/.test(next)) {
              onChange(next)
            }
          }}
          maxLength={7}
          aria-label={`${label} hex value`}
        />
      </div>
    </label>
  )
}

function ToggleRow({ icon: Icon, label, description, checked, onChange, disabled }) {
  return (
    <div className="appearance-toggle-row">
      <Icon size={18} style={{ color: checked ? 'var(--accent-color)' : 'var(--text-muted)' }} />
      <div className="appearance-toggle-row__copy">
        <p>{label}</p>
        <span>{description}</span>
      </div>
      <button
        onClick={onChange}
        disabled={disabled}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`appearance-switch ${checked ? 'is-on' : ''}`}
      >
        <span />
      </button>
    </div>
  )
}

function LivePreview({ effectiveTheme, mode, sidebarColors }) {
  return (
    <div
      className="appearance-preview-shell"
      style={{
        '--preview-sidebar-bg': sidebarColors.sidebarBg,
        '--preview-sidebar-text': sidebarColors.sidebarText,
        '--preview-sidebar-hover': sidebarColors.sidebarHover,
        '--preview-sidebar-active': sidebarColors.sidebarActive,
        '--preview-sidebar-active-text': sidebarColors.sidebarActiveText,
        '--preview-accent': sidebarColors.accentColor,
      }}
    >
      <div className="appearance-preview-meta">
        <span>Live preview</span>
        <strong>{mode === 'system' ? `System: ${effectiveTheme}` : effectiveTheme}</strong>
      </div>
      <div className="appearance-preview-app">
        <div className="appearance-preview-sidebar">
          <div className="appearance-preview-workspace">M</div>
          <button className="is-active"># design</button>
          <button>team-chat</button>
          <button>product</button>
          <button>dm-maya</button>
        </div>
        <div className="appearance-preview-chat">
          <div className="appearance-preview-header">
            <MessageSquare size={15} />
            <span>design</span>
          </div>
          <div className="appearance-preview-message">
            <strong>Avery</strong>
            <p>The new task card uses the active theme tokens.</p>
          </div>
          <div className="appearance-preview-card">
            <ClipboardList size={16} />
            <div>
              <strong>Launch checklist</strong>
              <span>3 tasks due today</span>
            </div>
          </div>
          <div className="appearance-preview-notice">
            <Inbox size={15} />
            New mention in product
          </div>
          <div className="appearance-preview-composer">Message #design</div>
        </div>
      </div>
    </div>
  )
}
