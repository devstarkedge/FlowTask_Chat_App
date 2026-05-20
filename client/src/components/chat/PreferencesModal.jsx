import { useCallback, useEffect, useMemo, useState } from 'react'
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
  resolveEffectiveTheme,
  SIDEBAR_THEME_PRESETS,
  THEME_MODES,
  DEFAULT_APPEARANCE,
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
  { key: 'sidebarBg', label: 'Colour' },
  // { key: 'sidebarText', label: 'Sidebar text' },
  // { key: 'accentColor', label: 'Accent color' },
  // { key: 'sidebarActive', label: 'Active item color' },
]

export default function PreferencesModal({ onClose }) {
  const { user } = useAuthStore()
  const mode = useThemeStore((s) => s.mode)
  const sidebarTheme = useThemeStore((s) => s.sidebarTheme)
  const customTheme = useThemeStore((s) => s.customTheme)
  const applyAppearance = useThemeStore((s) => s.applyAppearance)

  const loadedPrefs = useMemo(() => ({
    notificationSound: user?.chatPreferences?.notificationSound ?? true,
    desktopNotifications: user?.chatPreferences?.desktopNotifications ?? true,
    compactMode: user?.chatPreferences?.compactMode ?? false,
  }), [user?.chatPreferences])

  const [prefs, setPrefs] = useState({
    notificationSound: true,
    desktopNotifications: true,
    compactMode: false,
  })
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [appearanceSaveState, setAppearanceSaveState] = useState('idle')
  const [draftAppearance, setDraftAppearance] = useState({
    mode,
    sidebarTheme,
    customTheme,
  })
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  )

  useEffect(() => {
    setPrefs(loadedPrefs)
  }, [loadedPrefs])

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
    }
  }, [onClose])

  useEffect(() => {
    setDraftAppearance({
      mode,
      sidebarTheme,
      customTheme,
    })
    setAppearanceSaveState('idle')
  }, [customTheme, mode, sidebarTheme])

  const appearancePayload = useMemo(() => ({
    theme: draftAppearance.mode,
    sidebarTheme: draftAppearance.sidebarTheme,
    customTheme: draftAppearance.customTheme,
  }), [draftAppearance])

  const previewEffectiveTheme = useMemo(
    () => resolveEffectiveTheme(draftAppearance.mode),
    [draftAppearance.mode],
  )

  const sidebarColors = useMemo(
    () => getSidebarThemeColors(draftAppearance.sidebarTheme, draftAppearance.customTheme),
    [draftAppearance.customTheme, draftAppearance.sidebarTheme],
  )

  const hasAppearanceChanges = useMemo(
    () => JSON.stringify(draftAppearance) !== JSON.stringify({ mode, sidebarTheme, customTheme }),
    [customTheme, draftAppearance, mode, sidebarTheme],
  )

  const hasPreferenceChanges = useMemo(
    () => JSON.stringify(prefs) !== JSON.stringify(loadedPrefs),
    [loadedPrefs, prefs],
  )

  const hasPendingChanges = hasAppearanceChanges || hasPreferenceChanges

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

  const handleSaveChanges = async () => {
    if (!hasPendingChanges) {
      onClose()
      return
    }

    let shouldClose = false

    setSavingPrefs(true)
    setAppearanceSaveState('saving')
    try {
      const payload = {
        ...prefs,
        ...appearancePayload,
      }
      const { data } = await authAPI.updatePreferences(payload)
      applyAppearance({
        mode: draftAppearance.mode,
        sidebarTheme: draftAppearance.sidebarTheme,
        customTheme: draftAppearance.customTheme,
      })
      if (data?.data?.user) {
        useAuthStore.setState({ user: data.data.user })
      }
      toast.success('Changes saved')
      shouldClose = true
    } catch (error) {
      logger.error('Failed to save preferences:', error)
      setAppearanceSaveState('error')
      toast.error('Failed to save changes')
    } finally {
      setSavingPrefs(false)
    }

    if (shouldClose) {
      onClose()
    }
  }

  const handleColorChange = useCallback((key, value) => {
    setDraftAppearance((current) => ({
      ...current,
      sidebarTheme: 'custom',
      customTheme: {
        ...current.customTheme,
        [key]: value,
      },
    }))
  }, [])

  const handleResetAppearance = useCallback(() => {
    setDraftAppearance({
      mode: DEFAULT_APPEARANCE.mode,
      sidebarTheme: DEFAULT_APPEARANCE.sidebarTheme,
      customTheme: DEFAULT_APPEARANCE.customTheme,
    })
    setAppearanceSaveState('idle')
  }, [])

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
                  const selected = draftAppearance.mode === option.id
                  return (
                    <button
                      key={option.id}
                      className={`appearance-mode-card ${selected ? 'is-selected' : ''}`}
                      onClick={() => setDraftAppearance((current) => ({ ...current, mode: option.id }))}
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
                  const colors = getSidebarThemeColors(preset.id, draftAppearance.customTheme)
                  const selected = draftAppearance.sidebarTheme === preset.id
                  return (
                    <button
                      key={preset.id}
                      className={`appearance-theme-card ${selected ? 'is-selected' : ''}`}
                      style={{
                        '--theme-card-bg': colors.sidebarBg,
                        // '--theme-card-text': colors.sidebarText,
                        // '--theme-card-hover': colors.sidebarHover,
                        // '--theme-card-active': colors.sidebarActive,
                        // '--theme-card-accent': colors.accentColor,
                      }}
                      onClick={() => setDraftAppearance((current) => ({ ...current, sidebarTheme: preset.id }))}
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
              <div className="space-y-6">
                {COLOR_FIELDS.map((field) => (
                  <ColorField
                    key={field.key}
                    label={field.label}
                    value={draftAppearance.customTheme[field.key]}
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
              effectiveTheme={previewEffectiveTheme}
              mode={draftAppearance.mode}
              sidebarColors={sidebarColors}
            />
          </aside>
        </div>

        <footer className="appearance-modal__footer">
          <button className="appearance-secondary-btn" onClick={handleResetAppearance}>
            <RotateCcw size={16} />
            Reset to default
          </button>
          <div className="appearance-footer-actions">
            <span>
              {hasPendingChanges
                ? 'Changes are pending'
                : 'No unsaved changes. Save changes will close this dialog.'}
            </span>
            <button className="appearance-primary-btn appearance-save-btn" onClick={handleSaveChanges} disabled={savingPrefs}>
              {savingPrefs && <Loader2 size={15} className="animate-spin" />}
              Save changes
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
    <label className="group block">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-800">
          {label}
        </span>
      </div>

      {/* Input Area */}
      <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-2 transition-all hover:border-zinc-300 hover:bg-white focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
        
        {/* Hidden Native Color Picker */}
        <div className="relative">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={label}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />

          <div
            className="h-10 w-10 rounded-xl shadow-inner"
            style={{ backgroundColor: value }}
          />
        </div>

        {/* Hex Input */}
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const next = e.target.value.trim()

            // allow typing smoothly
            if (
              next === "" ||
              /^#?[0-9a-fA-F]{0,6}$/.test(next)
            ) {
              onChange(
                next.startsWith("#") ? next : `#${next}`
              )
            }
          }}
          maxLength={7}
          aria-label={`${label} hex value`}
          className="h-10 flex-1 bg-transparent text-sm font-medium text-zinc-800 outline-none placeholder:text-zinc-400"
          placeholder="#5b8f80"
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
