import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { MessageCircle, Eye, EyeOff } from 'lucide-react'

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const { register } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!name.trim() || !email.trim() || !password) {
      setError('All fields are required')
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
      await register({ name: name.trim(), email: email.trim(), password })
      setSuccess(true)
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    background: 'var(--bg-input)',
    border: '1px solid var(--border-primary)',
    color: 'var(--text-primary)',
  }

  if (success) {
    return (
      <div className="h-full flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, var(--bg-sidebar) 0%, var(--bg-primary) 100%)' }}>
        <div className="w-full max-w-md p-8 rounded-xl text-center"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(34,197,94,0.15)' }}>
            <span className="text-3xl">✉️</span>
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-white)' }}>
            Check Your Email
          </h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            We've sent a verification link to <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>.
            Please verify your email to activate your account.
          </p>
          <Link to="/login"
            className="inline-block px-6 py-2.5 rounded-lg font-medium text-white"
            style={{ background: 'var(--accent-primary)' }}>
            Go to Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, var(--bg-sidebar) 0%, var(--bg-primary) 100%)' }}>
      <div className="w-full max-w-md p-8 rounded-xl"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>

        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'var(--accent-primary)' }}>
            <MessageCircle size={32} color="white" />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-white)' }}>
            Create Account
          </h1>
          <p className="mt-1 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            Join FlowTask Chat
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm"
            style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--accent-red)', border: '1px solid rgba(239,68,68,0.3)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5"
              style={{ color: 'var(--text-secondary)' }}>
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError('') }}
              placeholder="John Doe"
              className="w-full px-4 py-2.5 rounded-lg outline-none text-sm"
              style={inputStyle}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5"
              style={{ color: 'var(--text-secondary)' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError('') }}
              placeholder="you@example.com"
              className="w-full px-4 py-2.5 rounded-lg outline-none text-sm"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5"
              style={{ color: 'var(--text-secondary)' }}>
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                placeholder="Min 8 chars, uppercase, lowercase, number"
                className="w-full px-4 py-2.5 rounded-lg outline-none text-sm pr-10"
                style={inputStyle}
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
              placeholder="Re-enter your password"
              className="w-full px-4 py-2.5 rounded-lg outline-none text-sm"
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg font-medium transition-opacity text-white cursor-pointer disabled:opacity-50 mt-1"
            style={{ background: 'var(--accent-primary)' }}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>

          <p className="text-sm text-center mt-1" style={{ color: 'var(--text-secondary)' }}>
            Already have an account?{' '}
            <Link to="/login" className="font-medium hover:underline"
              style={{ color: 'var(--accent-primary)' }}>
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
