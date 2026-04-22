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
      <div className="page-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="page-body">
        {activeTab === 'drafts' ? <DraftsSidebar /> : <ScheduledMessagesList onCountChange={setScheduledCount} />}
      </div>
    </div>
  )
}
