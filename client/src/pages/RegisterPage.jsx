import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, MessageCircle, ArrowRight, Check } from 'lucide-react'
import toast from 'react-hot-toast'

export default function RegisterPage() {
  const { register, isLoading, error, clearError } = useAuthStore()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [success, setSuccess] = useState(false)

  const updateField = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
    clearError()
  }

  const passwordChecks = [
    { label: 'At least 8 characters', ok: form.password.length >= 8 },
    { label: 'Contains uppercase', ok: /[A-Z]/.test(form.password) },
    { label: 'Contains number', ok: /\d/.test(form.password) },
    { label: 'Passwords match', ok: form.password && form.confirmPassword && form.password === form.confirmPassword },
  ]
  const allChecks = passwordChecks.every((c) => c.ok)

  const handleSubmit = async (e) => {
    e.preventDefault()
    clearError()
    if (!allChecks) {
      toast.error('Please fix password requirements')
      return
    }
    try {
      await register({ name: form.name, email: form.email, password: form.password })
      setSuccess(true)
      toast.success('Account created! Check your email.')
    } catch {
      // error is set in store
    }
  }

  if (success) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center max-w-md animate-fade-in-up">
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(0, 122, 90, 0.15)' }}
          >
            <Check size={32} style={{ color: 'var(--accent-green)' }} />
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-white)' }}>
            Account Created!
          </h2>
          <p className="mb-6" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            We've sent a verification email to <strong style={{ color: 'var(--text-white)' }}>{form.email}</strong>.
            Please verify your email to sign in.
          </p>
          <Link
            to="/login"
            className="btn-primary"
            style={{ padding: '10px 24px', fontSize: 15, textDecoration: 'none' }}
          >
            Go to Sign In
          </Link>
        </div>
      </div>
    )
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

        <h2 className="text-2xl font-bold mb-1 text-center" style={{ color: 'var(--text-white)' }}>
          Create your account
        </h2>
        <p className="mb-6 text-center" style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Join your team on FlowTask Chat
        </p>

        {/* Error */}
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
              Full name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={updateField('name')}
              placeholder="John Doe"
              className="input-field"
              maxLength={30}
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Email address
            </label>
            <input
              type="email"
              value={form.email}
              onChange={updateField('email')}
              placeholder="you@company.com"
              className="input-field"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={updateField('password')}
                placeholder="Create a strong password"
                className="input-field"
                style={{ paddingRight: 40 }}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded cursor-pointer"
                style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Confirm password
            </label>
            <input
              type="password"
              value={form.confirmPassword}
              onChange={updateField('confirmPassword')}
              placeholder="Confirm your password"
              className="input-field"
              required
            />
          </div>

          {/* Password strength checks */}
          {form.password && (
            <div className="mb-4 animate-fade-in">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {passwordChecks.map((check) => (
                  <div key={check.label} className="flex items-center gap-1.5">
                    <div
                      className="w-3.5 h-3.5 rounded-full flex items-center justify-center"
                      style={{
                        background: check.ok ? 'var(--accent-green)' : 'var(--bg-hover)',
                        transition: 'background var(--transition-fast)',
                      }}
                    >
                      {check.ok && <Check size={9} color="white" />}
                    </div>
                    <span
                      className="text-[11px]"
                      style={{ color: check.ok ? 'var(--accent-green)' : 'var(--text-muted)' }}
                    >
                      {check.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !allChecks}
            className="btn-primary w-full"
            style={{ padding: '10px 16px', fontSize: 15 }}
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: 'white', borderTopColor: 'transparent' }}
                />
                Creating account...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                Create account
                <ArrowRight size={16} />
              </div>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" className="font-medium hover:underline" style={{ color: 'var(--text-link)' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
