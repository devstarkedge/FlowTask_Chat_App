import { memo } from 'react'

/**
 * SidebarItem — Shared list item used across ALL sidebar modules.
 * Ensures identical padding, hover, active-state, and typography.
 *
 * Props:
 *  - icon:       React node for the left icon slot (icon element or avatar)
 *  - label:      Primary text (string)
 *  - sublabel:   Secondary line of text (optional, string or node)
 *  - meta:       Right-side content — timestamp, badge, etc. (optional node)
 *  - isActive:   Whether this item is currently selected
 *  - isBold:     Whether primary text should be bold (e.g. unread)
 *  - badge:      Unread badge count (optional number)
 *  - indicator:  Small indicator node placed after meta (e.g. unread dot)
 *  - onClick:    Click handler
 *  - onKeyDown:  Optional keydown handler (for arrow-key navigation)
 *  - className:  Extra classes
 *  - ariaSelected: Passed to aria-selected attribute
 */
const SidebarItem = memo(function SidebarItem({
  icon,
  label,
  sublabel,
  meta,
  isActive = false,
  isBold = false,
  badge,
  indicator,
  onClick,
  onKeyDown,
  className = '',
  ariaSelected,
}) {
  return (
    <button
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`sidebar-item ${isActive ? 'active' : ''} ${className}`}
      role="option"
      aria-selected={ariaSelected ?? isActive}
    >
      {icon && <span className="sidebar-item-icon">{icon}</span>}

      <span className="sidebar-item-content">
        <span
          className="sidebar-item-label"
          style={{ fontWeight: isBold ? 600 : 400 }}
        >
          {label}
        </span>
        {sublabel && (
          <span className="sidebar-item-sublabel">{sublabel}</span>
        )}
      </span>

      {(meta || badge > 0 || indicator) && (
        <span className="sidebar-item-meta">
          {meta}
          {badge > 0 && (
            <span className="badge badge-red sidebar-item-badge">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
          {indicator}
        </span>
      )}
    </button>
  )
})

export default SidebarItem
