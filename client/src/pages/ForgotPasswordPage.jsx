import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { MessageCircle, ArrowLeft } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const { forgotPassword } = useAuthStore()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Please enter your email')
      return
    }
    setLoading(true)
    setError('')
    try {
      await forgotPassword(email.trim())
      setSent(true)
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, var(--bg-sidebar) 0%, var(--bg-primary) 100%)' }}>
      <div className="w-full max-w-md p-8 rounded-xl"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>

        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'var(--accent-primary)' }}>
            <MessageCircle size={32} color="white" />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-white)' }}>
            Reset Password
          </h1>
          <p className="mt-1 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            {sent
              ? 'Check your email for the reset link'
              : "Enter your email and we'll send you a reset link"}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm"
            style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--accent-red)', border: '1px solid rgba(239,68,68,0.3)' }}>
            {error}
          </div>
        )}

        {sent ? (
          <div className="text-center">
            <div className="mb-6 p-4 rounded-lg"
              style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
              <p className="text-sm" style={{ color: '#22c55e' }}>
                If an account exists for <strong>{email}</strong>, you'll receive a password reset link shortly.
              </p>
            </div>
            <Link to="/login"
              className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
              style={{ color: 'var(--accent-primary)' }}>
              <ArrowLeft size={16} /> Back to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError('') }}
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 rounded-lg outline-none text-sm"
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-primary)',
                }}
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg font-medium transition-opacity text-white cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--accent-primary)' }}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <Link to="/login"
              className="text-sm text-center font-medium hover:underline inline-flex items-center justify-center gap-1"
              style={{ color: 'var(--accent-primary)' }}>
              <ArrowLeft size={14} /> Back to Login
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
