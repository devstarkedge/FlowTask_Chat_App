import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { MessageCircle } from 'lucide-react'

export default function LoginPage() {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!token.trim()) {
      setError('Please enter your FlowTask token')
      return
    }

    setLoading(true)
    setError('')
    try {
      await login(token.trim())
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to authenticate with FlowTask')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, var(--bg-sidebar) 0%, var(--bg-primary) 100%)' }}>
      <div className="w-full max-w-md p-8 rounded-xl"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>

        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'var(--accent-primary)' }}>
            <MessageCircle size={32} color="white" />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-white)' }}>
            FlowTask Chat
          </h1>
          <p className="mt-2 text-center" style={{ color: 'var(--text-secondary)' }}>
            Enter your FlowTask JWT token to connect
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5"
              style={{ color: 'var(--text-secondary)' }}>
              FlowTask Token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => { setToken(e.target.value); setError('') }}
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              className="w-full px-4 py-2.5 rounded-lg outline-none transition-colors text-sm"
              style={{
                background: 'var(--bg-input)',
                border: `1px solid ${error ? 'var(--accent-red)' : 'var(--border-primary)'}`,
                color: 'var(--text-primary)',
              }}
              autoFocus
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: 'var(--accent-red)' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg font-medium transition-opacity text-white cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--accent-primary)' }}>
            {loading ? 'Connecting...' : 'Connect to Chat'}
          </button>

          <p className="text-xs text-center mt-2" style={{ color: 'var(--text-muted)' }}>
            Get your token from FlowTask settings or use the FlowTask login API
          </p>
        </form>
      </div>
    </div>
  )
}
