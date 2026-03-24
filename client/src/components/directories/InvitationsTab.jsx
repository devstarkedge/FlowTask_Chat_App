import { useState, useEffect, useCallback } from 'react'
import { Mail, RefreshCw, XCircle, Loader2 } from 'lucide-react'
import { directoriesAPI } from '../../services/directoriesAPI'
import { useAuthStore } from '../../stores/authStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { ListSkeleton } from './Skeletons'
import EmptyState from './EmptyState'
import InviteModal from './InviteModal'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  pending:  { bg: 'rgba(234,179,8,0.15)',  color: '#eab308' },
  accepted: { bg: 'rgba(34,197,94,0.15)',  color: '#22c55e' },
  expired:  { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444' },
  revoked:  { bg: 'rgba(107,114,128,0.15)', color: '#6b7280' },
}

export default function InvitationsTab() {
  const user = useAuthStore((s) => s.user)
  const { activeWorkspaceId, members } = useWorkspaceStore()

  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [actionId, setActionId] = useState(null)

  const currentMembership = members.find(
    (m) => (m.userId?._id || m.userId) === user?._id
  )
  const isAdmin = currentMembership?.role === 'owner' || currentMembership?.role === 'admin'

  const fetchInvitations = useCallback(async () => {
    if (!activeWorkspaceId) return
    setLoading(true)
    try {
      const { data } = await directoriesAPI.getInvitations()
      setInvitations(data.data?.invitations || data.data || [])
    } catch {
      setInvitations([])
    } finally {
      setLoading(false)
    }
  }, [activeWorkspaceId])

  useEffect(() => {
    fetchInvitations()
  }, [fetchInvitations])

  const handleResend = async (invite) => {
    if (!activeWorkspaceId || actionId) return
    setActionId(invite._id)
    try {
      await directoriesAPI.resendInvitation(activeWorkspaceId, {
        email: invite.email,
        role: invite.role || 'member',
      })
      toast.success(`Invitation resent to ${invite.email}`)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to resend')
    } finally {
      setActionId(null)
    }
  }

  const handleCancel = async (invite) => {
    if (!activeWorkspaceId || actionId) return
    if (!confirm(`Cancel invitation to ${invite.email}?`)) return
    setActionId(invite._id)
    try {
      await directoriesAPI.cancelInvitation(activeWorkspaceId, invite._id)
      setInvitations((prev) => prev.filter((i) => i._id !== invite._id))
      toast.success('Invitation cancelled')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel')
    } finally {
      setActionId(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="shrink-0 px-5 py-3 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--border-secondary)' }}
      >
        <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          {loading ? '...' : `${invitations.length} invitation${invitations.length !== 1 ? 's' : ''}`}
        </p>
        {isAdmin && (
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer"
            style={{ background: 'var(--accent-primary)', color: '#fff', border: 'none' }}
          >
            <Mail size={14} />
            Invite People
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading ? (
          <ListSkeleton count={6} />
        ) : invitations.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="No invitations"
            description="No pending or recent invitations"
          />
        ) : (
          <div className="flex flex-col gap-0.5 p-2">
            {invitations.map((inv) => {
              const statusStyle = STATUS_COLORS[inv.status] || STATUS_COLORS.pending
              const isProcessing = actionId === inv._id
              return (
                <div
                  key={inv._id}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors"
                  style={{ background: 'transparent' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover, var(--bg-card))')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Email icon */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}
                  >
                    <Mail size={14} style={{ color: 'var(--text-muted)' }} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-white)' }}>
                      {inv.email}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>
                        {inv.role || 'member'}
                      </span>
                      {inv.createdAt && (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          · Sent {format(new Date(inv.createdAt), 'MMM d, yyyy')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium capitalize shrink-0"
                    style={{ background: statusStyle.bg, color: statusStyle.color }}
                  >
                    {inv.status || 'pending'}
                  </span>

                  {/* Actions */}
                  {isAdmin && inv.status === 'pending' && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleResend(inv)}
                        disabled={isProcessing}
                        className="p-1.5 rounded-md cursor-pointer transition-colors"
                        style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
                        title="Resend invitation"
                      >
                        {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      </button>
                      <button
                        onClick={() => handleCancel(inv)}
                        disabled={isProcessing}
                        className="p-1.5 rounded-md cursor-pointer transition-colors"
                        style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
                        title="Cancel invitation"
                      >
                        <XCircle size={14} />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onSuccess={() => fetchInvitations()}
        />
      )}
    </div>
  )
}
