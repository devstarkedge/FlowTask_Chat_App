import { memo } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'

/**
 * SidebarSection — Reusable collapsible section with a header.
 * Matches the grouped-card pattern used in NavigationSidebar.
 *
 * Props:
 *  - title:     Section title string
 *  - count:     Number of items (shown as badge)
 *  - expanded:  Whether section is expanded
 *  - onToggle:  Toggle expand/collapse handler
 *  - showAdd:   Show "+" button
 *  - onAdd:     "+" button click handler
 *  - addTitle:  Tooltip text for add button
 *  - children:  Section content (list of SidebarItem)
 */
const SidebarSection = memo(function SidebarSection({
  title,
  count,
  expanded = true,
  onToggle,
  showAdd = false,
  onAdd,
  addTitle = 'Add',
  children,
}) {
  return (
    <div className="sidebar-section">
      <div className="sidebar-section-header">
        <button
          onClick={onToggle}
          className="sidebar-section-toggle"
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span>{title}</span>
          {count != null && count > 0 && (
            <span className="sidebar-section-count">{count}</span>
          )}
        </button>
        {showAdd && (
          <button
            onClick={onAdd}
            className="sidebar-section-add"
            title={addTitle}
          >
            <Plus size={18} />
          </button>
        )}
      </div>
      {expanded && (
        <div className="sidebar-section-list">{children}</div>
      )}
    </div>
  )
})

export default SidebarSection
