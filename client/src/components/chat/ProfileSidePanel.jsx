import { X, Mail, Building2, Shield, Clock, Users } from 'lucide-react'
import { Avatar } from './MemberAvatarGroup'

export default function ProfileSidePanel({ user, onClose }) {
  if (!user) return null

  const statusColors = {
    online: 'var(--status-online)',
    away: 'var(--status-away)',
    dnd: 'var(--status-dnd)',
    offline: 'var(--status-offline)',
  }

  const statusLabels = {
    online: 'Active',
    away: 'Away',
    dnd: 'Do Not Disturb',
    offline: 'Offline',
  }

  const status = user.onlineStatus || 'offline'

  return (
    <div className="profile-panel">
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
          style={{
            width: 28, height: 28, borderRadius: 'var(--radius-md)',
            background: 'transparent', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text-muted)',
            transition: 'background var(--transition-fast)',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <X size={16} />
        </button>
      </div>

      {/* Avatar Section */}
      <div style={{ padding: '24px 16px 16px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', position: 'relative' }}>
          <Avatar
            member={{
              name: user.name || '?',
              avatar: user.avatar,
              onlineStatus: status,
            }}
            size={80}
            showStatus={true}
          />
        </div>
        <h2 style={{
          color: 'var(--text-white)',
          fontSize: 20,
          fontWeight: 700,
          marginTop: 12,
        }}>
          {user.name || 'Unknown User'}
        </h2>
        {user.title && (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            {user.title}
          </p>
        )}

        {/* Status Indicator */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 8,
            padding: '4px 12px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--bg-hover)',
          }}
        >
          <span
            style={{
              width: 8, height: 8,
              borderRadius: '50%',
              background: statusColors[status],
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
            {statusLabels[status]}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border-secondary)', margin: '0 16px' }} />

      {/* Info Fields */}
      <div style={{ padding: '16px' }}>
        <InfoRow
          icon={Mail}
          label="Email"
          value={user.email}
        />
        <InfoRow
          icon={Shield}
          label="Role"
          value={user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Employee'}
        />
        {user.departmentNames && user.departmentNames.length > 0 && (
          <InfoRow
            icon={Building2}
            label="Department"
            value={user.departmentNames.join(', ')}
          />
        )}
        {user.department && typeof user.department === 'string' && (
          <InfoRow
            icon={Building2}
            label="Department"
            value={user.department}
          />
        )}
        {user.lastSeen && (
          <InfoRow
            icon={Clock}
            label="Last Active"
            value={formatLastSeen(user.lastSeen)}
          />
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border-secondary)', margin: '0 16px' }} />

      {/* Footer note */}
      <div style={{ padding: '12px 16px' }}>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
          Profile information is synced from FlowTask
        </p>
      </div>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
      <div
        style={{
          width: 28, height: 28, borderRadius: 'var(--radius-md)',
          background: 'var(--bg-hover)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginTop: 1,
        }}
      >
        <Icon size={14} style={{ color: 'var(--text-muted)' }} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 1 }}>
          {label}
        </p>
        <p style={{
          fontSize: 14, color: 'var(--text-primary)', fontWeight: 500,
          wordBreak: 'break-word',
        }}>
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
