import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNotificationStore } from '../../stores/notificationStore'
import { useChannelStore } from '../../stores/channelStore'
import {
  X, Bell, BellOff, Volume2, VolumeX, Monitor, Smartphone,
  Hash, Lock, MessageCircle, Bot, Clock, Zap, Shield, Tags,
  Moon,
  Users, Loader2, Check, Plus, Trash2, Search,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { notificationAPI } from '../../services/api'
import logger from '../../utils/logger'

const TABS = [
  { id: 'general', label: 'General', icon: Bell },
  { id: 'channels', label: 'Channels', icon: Hash },
  { id: 'groups', label: 'Groups', icon: Lock },
  { id: 'dms', label: 'Direct Messages', icon: MessageCircle },
  { id: 'keywords', label: 'Keywords', icon: Tags },
  { id: 'schedule', label: 'Schedule', icon: Clock },
]

const LEVEL_OPTIONS = [
  { value: 'all', label: 'All messages', description: 'Notify for every new message' },
  { value: 'mentions', label: 'Mentions only', description: 'Only @mentions and keywords' },
  { value: 'nothing', label: 'Nothing', description: 'No notifications from this section' },
]

export default function NotificationSettingsModal({ onClose }) {
  const {
    preferences,
    preferencesLoading,
    fetchPreferences,
    updatePreferences,
    updateChannelPreference,
    updateKeywords,
    isPaused,
    pauseNotifications,
    resumeNotifications,
  } = useNotificationStore()

  const [activeTab, setActiveTab] = useState('general')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!preferences) fetchPreferences()
  }, [preferences, fetchPreferences])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleUpdateGlobal = async (field, value) => {
    setSaving(true)
    const success = await updatePreferences({ global: { [field]: value } })
    setSaving(false)
    if (success) toast.success('Preference updated')
  }

  const handleUpdateSectionDefault = async (section, level) => {
    setSaving(true)
    const success = await updatePreferences({ [section]: { defaultLevel: level } })
    setSaving(false)
    if (success) toast.success('Default notification level updated')
  }

  return (
    <div
      className="notif-settings-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className="notif-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-settings-title"
        id="notification-settings-modal"
      >
        <header className="notif-settings-modal__header">
          <div>
            <p className="notif-settings-modal__eyebrow">Preferences</p>
            <h2 id="notif-settings-title">Notification settings</h2>
          </div>
          <button
            className="notif-settings-icon-btn"
            onClick={onClose}
            aria-label="Close notification settings"
          >
            <X size={18} />
          </button>
        </header>

        <div className="notif-settings-modal__body">
          {/* Sidebar Tabs */}
          <nav className="notif-settings-modal__sidebar">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`notif-settings-tab ${isActive ? 'is-active' : ''}`}
                  aria-pressed={isActive}
                  id={`notif-tab-${tab.id}`}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </nav>

          {/* Content */}
          <main className="notif-settings-modal__main">
            {preferencesLoading && !preferences ? (
              <div className="notif-settings-loading">
                <Loader2 size={24} className="animate-spin" />
                <p>Loading preferences...</p>
              </div>
            ) : (
              <>
                {activeTab === 'general' && (
                  <GeneralTab
                    prefs={preferences}
                    onUpdateGlobal={handleUpdateGlobal}
                    isPaused={isPaused}
                    onPause={pauseNotifications}
                    onResume={resumeNotifications}
                    saving={saving}
                  />
                )}
                {activeTab === 'channels' && (
                  <SectionTab
                    section="channels"
                    prefs={preferences}
                    onUpdateDefault={handleUpdateSectionDefault}
                    onUpdateChannel={updateChannelPreference}
                    saving={saving}
                    icon={Hash}
                  />
                )}
                {activeTab === 'groups' && (
                  <SectionTab
                    section="groups"
                    prefs={preferences}
                    onUpdateDefault={handleUpdateSectionDefault}
                    onUpdateChannel={updateChannelPreference}
                    saving={saving}
                    icon={Lock}
                  />
                )}
                {activeTab === 'dms' && (
                  <DMTab
                    prefs={preferences}
                    onUpdate={updatePreferences}
                    onUpdateChannel={updateChannelPreference}
                    saving={saving}
                  />
                )}
                {activeTab === 'keywords' && (
                  <KeywordsTab
                    prefs={preferences}
                    onUpdate={updateKeywords}
                    saving={saving}
                  />
                )}
                {activeTab === 'schedule' && (
                  <ScheduleTab
                    prefs={preferences}
                    onUpdate={updatePreferences}
                    saving={saving}
                  />
                )}
              </>
            )}
          </main>
        </div>

        <footer className="notif-settings-modal__footer">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Changes save automatically
          </span>
          <button className="notif-settings-primary-btn" onClick={onClose}>
            Done
          </button>
        </footer>
      </section>
    </div>
  )
}

// ─── General Tab ─────────────────────────────────────────────────────────────

function GeneralTab({ prefs, onUpdateGlobal, isPaused, onPause, onResume, saving }) {
  const global = prefs?.global || {}

  return (
    <div className="notif-settings-content">
      <SectionHeader
        icon={Bell}
        title="Notification delivery"
        description="Control how and where you receive notifications."
      />

      <div className="notif-settings-toggle-list">
        <ToggleRow
          icon={global.enabled ? Bell : BellOff}
          label="Enable notifications"
          description="Master switch — turns off all notifications when disabled"
          checked={global.enabled !== false}
          onChange={(v) => onUpdateGlobal('enabled', v)}
        />
        <ToggleRow
          icon={global.sound ? Volume2 : VolumeX}
          label="Notification sounds"
          description="Play a sound when a new notification arrives"
          checked={global.sound !== false}
          onChange={(v) => onUpdateGlobal('sound', v)}
        />
        <ToggleRow
          icon={Monitor}
          label="Desktop push notifications"
          description="Show browser push notifications on desktop"
          checked={global.desktopPush !== false}
          onChange={(v) => onUpdateGlobal('desktopPush', v)}
        />
        <ToggleRow
          icon={Smartphone}
          label="Mobile push notifications"
          description="Send push notifications to your mobile device"
          checked={global.mobilePush !== false}
          onChange={(v) => onUpdateGlobal('mobilePush', v)}
        />
      </div>

      {/* Quick pause */}
      <div className="notif-settings-section-divider" />
      <SectionHeader
        icon={Clock}
        title="Pause notifications"
        description={isPaused ? 'Notifications are currently paused.' : 'Temporarily mute all notifications.'}
      />
      <div className="notif-settings-pause-actions">
        {isPaused ? (
          <button
            className="notif-settings-action-btn is-resume"
            onClick={onResume}
          >
            <Zap size={14} />
            Resume notifications
          </button>
        ) : (
          <div className="notif-settings-pause-grid">
            {[
              { label: '30 min', minutes: 30 },
              { label: '1 hour', minutes: 60 },
              { label: '2 hours', minutes: 120 },
              { label: '4 hours', minutes: 240 },
            ].map((opt) => (
              <button
                key={opt.minutes}
                className="notif-settings-action-btn"
                onClick={() => onPause(opt.minutes)}
              >
                <Clock size={13} />
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Section Tab (Channels / Groups) ─────────────────────────────────────────

function SectionTab({ section, prefs, onUpdateDefault, onUpdateChannel, saving, icon: SectionIcon }) {
  const sectionData = prefs?.[section] || {}
  const currentLevel = sectionData.defaultLevel || (section === 'groups' ? 'all' : 'mentions')
  const overrides = sectionData.overrides || {}
  const overrideEntries = Object.entries(overrides instanceof Map ? Object.fromEntries(overrides) : overrides)

  return (
    <div className="notif-settings-content">
      <SectionHeader
        icon={SectionIcon}
        title={`${section === 'channels' ? 'Channel' : 'Group'} notifications`}
        description={`Set the default notification level for all ${section}.`}
      />

      <div className="notif-settings-level-cards">
        {LEVEL_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`notif-settings-level-card ${currentLevel === opt.value ? 'is-selected' : ''}`}
            onClick={() => onUpdateDefault(section, opt.value)}
          >
            <strong>{opt.label}</strong>
            <span>{opt.description}</span>
            {currentLevel === opt.value && <Check size={16} className="notif-settings-check" />}
          </button>
        ))}
      </div>

      {/* Per-channel overrides */}
      {overrideEntries.length > 0 && (
        <>
          <div className="notif-settings-section-divider" />
          <SectionHeader
            icon={Shield}
            title="Channel overrides"
            description="Custom notification level for specific channels."
          />
          <div className="notif-settings-override-list">
            {overrideEntries.map(([channelId, override]) => (
              <div key={channelId} className="notif-settings-override-item">
                <div className="notif-settings-override-info">
                  <SectionIcon size={14} />
                  <span className="notif-settings-override-name">{channelId}</span>
                </div>
                <div className="notif-settings-override-actions">
                  <span className={`notif-settings-badge ${override.muted ? 'is-muted' : ''}`}>
                    {override.muted ? 'Muted' : override.level || 'default'}
                  </span>
                  <button
                    className="notif-settings-icon-btn-sm"
                    onClick={() => onUpdateChannel(channelId, { muted: false, level: null, section })}
                    title="Reset to default"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── DM Tab ──────────────────────────────────────────────────────────────────

function DMTab({ prefs, onUpdate, onUpdateChannel, saving }) {
  const dms = prefs?.dms || {}

  return (
    <div className="notif-settings-content">
      <SectionHeader
        icon={MessageCircle}
        title="Direct message notifications"
        description="DMs are always high-priority by default."
      />

      <div className="notif-settings-toggle-list">
        <ToggleRow
          icon={MessageCircle}
          label="DM notifications"
          description="Receive notifications for all direct messages"
          checked={dms.enabled !== false}
          onChange={(v) => onUpdate({ dms: { enabled: v } })}
        />
      </div>
    </div>
  )
}

// ─── Keywords Tab ────────────────────────────────────────────────────────────

function KeywordsTab({ prefs, onUpdate }) {
  const [keywords, setKeywords] = useState(prefs?.keywords || [])
  const [inputValue, setInputValue] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setKeywords(prefs?.keywords || [])
  }, [prefs?.keywords])

  const addKeyword = async () => {
    const kw = inputValue.trim().toLowerCase()
    if (!kw || keywords.includes(kw)) {
      setInputValue('')
      return
    }
    if (keywords.length >= 50) {
      toast.error('Maximum 50 keywords allowed')
      return
    }
    const updated = [...keywords, kw]
    setKeywords(updated)
    setInputValue('')
    setSaving(true)
    await onUpdate(updated)
    setSaving(false)
  }

  const removeKeyword = async (kw) => {
    const updated = keywords.filter((k) => k !== kw)
    setKeywords(updated)
    setSaving(true)
    await onUpdate(updated)
    setSaving(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addKeyword()
    }
    if (e.key === 'Backspace' && !inputValue && keywords.length > 0) {
      removeKeyword(keywords[keywords.length - 1])
    }
  }

  return (
    <div className="notif-settings-content">
      <SectionHeader
        icon={Tags}
        title="Custom keyword triggers"
        description="Get notified whenever someone sends a message containing these words."
      />

      <div className="notif-keyword-input-container">
        <div className="notif-keyword-tags">
          {keywords.map((kw) => (
            <span key={kw} className="notif-keyword-tag">
              {kw}
              <button
                onClick={() => removeKeyword(kw)}
                className="notif-keyword-tag__remove"
                aria-label={`Remove keyword ${kw}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={keywords.length === 0 ? 'Type a keyword and press Enter...' : 'Add more...'}
            className="notif-keyword-input"
            id="keyword-input"
          />
        </div>
        <button
          onClick={addKeyword}
          className="notif-settings-action-btn"
          disabled={!inputValue.trim() || saving}
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      <p className="notif-keyword-hint">
        Separate keywords with Enter or comma. Keywords are case-insensitive.
        {keywords.length > 0 && ` ${keywords.length}/50 keywords used.`}
      </p>
    </div>
  )
}

// ─── Schedule Tab ────────────────────────────────────────────────────────────

function ScheduleTab({ prefs, onUpdate }) {
  const pause = prefs?.pause || {}
  const [quietEnabled, setQuietEnabled] = useState(pause.quietHoursEnabled || false)
  const [quietStart, setQuietStart] = useState(pause.quietStart || '22:00')
  const [quietEnd, setQuietEnd] = useState(pause.quietEnd || '08:00')
  const [timezone, setTimezone] = useState(pause.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone)

  useEffect(() => {
    setQuietEnabled(pause.quietHoursEnabled || false)
    setQuietStart(pause.quietStart || '22:00')
    setQuietEnd(pause.quietEnd || '08:00')
    setTimezone(pause.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone)
  }, [pause])

  const handleSave = async () => {
    await onUpdate({
      global: {},
      channels: {},
      groups: {},
      dms: {},
      bots: {},
    })
    // Use pause endpoint for quiet hours
    await notificationAPI.pauseNotifications({
      quietHoursEnabled: quietEnabled,
      quietStart,
      quietEnd,
      timezone,
      duration: null,
    })
    toast.success('Quiet hours updated')
  }

  return (
    <div className="notif-settings-content">
      <SectionHeader
        icon={Clock}
        title="Quiet hours"
        description="Automatically pause notifications during set hours every day."
      />

      <div className="notif-settings-toggle-list">
        <ToggleRow
          icon={Moon}
          label="Enable quiet hours"
          description="Mute notifications during your sleep/focus time"
          checked={quietEnabled}
          onChange={(v) => {
            setQuietEnabled(v)
          }}
        />
      </div>

      {quietEnabled && (
        <div className="notif-schedule-controls">
          <div className="notif-schedule-times">
            <label className="notif-schedule-field">
              <span>Start time</span>
              <input
                type="time"
                value={quietStart}
                onChange={(e) => setQuietStart(e.target.value)}
                className="notif-schedule-time-input"
              />
            </label>
            <span className="notif-schedule-separator">to</span>
            <label className="notif-schedule-field">
              <span>End time</span>
              <input
                type="time"
                value={quietEnd}
                onChange={(e) => setQuietEnd(e.target.value)}
                className="notif-schedule-time-input"
              />
            </label>
          </div>

          <label className="notif-schedule-field">
            <span>Timezone</span>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="notif-schedule-select"
            >
              {Intl.supportedValuesOf?.('timeZone')?.slice(0, 50).map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              )) || (
                <option value={timezone}>{timezone}</option>
              )}
            </select>
          </label>

          <button
            className="notif-settings-primary-btn"
            onClick={handleSave}
            style={{ alignSelf: 'flex-start', marginTop: '8px' }}
          >
            Save schedule
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Shared Components ───────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, description }) {
  return (
    <div className="notif-settings-section-title">
      <span><Icon size={17} /></span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  )
}

function ToggleRow({ icon: Icon, label, description, checked, onChange }) {
  return (
    <div className="notif-settings-toggle-row">
      <Icon
        size={18}
        style={{ color: checked ? 'var(--accent-primary)' : 'var(--text-muted)' }}
      />
      <div className="notif-settings-toggle-row__copy">
        <p>{label}</p>
        <span>{description}</span>
      </div>
      <button
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`notif-settings-switch ${checked ? 'is-on' : ''}`}
      >
        <span />
      </button>
    </div>
  )
}
