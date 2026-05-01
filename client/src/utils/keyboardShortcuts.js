import { useEffect } from 'react'

/**
 * Global keyboard shortcuts for the chat application.
 *
 * @param {object} handlers - Map of action names to handler functions.
 *   - toggleSearch: Ctrl+K or Cmd+K
 *   - toggleLocalSearch: Ctrl+F or Cmd+F
 *   - toggleThreads: Ctrl+Shift+H or Cmd+Shift+H
 *   - escape: Escape (when not in an input)
 *   - showShortcuts: Ctrl+/ or Cmd+/
 */
export function useKeyboardShortcuts(handlers = {}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMod = e.ctrlKey || e.metaKey
      const target = e.target
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      // Ctrl/Cmd + K — Toggle search
      if (isMod && e.key === 'k') {
        e.preventDefault()
        handlers.toggleSearch?.()
        return
      }

      // Ctrl/Cmd + F — Toggle contextual channel search
      if (isMod && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        handlers.toggleLocalSearch?.()
        return
      }

      // Ctrl/Cmd + Shift + H — Toggle all threads
      if (isMod && e.shiftKey && e.key === 'H') {
        e.preventDefault()
        handlers.toggleThreads?.()
        return
      }

      // Ctrl/Cmd + / — Show keyboard shortcuts
      if (isMod && e.key === '/') {
        e.preventDefault()
        handlers.showShortcuts?.()
        return
      }

      // Escape — Close panels / focus message input
      if (e.key === 'Escape' && !isInput) {
        handlers.escape?.()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handlers])
}

/**
 * List of all shortcuts for display in help modal.
 */
export const SHORTCUTS = [
  { keys: ['Ctrl', 'K'], description: 'Search messages' },
  { keys: ['Ctrl', 'F'], description: 'Search in current channel' },
  { keys: ['Ctrl', 'Shift', 'H'], description: 'All threads' },
  { keys: ['Ctrl', '/'], description: 'Keyboard shortcuts' },
  { keys: ['Esc'], description: 'Close panel' },
  { keys: ['Enter'], description: 'Send message' },
  { keys: ['Shift', 'Enter'], description: 'New line in message' },
  { keys: ['↑'], description: 'Edit last message (in empty input)' },
]
