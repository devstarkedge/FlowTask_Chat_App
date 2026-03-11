import { Activity } from 'lucide-react'

export default function ActivityPage() {
  return (
    <div className="page-container">
      <div className="page-header">
        <Activity size={20} style={{ color: 'var(--accent-primary)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-white)' }}>Activity</h1>
      </div>
      <div className="page-body">
        <div className="text-center py-16">
          <Activity size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-white)' }}>
            No new activity
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Mentions, reactions, and replies to your messages will show up here
          </p>
        </div>
      </div>
    </div>
  )
}
