import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { Link } from 'react-router-dom'
import { MessageCircle, ArrowLeft, Mail, Check } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ForgotPasswordPage() {
  const { forgotPassword, isLoading, error, clearError } = useAuthStore()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    clearError()
    try {
      await forgotPassword(email)
      setSent(true)
      toast.success('Reset link sent!')
    } catch {
      // error set in store
    }
  }

  return (
    <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-md p-6 animate-fade-in-up">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--accent-primary)' }}
          >
            <MessageCircle size={22} color="white" />
          </div>
          <span className="text-xl font-bold" style={{ color: 'var(--text-white)' }}>
            FlowTask Chat
          </span>
        </div>

        {sent ? (
          <div className="text-center animate-fade-in">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(0, 122, 90, 0.15)' }}
            >
              <Mail size={32} style={{ color: 'var(--accent-green)' }} />
            </div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-white)' }}>
              Check your email
            </h2>
            <p className="mb-6" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              We sent a password reset link to{' '}
              <strong style={{ color: 'var(--text-white)' }}>{email}</strong>
            </p>
            <Link
              to="/login"
              className="btn-primary"
              style={{ padding: '10px 24px', fontSize: 15, textDecoration: 'none' }}
            >
              Back to Sign In
            </Link>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold mb-1 text-center" style={{ color: 'var(--text-white)' }}>
              Forgot password?
            </h2>
            <p className="mb-6 text-center" style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              Enter your email and we'll send you a reset link
            </p>

            {error && (
              <div
                className="mb-4 px-4 py-3 rounded-lg text-sm animate-fade-in"
                style={{
                  background: 'rgba(224, 30, 90, 0.1)',
                  border: '1px solid rgba(224, 30, 90, 0.3)',
                  color: 'var(--accent-red)',
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="input-field"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full"
                style={{ padding: '10px 16px', fontSize: 15 }}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                      style={{ borderColor: 'white', borderTopColor: 'transparent' }}
                    />
                    Sending...
                  </div>
                ) : (
                  'Send reset link'
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-sm">
              <Link to="/login" className="flex items-center gap-1 justify-center hover:underline" style={{ color: 'var(--text-link)' }}>
                <ArrowLeft size={14} /> Back to Sign In
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
