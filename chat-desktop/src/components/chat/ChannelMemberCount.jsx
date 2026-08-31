import React from 'react'
import { Users } from 'lucide-react'

export default function ChannelMemberCount({ count = 0, onClick, className = '' }) {
  const display = Number.isFinite(count) ? count : 0
  const label = `${display} member${display === 1 ? '' : 's'}`
  const empty = display === 0

  return (
    <button
      type="button"
      className={`channel-member-pill ${empty ? 'is-empty' : ''} ${className}`}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.(e)
      }}
      title={label}
      aria-label={label}
    >
      <span className="channel-member-pill__icon">
        <Users size={13} />
      </span>
      <span className="channel-member-pill__count">{display}</span>
    </button>
  )
}
