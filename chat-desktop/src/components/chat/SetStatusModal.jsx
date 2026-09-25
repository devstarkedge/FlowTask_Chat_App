import { useState, useRef, useEffect } from 'react'
import { X, Smile, Clock } from 'lucide-react';
import Loader from '../shared/Loader';
import { userAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import EmojiPicker from './EmojiPicker'
import toast from 'react-hot-toast'

const DURATION_OPTIONS = [
  { label: "Don't clear", value: null },
  { label: '30 minutes', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '4 hours', value: 240 },
  { label: 'Today', value: 'today' },
]

const PRESET_STATUSES = [
  { emoji: '📅', text: 'In a meeting' },
  { emoji: '🚗', text: 'Commuting' },
  { emoji: '🤒', text: 'Out sick' },
  { emoji: '🌴', text: 'Vacationing' },
  { emoji: '🏠', text: 'Working remotely' },
  { emoji: '🎯', text: 'Focusing' },
]

export default function SetStatusModal({ onClose }) {
  const { user, fetchUser } = useAuthStore()
  const [emoji, setEmoji] = useState(user?.customStatus?.emoji || '')
  const [text, setText] = useState(user?.customStatus?.text || '')
  
  const [duration, setDuration] = useState(() => {
    if (user?.customStatus?.expiration !== undefined) {
      return user.customStatus.expiration;
    } else if (user?.customStatus?.expiresAt) {
      const minutesLeft = Math.round((new Date(user.customStatus.expiresAt).getTime() - Date.now()) / 60000);
      if (minutesLeft > 0) {
        if (minutesLeft <= 30) return 30;
        if (minutesLeft <= 60) return 60;
        if (minutesLeft <= 240) return 240;
        return 'today';
      }
    }
    return null;
  })

  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const textRef = useRef(null)

  useEffect(() => {
    textRef.current?.focus()
  }, [])

  const handleSave = async () => {
    if (saving) return

    if (!emoji && !text.trim()) {
      await handleClear()
      return
    }

    setSaving(true)
    try {
      const computeDuration = () => {
        if (!duration) return undefined
        if (duration === 'today') {
          const now = new Date()
          const end = new Date(now)
          end.setHours(23, 59, 59, 999)
          const mins = Math.ceil((end.getTime() - now.getTime()) / 60000)
          return mins > 0 ? mins : undefined
        }
        return typeof duration === 'number' ? duration : undefined
      }

      await userAPI.setCustomStatus({
        emoji: emoji || undefined,
        text: text.trim() || undefined,
        duration: computeDuration(),
        expiration: duration,
      })
      if (fetchUser) fetchUser()
      toast.success('Status updated')
      onClose()
    } catch {
      toast.error('Failed to update status')
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    if (saving) return
    setSaving(true)
    try {
      await userAPI.clearCustomStatus()
      if (fetchUser) fetchUser()
      toast.success('Status cleared')
      onClose()
    } catch (err) {
      const msg = err?.message || 'Failed to clear status'
      toast.error(msg)
      throw err
    } finally {
      setSaving(false)
    }
  }

  const selectPreset = (preset) => {
    setEmoji(preset.emoji)
    setText(preset.text)
  }

  const hasExistingStatus = user?.customStatus?.emoji || user?.customStatus?.text

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center status-modal-overlay"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl shadow-2xl flex flex-col panel status-modal">
        {/* Header */}
        <div className="panel-header flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: 'var(--text-white)' }}>
            Set a status
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-muted)' }}
            title="Close"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="panel-body">
          {/* Status Input */}
          <div className="status-input">
            <div className="relative shrink-0">
              <button
                onClick={() => setShowEmojiPicker((s) => !s)}
                type="button"
                className="emoji-btn"
                title="Pick emoji"
              >
                {emoji ? (
                  <span className="text-lg leading-none">{emoji}</span>
                ) : (
                  <Smile size={18} style={{ color: 'var(--text-muted)' }} />
                )}
              </button>
              {showEmojiPicker && (
                <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4 }}>
                  <EmojiPicker
                    onSelect={(e) => { setEmoji(e); setShowEmojiPicker(false) }}
                    onClose={() => setShowEmojiPicker(false)}
                    position="bottom"
                  />
                </div>
              )}
            </div>
            <input
              ref={textRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What's your status?"
              maxLength={100}
              className="status-input-field"
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            {(emoji || text) && (
              <button
                onClick={() => { setEmoji(''); setText('') }}
                type="button"
                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[var(--bg-hover)] cursor-pointer shrink-0 transition-colors"
                style={{ color: 'var(--text-muted)' }}
                title="Clear input"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Suggestions */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider mb-2.5" style={{ color: 'var(--text-muted)' }}>
              Suggestions
            </p>
            <div className="panel-list">
              {PRESET_STATUSES.map((preset) => (
                <button
                  key={preset.text}
                  onClick={() => selectPreset(preset)}
                  type="button"
                  className="preset-item"
                >
                  <span className="preset-emoji">{preset.emoji}</span>
                  <span className="preset-text">{preset.text}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Clear After Duration */}
          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              <Clock size={13} style={{ color: 'var(--text-muted)' }} />
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Clear after
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setDuration(opt.value)}
                  type="button"
                  className={`duration-option ${duration === opt.value ? 'selected' : ''}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="panel-footer">
          <div>
            {hasExistingStatus && (
              <button
                onClick={handleClear}
                disabled={saving}
                type="button"
                className="clear-btn"
              >
                Clear status
              </button>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              type="button"
              className="action-btn cancel-btn"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              type="button"
              className="action-btn save-btn"
            >
              {saving && <Loader size={14} />}
              <span>Save</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
