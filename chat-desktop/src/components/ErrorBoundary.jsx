import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import logger from '../utils/logger'

/**
 * Reusable Error Boundary — catches render errors and displays a styled fallback.
 *
 * Usage:
 *   <ErrorBoundary name="MessageList">
 *     <MessageList />
 *   </ErrorBoundary>
 *
 * Props:
 *   - name: human-readable label for which section crashed (shown in fallback)
 *   - fallback: optional custom fallback component (receives { error, resetError })
 *   - onError: optional callback(error, errorInfo) for external logging
 *   - compact: if true, renders a minimal inline fallback instead of a card
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    logger.error(`[ErrorBoundary:${this.props.name || 'unknown'}]`, error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  resetError = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    // Custom fallback
    if (this.props.fallback) {
      const Fallback = this.props.fallback
      return <Fallback error={this.state.error} resetError={this.resetError} />
    }

    // Compact inline fallback
    if (this.props.compact) {
      return (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-secondary)',
          }}
        >
          <AlertTriangle size={14} style={{ color: 'var(--accent-yellow)', flexShrink: 0 }} />
          <span className="truncate">
            {this.props.name ? `${this.props.name} encountered an error` : 'Something went wrong'}
          </span>
          <button
            type="button"
            onClick={this.resetError}
            className="ml-auto px-2 py-0.5 rounded text-xs cursor-pointer"
            style={{
              color: 'var(--text-link)',
              background: 'transparent',
              border: '1px solid var(--border-secondary)',
            }}
          >
            Retry
          </button>
        </div>
      )
    }

    // Full card fallback
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div
          className="max-w-sm w-full rounded-xl p-6 text-center"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(234, 88, 12, 0.1)' }}
          >
            <AlertTriangle size={24} style={{ color: 'var(--accent-orange)' }} />
          </div>

          <h3
            className="text-base font-semibold mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            {this.props.name ? `${this.props.name} crashed` : 'Something went wrong'}
          </h3>

          <p
            className="text-sm mb-4"
            style={{ color: 'var(--text-muted)' }}
          >
            An unexpected error occurred. Try refreshing this section.
          </p>

          {process.env.NODE_ENV !== 'production' && this.state.error && (
            <pre
              className="text-left text-xs mb-4 p-3 rounded-lg overflow-auto max-h-32"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--accent-red)',
                border: '1px solid var(--border-secondary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {this.state.error.message}
            </pre>
          )}

          <button
            type="button"
            onClick={this.resetError}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
            style={{
              background: 'var(--accent-primary)',
              color: 'var(--text-white)',
              border: 'none',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-primary-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent-primary)')}
          >
            <RefreshCw size={14} />
            Try Again
          </button>
        </div>
      </div>
    )
  }
}
