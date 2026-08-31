import { memo, useRef, useCallback } from 'react'
import { Plus } from 'lucide-react'

const TabBar = memo(function TabBar({ tabs = [], activeTab, onTabChange, onAddTab, compact = false }) {
  const listRef = useRef(null)

  const focusTabAt = useCallback((index) => {
    const list = listRef.current
    if (!list) return
    const tabEls = list.querySelectorAll('[role="tab"]')
    const el = tabEls[index]
    if (el) el.focus()
  }, [])

  const onKeyDown = useCallback((e) => {
    const list = listRef.current
    if (!list) return
    const tabEls = Array.from(list.querySelectorAll('[role="tab"]'))
    if (!tabEls.length) return
    const currentIndex = tabEls.indexOf(document.activeElement)

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const next = (currentIndex + 1) % tabEls.length
      focusTabAt(next)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const prev = (currentIndex - 1 + tabEls.length) % tabEls.length
      focusTabAt(prev)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusTabAt(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusTabAt(tabEls.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      const focused = document.activeElement
      if (focused && focused.dataset && focused.dataset.tabId) {
        onTabChange?.(focused.dataset.tabId)
      }
    }
  }, [focusTabAt, onTabChange])

  return (
    <div
      className={`slim-tabbar flex items-center gap-2 min-w-0 overflow-x-auto no-scrollbar ${compact ? 'slim-tabbar--compact' : ''}`}
      role="tablist"
      ref={listRef}
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            data-tab-id={tab.id}
            className={`slim-tab ${isActive ? 'slim-tab--active' : ''} ${compact ? 'slim-tab--compact' : ''}`}
            onClick={() => onTabChange?.(tab.id)}
            title={tab.label}
          >
            {Icon && <span className="slim-tab__icon"><Icon size={14} /></span>}
            <span className="slim-tab__label">{tab.label}</span>
          </button>
        )
      })}

      {onAddTab && (
        <button
          className={`slim-tab slim-tab--add ${compact ? 'slim-tab--compact' : ''}`}
          role="button"
          onClick={onAddTab}
          title="Add New Tab"
        >
          <span className="slim-tab__icon"><Plus size={14} /></span>
          <span className="slim-tab__label">Add New Tab</span>
        </button>
      )}
    </div>
  )
})

export default TabBar
