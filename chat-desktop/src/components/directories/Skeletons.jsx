export function CardSkeleton() {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}
    >
      <div className="p-4 flex flex-col items-center">
        <div className="w-24 h-24 rounded-full mb-3 shimmer" style={{ background: 'var(--bg-skeleton)' }} />
        <div className="w-28 h-4 rounded mb-2 shimmer" style={{ background: 'var(--bg-skeleton)' }} />
        <div className="w-16 h-3 rounded shimmer" style={{ background: 'var(--bg-skeleton)' }} />
      </div>
    </div>
  )
}

export function CardSkeletonGrid({ count = 10, columns }) {
  return (
    <div
      className="grid gap-4 p-4"
      style={{ gridTemplateColumns: columns || 'repeat(auto-fill, minmax(180px, 1fr))' }}
    >
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}

export function ListSkeleton({ count = 6 }) {
  return (
    <div className="flex flex-col gap-1 p-4">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-3 rounded-lg"
          style={{ background: 'var(--bg-card)' }}
        >
          <div className="w-8 h-8 rounded-full shrink-0 shimmer" style={{ background: 'var(--bg-skeleton)' }} />
          <div className="flex-1 space-y-2">
            <div className="w-40 h-4 rounded shimmer" style={{ background: 'var(--bg-skeleton)' }} />
            <div className="w-24 h-3 rounded shimmer" style={{ background: 'var(--bg-skeleton)' }} />
          </div>
          <div className="w-16 h-3 rounded shimmer" style={{ background: 'var(--bg-skeleton)' }} />
        </div>
      ))}
    </div>
  )
}
