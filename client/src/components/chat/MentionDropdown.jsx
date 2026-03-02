import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { useChannelStore } from '../../stores/channelStore'
import { Hash, User } from 'lucide-react'

const EMPTY_MEMBERS = []
const EMPTY_CHANNELS = []

const MentionDropdown = memo(function MentionDropdown({
  type,        // 'user' or 'channel'
  query,       // search string after @ or #
  channelId,   // current channel for member lookup
  position,    // { top, left } absolute position
  onSelect,    // (item) => void
  onClose,     // () => void
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef(null)
  const members = useChannelStore((s) => s.membersByChannel[channelId]) ?? EMPTY_MEMBERS
  const channels = useChannelStore((s) => s.channels) ?? EMPTY_CHANNELS

  const items = type === 'user'
    ? members
        .filter((m) => {
          if (!query) return true
          const name = (m.name || m.userId?.name || '').toLowerCase()
          const email = (m.email || m.userId?.email || '').toLowerCase()
          return name.includes(query.toLowerCase()) || email.includes(query.toLowerCase())
        })
        .slice(0, 8)
        .map((m) => ({
          id: m._id || m.userId?._id || m.userId,
          name: m.name || m.userId?.name || 'Unknown',
          avatar: m.avatar || m.userId?.avatar,
          type: 'user',
        }))
    : channels
        .filter((c) => {
          if (!query) return true
          return (c.name || '').toLowerCase().includes(query.toLowerCase())
        })
        .slice(0, 8)
        .map((c) => ({
          id: c._id,
          name: c.name,
          type: 'channel',
        }))

  // Reset active index when items change
  useEffect(() => {
    setActiveIndex(0)
  }, [items.length, query])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e) => {
      if (!items.length) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        setActiveIndex((prev) => (prev + 1) % items.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setActiveIndex((prev) => (prev - 1 + items.length) % items.length)
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        onSelect(items[activeIndex])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    },
    [items, activeIndex, onSelect, onClose]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [handleKeyDown])

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const activeEl = list.children[activeIndex]
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])

  // Close on click outside
  useEffect(() => {
    const handleClick = (e) => {
      if (listRef.current && !listRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  if (items.length === 0) return null

  return (
    <div
      ref={listRef}
      className="mention-dropdown animate-fade-in-scale"
      style={{
        position: 'absolute',
        bottom: position?.bottom ?? '100%',
        left: position?.left ?? 0,
        zIndex: 70,
        minWidth: 220,
        maxWidth: 320,
        maxHeight: 240,
        overflowY: 'auto',
        background: 'var(--bg-modal)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        padding: '4px',
        marginBottom: 4,
      }}
    >
      <div
        style={{
          padding: '6px 10px 4px',
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {type === 'user' ? 'Members' : 'Channels'}
      </div>
      {items.map((item, i) => (
        <button
          key={item.id}
          onClick={() => onSelect(item)}
          className="mention-dropdown-item"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '7px 10px',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: i === activeIndex ? 'var(--bg-active)' : 'transparent',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontSize: 14,
            textAlign: 'left',
            transition: 'background 80ms ease',
          }}
          onMouseEnter={() => setActiveIndex(i)}
        >
          {item.type === 'user' ? (
            item.avatar ? (
              <img
                src={item.avatar}
                alt=""
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 'var(--radius-sm)',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {(item.name || '?')[0].toUpperCase()}
              </div>
            )
          ) : (
            <Hash size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          )}
          <span className="truncate" style={{ fontWeight: 500 }}>
            {item.name}
          </span>
        </button>
      ))}
    </div>
  )
})

export default MentionDropdown
