import React from 'react'
import TemplateSelector from '../components/canvas/TemplateSelector'

export default function DevTemplateSelector() {
  return (
    <div style={{ height: '100vh', display: 'flex', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <TemplateSelector
        onSelect={async (sel) => {
          // For dev: log and show a confirmation
          // eslint-disable-next-line no-console
          console.log('[Dev] template selected', sel)
          // show a brief UI confirmation so it's obvious the callback fired
          // eslint-disable-next-line no-alert
          alert(`Template selected: ${sel?.title || sel?.id || 'unknown'}`)
        }}
        onBack={() => window.history.back()}
      />
    </div>
  )
}
