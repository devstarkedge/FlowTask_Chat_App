import { useState } from 'react'
import { X, Loader2, Mail } from 'lucide-react'
import { directoriesAPI } from '../../services/directoriesAPI'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import toast from 'react-hot-toast'

export default function InviteModal({ onClose, onSuccess }) {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isValidEmail || !activeWorkspaceId) return

    setIsSubmitting(true)
    try {
      await directoriesAPI.inviteUser(activeWorkspaceId, { email: email.trim().toLowerCase(), role })
      toast.success(`Invitation sent to ${email}`)
      onSuccess?.()
      onClose()
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error?.message || 'Failed to send invitation'
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-content w-full max-w-md mx-4">
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-secondary)' }}
        >
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-white)' }}>Invite People</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Send an email invitation to join this workspace
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md cursor-pointer transition-colors"
            style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              Email Address
            </label>
            <div
              className="flex items-center gap-2 rounded-md px-3 py-2"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-primary)' }}
            >
              <Mail size={16} style={{ color: 'var(--text-muted)' }} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                autoFocus
                className="flex-1 bg-transparent border-none outline-none text-sm"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 rounded-md text-sm cursor-pointer"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="guest">Guest</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button
              type="submit"
              disabled={!isValidEmail || isSubmitting}
              className="btn-primary"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Sending...
                </div>
              ) : (
                'Send Invitation'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
