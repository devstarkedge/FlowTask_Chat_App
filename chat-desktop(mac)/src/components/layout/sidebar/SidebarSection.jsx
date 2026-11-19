import { memo } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'

/**
 * SidebarSection — Reusable collapsible section with a header.
 * Matches the grouped-card pattern used in NavigationSidebar.
 *
 * Props:
 *  - title:       Section title string
 *  - count:       Number of items (shown as badge)
 *  - expanded:    Whether section is expanded
 *  - onToggle:    Toggle expand/collapse handler
 *  - showAdd:     Show "+" button
 *  - onAdd:       "+" button click handler
 *  - addTitle:    Tooltip text for add button
 *  - collapsible: Whether section is collapsible
 *  - sticky:      Whether header & subHeader should remain sticky while scrolling
 *  - subHeader:   Optional element rendered directly below the header (e.g. sticky search bar)
 *  - children:    Section content (list of SidebarItem)
 */
const SidebarSection = memo(function SidebarSection({
  title,
  icon,
  count,
  expanded = true,
  onToggle,
  showAdd = false,
  onAdd,
  addTitle = 'Add',
  onEdit,
  editTitle = 'Edit',
  onDelete,
  deleteTitle = 'Delete',
  collapsible = true,
  sticky = false,
  subHeader,
  className = '',
  actionMenu,
  children,
}) {
  const hasCustomIcon = Boolean(icon);
  const defaultIconNode = hasCustomIcon ? (
    typeof icon === 'string' ? <span className="sidebar-category-emoji">{icon}</span> : icon
  ) : (
    expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />
  );
  const hoverChevronNode = expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />;

  const headerNode = (
    <div className="sidebar-section-header">
      <button
        type="button"
        onClick={collapsible ? onToggle : undefined}
        className={`sidebar-section-toggle ${hasCustomIcon ? 'has-custom-icon' : ''}`}
        style={!collapsible ? { cursor: 'default' } : undefined}
      >
        <span className="sidebar-section-icon-wrapper">
          <span className="sidebar-section-icon-default">{defaultIconNode}</span>
          {hasCustomIcon && collapsible && (
            <span className="sidebar-section-icon-hover">{hoverChevronNode}</span>
          )}
        </span>
        <span className="sidebar-section-title">{title}</span>
        {count != null && count > 0 && (
          <span className="sidebar-section-count">{count}</span>
        )}
      </button>
      <div style={{ display: 'flex', gap: 4 }}>
        {onEdit && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="sidebar-section-add"
            title={editTitle}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="sidebar-section-add"
            title={deleteTitle}
            style={{ color: 'var(--accent-red, #ef4444)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
          </button>
        )}
        {showAdd && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            className="sidebar-section-add"
            title={addTitle}
          >
            <Plus size={16} />
          </button>
        )}
        {actionMenu}
      </div>
    </div>
  );

  return (
    <div className={`sidebar-section ${sticky ? 'sidebar-section--sticky' : ''} ${className}`.trim()}>
      {sticky ? (
        <div className="sidebar-section-sticky-wrapper">
          {headerNode}
          {expanded && subHeader}
        </div>
      ) : (
        <>
          {headerNode}
          {expanded && subHeader}
        </>
      )}
      {expanded && (
        <div className="sidebar-section-list">{children}</div>
      )}
    </div>
  );
});

export default SidebarSection;