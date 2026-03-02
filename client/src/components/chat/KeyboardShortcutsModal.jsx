import { useEffect, useRef } from 'react'
import { X, Keyboard } from 'lucide-react'
import { SHORTCUTS } from '../../utils/keyboardShortcuts'

export default function KeyboardShortcutsModal({ onClose }) {
  const modalRef = useRef(null)
  const closeBtnRef = useRef(null)

  useEffect(() => {
    const previousActive = document.activeElement

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

    const focusFirst = () => {
      if (!modalRef.current) return
      const focusables = modalRef.current.querySelectorAll(focusableSelector)
      ;(closeBtnRef.current || focusables[0])?.focus?.()
    }

    focusFirst()

    const handleKeyDown = (e) => {
      if (!modalRef.current) return

      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      if (e.key !== 'Tab') return

      const focusables = modalRef.current.querySelectorAll(focusableSelector)
      if (focusables.length === 0) return

      const first = focusables[0]
      const last = focusables[focusables.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previousActive && typeof previousActive.focus === 'function') {
        previousActive.focus()
      }
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="w-full max-w-sm rounded-xl shadow-2xl"
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-primary)' }}
        >
          <div className="flex items-center gap-2">
            <Keyboard size={18} style={{ color: 'var(--accent-primary)' }} />
            <h2 id="shortcuts-title" className="text-base font-semibold" style={{ color: 'var(--text-white)' }}>
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
            className="p-1.5 rounded-lg transition-colors cursor-pointer hover:[background:var(--bg-hover)] focus:[background:var(--bg-hover)] focus:outline-none"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="px-5 py-4 space-y-2.5">
          {SHORTCUTS.map(({ keys, description }) => (
            <div key={description} className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {description}
              </span>
              <div className="flex items-center gap-1">
                {keys.map((key) => (
                  <kbd
                    key={key}
                    className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[11px] font-mono font-medium min-w-6"
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-primary)',
                      color: 'var(--text-muted)',
                      boxShadow: '0 1px 0 var(--border-secondary)',
                    }}
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div
          className="px-5 py-3 text-center"
          style={{ borderTop: '1px solid var(--border-primary)' }}
        >
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            On macOS, use ⌘ instead of Ctrl
          </p>
        </div>
      </div>
    </div>
  )
}
