import { useState, useEffect, useCallback } from 'react'
import { Mail, RefreshCw, XCircle, Loader2, UserPlus, Clock, CheckCircle2, AlertCircle, Ban } from 'lucide-react'
import { directoriesAPI } from '../../services/directoriesAPI'
import { useAuthStore } from '../../stores/authStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { ListSkeleton } from './Skeletons'
import EmptyState from './EmptyState'
import InviteModal from './InviteModal'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_META = {
  pending:  { label: 'Pending',  icon: Clock,         bg: 'rgba(234,179,8,0.13)',  color: '#d97706', border: 'rgba(234,179,8,0.25)' },
  accepted: { label: 'Accepted', icon: CheckCircle2,  bg: 'rgba(34,197,94,0.12)',  color: '#16a34a', border: 'rgba(34,197,94,0.25)' },
  expired:  { label: 'Expired',  icon: AlertCircle,   bg: 'rgba(239,68,68,0.12)',  color: '#dc2626', border: 'rgba(239,68,68,0.25)' },
  revoked:  { label: 'Revoked',  icon: Ban,           bg: 'rgba(107,114,128,0.12)', color: '#6b7280', border: 'rgba(107,114,128,0.2)' },
}

const STATUS_FILTERS = [
  { value: '',         label: 'All' },
  { value: 'pending',  label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'expired',  label: 'Expired' },
]

export default function InvitationsTab() {
  const user                           = useAuthStore((s) => s.user)
  const { activeWorkspaceId, members } = useWorkspaceStore()

  const [invitations, setInvitations] = useState([])
  const [loading, setLoading]         = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [showInvite, setShowInvite]   = useState(false)
  const [actionId, setActionId]       = useState(null)

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

  useEffect(() => { fetchInvitations() }, [fetchInvitations])

  const handleResend = async (inv) => {
    if (!activeWorkspaceId || actionId) return
    setActionId(inv._id)
    try {
      await directoriesAPI.resendInvitation(activeWorkspaceId, { email: inv.email, role: inv.role || 'member' })
      toast.success(`Resent to ${inv.email}`)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to resend')
    } finally {
      setActionId(null)
    }
  }

  const handleCancel = async (inv) => {
    if (!activeWorkspaceId || actionId) return
    if (!confirm(`Cancel invitation to ${inv.email}?`)) return
    setActionId(inv._id)
    try {
      await directoriesAPI.cancelInvitation(activeWorkspaceId, inv._id)
      setInvitations((prev) => prev.filter((i) => i._id !== inv._id))
      toast.success('Invitation cancelled')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel')
    } finally {
      setActionId(null)
    }
  }

  const filtered = statusFilter
    ? invitations.filter(i => (i.status || 'pending') === statusFilter)
    : invitations

  const pendingCount  = invitations.filter(i => (i.status || 'pending') === 'pending').length
  const acceptedCount = invitations.filter(i => i.status === 'accepted').length

  return (
    <div className="dir-inv-root">

      {/* Banner */}
      <div className="dir-inv-banner">
        <div className="dir-inv-banner-left">
          <div className="dir-inv-banner-icon">
            <Mail size={16} />
          </div>
          <div>
            <p className="dir-inv-banner-title">Invitations</p>
            <p className="dir-inv-banner-sub">
              {invitations.length} total · {pendingCount} pending · {acceptedCount} accepted
            </p>
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => setShowInvite(true)} className="dir-invite-btn">
            <UserPlus size={14} />
            <span>Invite People</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="dir-inv-filters">
        <div className="dir-type-pills">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`dir-type-pill ${statusFilter === f.value ? 'active' : ''}`}
            >
              {f.label}
              {f.value === 'pending' && pendingCount > 0 && (
                <span className="dir-inv-pill-count">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="dir-inv-body">
        {loading ? (
          <div style={{ padding: '8px 12px' }}>
            <ListSkeleton count={6} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Mail}
            title={statusFilter ? `No ${statusFilter} invitations` : 'Track your invitations'}
            description={statusFilter ? 'Try a different filter' : 'You’ll see the status of invitations you’ve sent and received here.'}
          />
        ) : (
          <div className="dir-inv-list">
            {filtered.map((inv, index) => {
              const st       = STATUS_META[inv.status] || STATUS_META.pending
              const StatusIcon = st.icon
              const isProcessing = actionId === inv._id
              const isPending = (inv.status || 'pending') === 'pending'

              return (
                <div
                  key={inv._id}
                  className="dir-inv-row"
                  style={{ animationDelay: `${Math.min(index * 30, 350)}ms` }}
                >
                  {/* Left: email icon */}
                  <div
                    className="dir-inv-icon"
                    style={{ background: st.bg, color: st.color, borderColor: st.border }}
                  >
                    <Mail size={15} />
                  </div>

                  {/* Info */}
                  <div className="dir-inv-info">
                    <p className="dir-inv-email">{inv.email}</p>
                    <div className="dir-inv-meta">
                      <span className="dir-inv-role">{inv.role || 'member'}</span>
                      {inv.createdAt && (
                        <span className="dir-inv-date">
                          Sent {format(new Date(inv.createdAt), 'MMM d, yyyy')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status badge */}
                  <span
                    className="dir-inv-status-badge"
                    style={{ background: st.bg, color: st.color, borderColor: st.border }}
                  >
                    <StatusIcon size={10} />
                    {st.label}
                  </span>

                  {/* Actions — only for pending + admin */}
                  {isAdmin && isPending && (
                    <div className="dir-inv-actions">
                      <button
                        onClick={() => handleResend(inv)}
                        disabled={isProcessing}
                        className="dir-inv-action-btn"
                        title="Resend invitation"
                      >
                        {isProcessing
                          ? <Loader2 size={13} className="dir-spin" />
                          : <RefreshCw size={13} />
                        }
                      </button>
                      <button
                        onClick={() => handleCancel(inv)}
                        disabled={isProcessing}
                        className="dir-inv-action-btn dir-inv-action-btn--danger"
                        title="Cancel invitation"
                      >
                        <XCircle size={13} />
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