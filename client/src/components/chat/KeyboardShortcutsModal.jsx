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
    <div className="shortcuts-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="shortcuts-modal"
      >
        {/* Header */}
        <div className="shortcuts-header">
          <div className="shortcuts-title">
            <Keyboard size={18} style={{ color: 'var(--accent-primary)' }} />
            <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
            className="shortcuts-close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="shortcuts-list">
          {SHORTCUTS.map(({ keys, description }) => (
            <div key={description} className="shortcuts-row">
              <span className="shortcuts-desc">{description}</span>
              <div className="shortcuts-keys">
                {keys.map((key) => (
                  <kbd key={key} className="kbd-shortcut">
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="shortcuts-footer">
          <p>On macOS, use ⌘ instead of Ctrl</p>
        </div>
      </div>
    </div>
  )
}
