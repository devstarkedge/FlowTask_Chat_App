import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, MessageCircle, Check } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ResetPasswordPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { resetPassword, isLoading, error, clearError } = useAuthStore()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [success, setSuccess] = useState(false)

  const checks = [
    { label: 'At least 8 characters', ok: newPassword.length >= 8 },
    { label: 'Contains uppercase', ok: /[A-Z]/.test(newPassword) },
    { label: 'Contains number', ok: /\d/.test(newPassword) },
    { label: 'Passwords match', ok: newPassword && confirmPassword && newPassword === confirmPassword },
  ]
  const allChecks = checks.every((c) => c.ok)

  const handleSubmit = async (e) => {
    e.preventDefault()
    clearError()
    if (!allChecks) {
      toast.error('Please fix password requirements')
      return
    }
    try {
      await resetPassword({ token, newPassword })
      setSuccess(true)
      toast.success('Password reset successful!')
    } catch {
      // error set in store
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
            Password Reset!
          </h2>
          <p className="mb-6" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Your password has been successfully reset.
          </p>
          <Link
            to="/login"
            className="btn-primary"
            style={{ padding: '10px 24px', fontSize: 15, textDecoration: 'none' }}
          >
            Sign In
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
          Reset your password
        </h2>
        <p className="mb-6 text-center" style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Enter a new password for your account
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
              New password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) =>{
                  let value = e.target.value
                  value = value.replace(/\s/g, "")
                  setNewPassword(value)
                }}
                placeholder="Enter new password"
                onKeyDown={(e) => {
                    if (e.key === " ") e.preventDefault();
                  }}
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
              value={confirmPassword}
              onChange={(e) =>{ 
                let value = e.target.value
                value = value.replace(/\s/g, "")
                setConfirmPassword(value)
              }}
              placeholder="Confirm new password"
              onKeyDown={(e) => {
                if (e.key === " ") e.preventDefault();
              }}
              className="input-field"
              required
            />
          </div>

          {newPassword && (
            <div className="mb-4 animate-fade-in">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {checks.map((check) => (
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
                Resetting...
              </div>
            ) : (
              'Reset Password'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm">
          <Link to="/login" className="hover:underline" style={{ color: 'var(--text-link)' }}>
            Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  )
}
