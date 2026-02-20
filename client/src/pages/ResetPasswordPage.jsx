import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { MessageCircle, Eye, EyeOff } from 'lucide-react'

export default function ResetPasswordPage() {
  const { token } = useParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const { resetPassword } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!password || !confirmPassword) {
      setError('Please fill in all fields')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      await resetPassword({ token, newPassword: password })
      setSuccess(true)
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Reset failed. The link may have expired.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    background: 'var(--bg-input)',
    border: '1px solid var(--border-primary)',
    color: 'var(--text-primary)',
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
            {success ? 'Password Reset!' : 'New Password'}
          </h1>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm"
            style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--accent-red)', border: '1px solid rgba(239,68,68,0.3)' }}>
            {error}
          </div>
        )}

        {success ? (
          <div className="text-center">
            <div className="mb-6 p-4 rounded-lg"
              style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
              <p className="text-sm" style={{ color: '#22c55e' }}>
                Your password has been reset successfully. You can now log in with your new password.
              </p>
            </div>
            <Link to="/login"
              className="inline-block px-6 py-2.5 rounded-lg font-medium text-white"
              style={{ background: 'var(--accent-primary)' }}>
              Go to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}>
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  placeholder="Min 8 chars, uppercase, lowercase, number"
                  className="w-full px-4 py-2.5 rounded-lg outline-none text-sm pr-10"
                  style={inputStyle}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}>
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError('') }}
                placeholder="Re-enter your new password"
                className="w-full px-4 py-2.5 rounded-lg outline-none text-sm"
                style={inputStyle}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg font-medium transition-opacity text-white cursor-pointer disabled:opacity-50 mt-1"
              style={{ background: 'var(--accent-primary)' }}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
