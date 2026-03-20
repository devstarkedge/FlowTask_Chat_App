import { forwardRef } from 'react'

/**
 * SidebarContainer — Unified outer shell used by ALL context sidebars.
 * Provides consistent background, border, full-height flex layout,
 * header slot, and scrollable content area.
 */
const SidebarContainer = forwardRef(function SidebarContainer(
  { header, children, className = '', style, ...rest },
  ref,
) {
  return (
    <nav
      ref={ref}
      className={`context-sidebar ${className}`}
      style={style}
      {...rest}
    >
      {header && (
        <div className="context-sidebar-header">{header}</div>
      )}
      <div className="context-sidebar-scroll">{children}</div>
    </nav>
  )
})

export default SidebarContainer
