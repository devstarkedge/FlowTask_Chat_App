import { useState, useRef, useEffect } from 'react'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { X, Loader2, LogIn } from 'lucide-react'

/**
 * JoinWorkspaceModal — join a workspace via invite code.
 */
export default function JoinWorkspaceModal({ onClose, onJoined }) {
  const { joinByInviteCode, isLoading } = useWorkspaceStore()
  const [inviteCode, setInviteCode] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!inviteCode.trim() || isLoading) return

    try {
      const workspace = await joinByInviteCode(inviteCode.trim())
      onJoined?.(workspace)
      onClose()
    } catch {
      // Error handled by store
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-xl shadow-2xl overflow-hidden animate-fade-in"
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-primary)' }}
        >
          <div className="flex items-center gap-2">
            <LogIn size={18} style={{ color: 'var(--accent-green)' }} />
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-white)' }}>
              Join a Workspace
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Invite Code
            </label>
            <input
              ref={inputRef}
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Enter invite code..."
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors font-mono tracking-wider"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-white)',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent-primary)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-primary)')}
            />
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              Ask a workspace admin for the invite code.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
              style={{
                color: 'var(--text-secondary)',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-secondary)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!inviteCode.trim() || isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'var(--accent-green)',
                color: 'white',
                border: 'none',
              }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
            >
              {isLoading && <Loader2 size={14} className="animate-spin" />}
              Join Workspace
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
