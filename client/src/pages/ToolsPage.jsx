import { Wrench } from 'lucide-react'

export default function ToolsPage() {
  return (
    <div className="page-container">
      <div className="page-header">
        <Wrench size={20} style={{ color: 'var(--accent-primary)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-white)' }}>Tools</h1>
      </div>
      <div className="page-body">
        <div className="text-center py-16">
          <Wrench size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-white)' }}>
            Workflows & Automations
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Build custom workflows and integrate with your favorite tools
          </p>
        </div>
      </div>
    </div>
  )
}
