import { useState, useRef, useEffect } from 'react'
import { X, Smile, Loader2, Clock } from 'lucide-react'
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
  const [duration, setDuration] = useState(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const textRef = useRef(null)

  useEffect(() => {
    textRef.current?.focus()
  }, [])

  const handleSave = async () => {
    if (saving) return

    if (!emoji && !text.trim()) {
      // Reuse clear flow which handles saving state, toast, fetch and close
      await handleClear()
      return
    }

    setSaving(true)
    try {
      await userAPI.setCustomStatus({
        emoji: emoji || undefined,
        text: text.trim() || undefined,
        duration: duration || undefined,
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
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-xl shadow-2xl flex flex-col"
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border-primary)' }}
        >
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-white)' }}>
            Set a status
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

        {/* Status Input */}
        <div className="px-5 py-4 space-y-4">
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            <div className="relative">
              <button
                onClick={() => setShowEmojiPicker((s) => !s)}
                className="w-8 h-8 flex items-center justify-center rounded-md transition-colors cursor-pointer"
                style={{ background: 'var(--bg-hover)', border: 'none' }}
                title="Pick emoji"
              >
                {emoji ? (
                  <span className="text-lg">{emoji}</span>
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
              className="flex-1 bg-transparent border-none outline-none text-sm"
              style={{ color: 'var(--text-white)' }}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            {(emoji || text) && (
              <button
                onClick={() => { setEmoji(''); setText('') }}
                className="p-1 rounded cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Presets */}
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
              Suggestions
            </p>
            <div className="space-y-0.5">
              {PRESET_STATUSES.map((preset) => (
                <button
                  key={preset.text}
                  onClick={() => selectPreset(preset)}
                  className="flex items-center gap-2.5 w-full px-3 py-1.5 rounded-md text-left transition-colors cursor-pointer"
                  style={{ background: 'transparent', border: 'none' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="text-base">{preset.emoji}</span>
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{preset.text}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Clock size={12} style={{ color: 'var(--text-muted)' }} />
              <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Clear after
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setDuration(opt.value)}
                  className="px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer"
                  style={{
                    background: duration === opt.value ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: duration === opt.value ? 'white' : 'var(--text-secondary)',
                    border: `1px solid ${duration === opt.value ? 'var(--accent-primary)' : 'var(--border-secondary)'}`,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex justify-between px-5 py-4 shrink-0"
          style={{ borderTop: '1px solid var(--border-primary)' }}
        >
          <div>
            {hasExistingStatus && (
              <button
                onClick={handleClear}
                disabled={saving}
                className="px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{ color: 'var(--status-error)', background: 'transparent', border: 'none' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                Clear status
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              style={{ color: 'var(--text-secondary)', background: 'var(--bg-tertiary)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
              style={{ background: 'var(--accent-primary)', color: 'white' }}
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
