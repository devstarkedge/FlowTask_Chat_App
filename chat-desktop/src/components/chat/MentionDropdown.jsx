import { useEffect, useRef, useCallback, memo } from 'react'
import { createPortal } from 'react-dom'
import { Hash, User } from 'lucide-react'

/**
 * Reusable Mention Dropdown — renders a positioned list of mentionable items.
 *
 * Works with the centralized useMentions() hook. Get items, activeIndex,
 * mentionPos, selectMention, closeMentions, setActiveIndex from the hook.
 *
 * @param {object} props
 * @param {Array}  props.items          - Filtered list of { id, name, avatar, type }
 * @param {number} props.activeIndex    - Currently highlighted index
 * @param {object} props.position       - { top, left } cursor-based position
 * @param {function} props.onSelect     - (item) => void (usually selectMention)
 * @param {function} props.onClose      - () => void (usually closeMentions)
 * @param {function} props.setActiveIndex - (index) => void
 */
const MentionDropdown = memo(function MentionDropdown({
  items,
  activeIndex,
  position,
  onSelect,
  onClose,
  setActiveIndex,
}) {
  const listRef = useRef(null)

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

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const activeEl = list.children[activeIndex]
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])

  if (!items || items.length === 0) return null

  // Compute fixed position with flip logic so the dropdown stays in viewport
  const dropdownWidth = 260
  const dropdownMaxHeight = 240
  const top = position?.top ?? 0
  const left = position?.left ?? 0
  // Flip horizontally if the dropdown would overflow the right edge
  const flipRight = left + dropdownWidth > window.innerWidth - 12
  // Flip vertically if the dropdown would overflow the bottom edge
  const flipDown = top + dropdownMaxHeight > window.innerHeight - 12

  // Render via portal to escape any CSS transform contexts (e.g. thread panel)
  return createPortal(
    <div
      ref={listRef}
      className="mention-dropdown animate-fade-in-scale"
      style={{
        position: 'fixed',
        top: flipDown ? top - dropdownMaxHeight - 8 : top,
        left: flipRight ? Math.max(8, left - dropdownWidth + 60) : left,
        zIndex: 1200,
        minWidth: 220,
        maxWidth: 320,
        maxHeight: dropdownMaxHeight,
        overflowY: 'auto',
        background: 'var(--bg-modal)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        padding: '4px',
        marginTop: 4,
        pointerEvents: 'auto',
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
        {items[0]?.type === 'user' ? 'Members' : 'Channels'}
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
          onMouseEnter={() => setActiveIndex?.(i)}
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
    </div>,
    document.body
  )
})

export default MentionDropdown