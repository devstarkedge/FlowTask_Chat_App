import { SearchX } from 'lucide-react'

export default function EmptyState({ icon: Icon = SearchX, title = 'No results found', description, onRetry }) {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="text-center max-w-xs">
        <Icon size={40} className="mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
        <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-white)' }}>
          {title}
        </h3>
        {description && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{description}</p>
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
