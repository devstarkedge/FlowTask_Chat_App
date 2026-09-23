import React from 'react'
import { ChevronRight } from 'lucide-react'

export default function SectionHeader({ title, subtitle, right, className = '' }) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div>
        <div className="flex items-baseline gap-2">
          <h4 className="text-sm font-semibold" style={{ color: 'var(--text-white)' }}>{title}</h4>
          {subtitle && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{subtitle}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {right}
        <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
      </div>
    </div>
  )
}
