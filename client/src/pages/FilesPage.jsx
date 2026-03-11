import { FileText } from 'lucide-react'

export default function FilesPage() {
  return (
    <div className="page-container">
      <div className="page-header">
        <FileText size={20} style={{ color: 'var(--accent-primary)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-white)' }}>Files</h1>
      </div>
      <div className="page-body">
        <div className="text-center py-16">
          <FileText size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-white)' }}>
            All your files in one place
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Files shared in channels and direct messages appear here
          </p>
        </div>
      </div>
    </div>
  )
}
