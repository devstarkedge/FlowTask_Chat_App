import { forwardRef } from 'react'

/**
 * SidebarContainer — Unified outer shell used by ALL context sidebars.
 * Provides consistent background, border, full-height flex layout,
 * header slot, and scrollable content area.
 */
const SidebarContainer = forwardRef(function SidebarContainer(
  { header, subHeader, children, className = '', style, isCollapsed = false, ...rest },
  ref,
) {
  return (
    <nav
      ref={ref}
      className={`context-sidebar ${isCollapsed ? 'is-collapsed' : ''} ${className}`}
      style={style}
      {...rest}
    >
      {header && (
        <div className="context-sidebar-header">{header}</div>
      )}
      {subHeader && (
        <div className="context-sidebar-subheader">{subHeader}</div>
      )}
      <div className="context-sidebar-scroll">{children}</div>
    </nav>
  )
})

export default SidebarContainer
