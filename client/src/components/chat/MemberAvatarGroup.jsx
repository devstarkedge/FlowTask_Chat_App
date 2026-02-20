import { useState } from 'react'

const COLORS = [
  '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3',
  '#009688', '#4caf50', '#ff9800', '#ff5722', '#795548',
]

function getColor(name) {
  if (!name) return COLORS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

function Avatar({ member, size = 28, showStatus = false, tooltipPosition = 'bottom' }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const isOnline = member.onlineStatus === 'online'
  const isAway = member.onlineStatus === 'away'
  const bgColor = getColor(member.name)
  const initials = (member.name || '?')[0].toUpperCase()
  const statusSize = Math.max(8, size * 0.3)

  return (
    <div
      className="relative inline-flex shrink-0"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {member.avatar ? (
        <img
          src={member.avatar}
          alt={member.name}
          className="rounded-md object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="rounded-md flex items-center justify-center font-bold text-white select-none"
          style={{
            width: size,
            height: size,
            background: bgColor,
            fontSize: size * 0.4,
          }}
        >
          {initials}
        </div>
      )}

      {showStatus && (isOnline || isAway) && (
        <span
          className="absolute rounded-full border-2"
          style={{
            width: statusSize,
            height: statusSize,
            background: isOnline ? '#44b700' : '#ffa726',
            borderColor: 'var(--bg-primary)',
            bottom: -2,
            right: -2,
          }}
        />
      )}

      {showTooltip && (
        <div
          className="absolute z-50 px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap pointer-events-none shadow-xl"
          style={{
            background: '#1a1d21',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-white)',
            ...(tooltipPosition === 'bottom'
              ? { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6 }
              : { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6 }),
          }}
        >
          <p className="font-semibold">{member.name}</p>
          {member.role && (
            <p style={{ color: 'var(--text-muted)', marginTop: 1 }}>{member.role}</p>
          )}
          <p style={{ color: isOnline ? '#44b700' : isAway ? '#ffa726' : 'var(--text-muted)', marginTop: 1 }}>
            {isOnline ? '● Online' : isAway ? '● Away' : '○ Offline'}
          </p>
        </div>
      )}
    </div>
  )
}

export default function MemberAvatarGroup({
  members = [],
  max = 5,
  size = 28,
  showStatus = true,
  onShowAll,
}) {
  const visibleMembers = members.slice(0, max)
  const overflowCount = Math.max(0, members.length - max)
  const onlineCount = members.filter((m) => m.onlineStatus === 'online').length

  return (
    <div className="flex items-center gap-1">
      {/* Stacked Avatars */}
      <div className="flex items-center" style={{ marginLeft: 0 }}>
        {visibleMembers.map((member, idx) => (
          <div
            key={member._id || member.flowTaskUserId || idx}
            className="relative"
            style={{
              marginLeft: idx === 0 ? 0 : -8,
              zIndex: visibleMembers.length - idx,
            }}
          >
            <Avatar member={member} size={size} showStatus={showStatus} />
          </div>
        ))}

        {overflowCount > 0 && (
          <button
            onClick={onShowAll}
            className="relative rounded-md flex items-center justify-center font-bold text-white select-none cursor-pointer hover:brightness-110 transition-all"
            style={{
              width: size,
              height: size,
              background: '#4a4d51',
              fontSize: Math.max(10, size * 0.35),
              marginLeft: -8,
              zIndex: 0,
              border: '2px solid var(--bg-primary)',
            }}
            title={`${overflowCount} more members`}
          >
            +{overflowCount}
          </button>
        )}
      </div>

      {/* Member count */}
      {members.length > 0 && (
        <button
          onClick={onShowAll}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-md cursor-pointer transition-colors hover:opacity-80"
          style={{ color: 'var(--text-muted)' }}
        >
          <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
            {members.length}
          </span>
          {onlineCount > 0 && (
            <span style={{ color: '#44b700' }}> · {onlineCount} online</span>
          )}
        </button>
      )}
    </div>
  )
}

export { Avatar, getColor }
