import { useState } from 'react'
import { Clock, FileEdit, Calendar } from 'lucide-react'
import DraftsSidebar from '../components/chat/DraftsSidebar'
import ScheduledMessagesList from '../components/chat/ScheduledMessagesList'
import { useDraftStore } from '../stores/draftStore'

export default function LaterPage() {
  const [activeTab, setActiveTab] = useState('drafts')
  const [scheduledCount, setScheduledCount] = useState(0)
  const draftCount = useDraftStore((s) => s.allDraftsForSidebar.length)

  const TABS = [
    { id: 'drafts', label: draftCount > 0 ? `Drafts (${draftCount})` : 'Drafts', icon: FileEdit },
    { id: 'scheduled', label: scheduledCount > 0 ? `Scheduled (${scheduledCount})` : 'Scheduled', icon: Calendar },
  ]

  return (
    <div className="page-container">
      <div className="page-header flex items-center gap-2">
        <Clock size={20} style={{ color: 'var(--accent-primary)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-white)', margin: 0 }}>Later</h1>
      </div>

      {/* Tab bar */}
      <div
        className="flex gap-1 px-4 py-2"
        style={{ borderBottom: '1px solid var(--border-primary)' }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
            style={{
              background: activeTab === tab.id ? 'var(--bg-active)' : 'transparent',
              color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'drafts' ? <DraftsSidebar /> : <ScheduledMessagesList onCountChange={setScheduledCount} />}
      </div>
    </div>
  )
}
