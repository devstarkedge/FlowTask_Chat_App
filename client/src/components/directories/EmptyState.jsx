import { SearchX } from 'lucide-react'

export default function EmptyState({ icon: Icon = SearchX, title = 'No results found', description, onRetry }) {
  return (
    <div className="dsl-empty-root">
      <div className="dsl-empty">
        <Icon size={40} className="mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
        <h3 className="dsl-empty-title" style={{ color: 'var(--text-white)' }}>
          {title}
        </h3>
        {description && (
          <p className="dsl-empty-desc" style={{ color: 'var(--text-muted)' }}>{description}</p>
        )}
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
            style={{
              background: 'var(--accent-primary)',
              color: '#fff',
              border: 'none',
            }}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  )
}
