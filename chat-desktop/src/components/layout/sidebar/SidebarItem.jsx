import { memo } from "react";

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
  onRemove,
  onKeyDown,
  className = "",
  ariaSelected,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`sidebar-item ${isActive ? "active" : ""} ${className}`}
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
        {sublabel && <span className="sidebar-item-sublabel">{sublabel}</span>}
      </span>

      {(meta || badge > 0 || indicator || onRemove) && (
        <span className="sidebar-item-meta">
          {meta}
          {badge > 0 && (
            <span className="badge badge-red sidebar-item-badge">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
          {indicator}
          {onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="sidebar-item-remove-btn"
              title="Remove"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: "2px",
                marginLeft: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: 0.6,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.6)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          )}
        </span>
      )}
    </button>
  );
});

export default SidebarItem;
