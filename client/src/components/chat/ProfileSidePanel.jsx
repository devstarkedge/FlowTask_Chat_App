import { useEffect, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X, MessageSquare, Headphones, MoreHorizontal,
  Mail, Building2, Shield, Clock, Copy, ExternalLink,
} from 'lucide-react'
import { Avatar } from './MemberAvatarGroup'
import { useChannelStore } from '../../stores/channelStore'
import { useChatStore } from '../../stores/chatStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useAuthStore } from '../../stores/authStore'
import { getDMPath } from '../../utils/chatRoutes'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  online: 'var(--status-online)',
  away: 'var(--status-away)',
  dnd: 'var(--status-dnd)',
  offline: 'var(--status-offline)',
}

const STATUS_LABELS = {
  online: 'Active',
  away: 'Away',
  dnd: 'Do Not Disturb',
  offline: 'Offline',
}

export default function ProfileSidePanel({ user, onClose }) {
  const navigate = useNavigate()
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const currentUser = useAuthStore((s) => s.user)
  const onlineUsers = useChatStore((s) => s.onlineUsers)
  const [showMore, setShowMore] = useState(false)
  const [sendingDM, setSendingDM] = useState(false)

  // Derive live online status from chatStore
  const userId = user?._id || user?.userId
  const liveStatus = onlineUsers.get(userId) || user?.onlineStatus || 'offline'
  const isCurrentUser = userId === currentUser?._id

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Close dropdown on outside click
  useEffect(() => {
    if (!showMore) return
    const handler = () => setShowMore(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showMore])

  const handleMessage = useCallback(async () => {
    if (!userId || !workspaceId || sendingDM || isCurrentUser) return
    setSendingDM(true)
    try {
      const channel = await useChannelStore.getState().createDM(userId)
      if (channel?._id) {
        navigate(getDMPath(workspaceId, channel._id))
        onClose()
      }
    } catch {
      // createDM already shows toast on error
    } finally {
      setSendingDM(false)
    }
  }, [userId, workspaceId, sendingDM, isCurrentUser, navigate, onClose])

  const handleCopyEmail = useCallback(() => {
    if (!user?.email) return
    navigator.clipboard.writeText(user.email)
    toast.success('Email copied', { duration: 1500 })
    setShowMore(false)
  }, [user?.email])

  if (!user) return null

  const name = user.name || user.displayName || 'Unknown User'
  const avatar = user.avatar || user.profilePicture
  const title = user.title || ''
  const role = user.role || 'member'
  const email = user.email
  const department = user.departmentNames?.length
    ? user.departmentNames.join(', ')
    : (typeof user.department === 'string' ? user.department : null)

  return (
    <div
      className="profile-panel"
      style={{ animation: 'slideInRight 0.25s ease-out' }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-secondary)',
          height: 'var(--header-height)',
        }}
      >
        <h3 style={{ color: 'var(--text-white)', fontSize: 15, fontWeight: 700 }}>Profile</h3>
        <button
          onClick={onClose}
          className="flex items-center justify-center w-7 h-7 rounded-md border-none cursor-pointer transition-colors"
          style={{ background: 'transparent', color: 'var(--text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Avatar Section */}
        <div style={{ padding: '24px 16px 16px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', position: 'relative' }}>
            {avatar ? (
              <img
                src={avatar}
                alt={name}
                className="rounded-2xl object-cover"
                style={{ width: 96, height: 96, border: '3px solid var(--border-secondary)' }}
              />
            ) : (
              <div
                className="rounded-2xl flex items-center justify-center text-3xl font-bold"
                style={{
                  width: 96, height: 96,
                  background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-purple))',
                  color: '#fff',
                  border: '3px solid var(--border-secondary)',
                }}
              >
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            {/* Status dot */}
            <span
              className="absolute rounded-full"
              style={{
                width: 14, height: 14, bottom: 2, right: 2,
                background: STATUS_COLORS[liveStatus],
                border: '2.5px solid var(--bg-secondary)',
              }}
            />
          </div>

          <h2 className="text-xl font-bold mt-3" style={{ color: 'var(--text-white)' }}>
            {name}
            {isCurrentUser && (
              <span className="text-xs font-normal ml-1.5" style={{ color: 'var(--text-muted)' }}>(you)</span>
            )}
          </h2>

          {title && (
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{title}</p>
          )}

          {/* Status pill */}
          <div
            className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full"
            style={{ background: 'var(--bg-hover)' }}
          >
            <span
              className="rounded-full"
              style={{ width: 8, height: 8, background: STATUS_COLORS[liveStatus] }}
            />
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {STATUS_LABELS[liveStatus]}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        {!isCurrentUser && (
          <div className="flex items-center justify-center gap-2 px-4 pb-4">
            {/* Message button */}
            <button
              onClick={handleMessage}
              disabled={sendingDM}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all"
              style={{
                background: 'var(--accent-primary)',
                color: '#fff',
                border: 'none',
                opacity: sendingDM ? 0.7 : 1,
              }}
              onMouseEnter={(e) => { if (!sendingDM) e.currentTarget.style.filter = 'brightness(1.15)' }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = 'none' }}
            >
              <MessageSquare size={15} />
              {sendingDM ? 'Opening...' : 'Message'}
            </button>

            {/* Huddle button (placeholder) */}
            <button
              disabled
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-not-allowed"
              style={{
                background: 'var(--bg-card)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-primary)',
                opacity: 0.6,
              }}
              title="Huddle coming soon"
            >
              <Headphones size={15} />
              Huddle
            </button>

            {/* More options */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowMore((s) => !s) }}
                className="flex items-center justify-center w-9 h-9 rounded-lg cursor-pointer transition-colors"
                style={{
                  background: 'var(--bg-card)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-primary)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-card)')}
              >
                <MoreHorizontal size={16} />
              </button>
              {showMore && (
                <div
                  className="absolute right-0 mt-1 py-1 rounded-lg z-50"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-secondary)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                    minWidth: 180,
                    animation: 'fadeIn 0.15s ease',
                  }}
                >
                  {email && (
                    <button
                      onClick={handleCopyEmail}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer text-left"
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Copy size={14} />
                      Copy email address
                    </button>
                  )}
                  <button
                    onClick={() => setShowMore(false)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer text-left"
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <ExternalLink size={14} />
                    View in FlowTask
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border-secondary)', margin: '0 16px' }} />

        {/* Contact Information */}
        <div style={{ padding: '16px' }}>
          <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Contact Information
          </h4>
          <InfoRow icon={Mail} label="Email" value={email} />
          <InfoRow
            icon={Shield}
            label="Role"
            value={role.charAt(0).toUpperCase() + role.slice(1)}
          />
          {department && (
            <InfoRow icon={Building2} label="Department" value={department} />
          )}
          {user.lastSeen && (
            <InfoRow icon={Clock} label="Last Active" value={formatLastSeen(user.lastSeen)} />
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border-secondary)', margin: '0 16px' }} />

        {/* Footer */}
        <div style={{ padding: '12px 16px' }}>
          <p className="text-center" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Profile information is synced from FlowTask
          </p>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null

  return (
    <div className="flex items-start gap-2.5 mb-3.5">
      <div
        className="flex items-center justify-center shrink-0 rounded-md mt-0.5"
        style={{ width: 28, height: 28, background: 'var(--bg-hover)' }}
      >
        <Icon size={14} style={{ color: 'var(--text-muted)' }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>
          {label}
        </p>
        <p className="text-sm font-medium wrap-break-word" style={{ color: 'var(--text-primary)' }}>
          {value}
        </p>
      </div>
    </div>
  )
}

function formatLastSeen(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now - d
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}
