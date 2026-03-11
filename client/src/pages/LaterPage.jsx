import { Clock } from 'lucide-react'

export default function LaterPage() {
  return (
    <div className="page-container">
      <div className="page-header">
        <Clock size={20} style={{ color: 'var(--accent-primary)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-white)' }}>Later</h1>
      </div>
      <div className="page-body">
        <div className="text-center py-16">
          <Clock size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-white)' }}>
            Nothing saved for later
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Save messages, files, and links to come back to them later
          </p>
        </div>
      </div>
    </div>
  )
}
