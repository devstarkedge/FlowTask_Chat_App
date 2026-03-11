import { memo } from 'react'
import { Plus } from 'lucide-react'

const TabBar = memo(function TabBar({ tabs, activeTab, onTabChange, onAddTab }) {
  return (
    <div className="chat-header-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`chat-header-tab ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.icon && <tab.icon size={14} />}
          <span>{tab.label}</span>
        </button>
      ))}
      {onAddTab && (
        <button className="chat-header-tab-add" onClick={onAddTab}>
          <Plus size={14} />
          <span>Add New Tab</span>
        </button>
      )}
    </div>
  )
})

export default TabBar
