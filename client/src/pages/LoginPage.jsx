import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { MessageCircle, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState('native')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [flowTaskToken, setFlowTaskToken] = useState('')
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [loading, setLoading] = useState(false)

  const { loginNative, loginFlowTask, flowtaskEnabled } = useAuthStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    if (searchParams.get('verified') === 'true') {
      setSuccessMsg('Email verified successfully! You can now log in.')
    }
  }, [searchParams])

  const handleNativeLogin = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setError('Please enter email and password')
      return
    }
    setLoading(true)
    setError('')
    try {
      await loginNative({ email: email.trim(), password })
      navigate('/chat')
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleFlowTaskLogin = async (e) => {
    e.preventDefault()
    if (!flowTaskToken.trim()) {
      setError('Please enter your FlowTask token')
      return
    }
    setLoading(true)
    setError('')
    try {
      await loginFlowTask(flowTaskToken.trim())
      navigate('/chat')
    } catch (err) {
      setError(err.response?.data?.error?.message || 'FlowTask authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = (hasError) => ({
    background: 'var(--bg-input)',
    border: `1px solid ${hasError ? 'var(--accent-red)' : 'var(--border-primary)'}`,
    color: 'var(--text-primary)',
  })

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
            FlowTask Chat
          </h1>
          <p className="mt-1 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            Sign in to your account
          </p>
        </div>

        {/* Success Message */}
        {successMsg && (
          <div className="mb-4 p-3 rounded-lg text-sm"
            style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
            {successMsg}
          </div>
        )}

        {/* Tabs (only show if FlowTask enabled) */}
        {flowtaskEnabled && (
          <div className="flex mb-6 rounded-lg overflow-hidden"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-primary)' }}>
            <button
              onClick={() => { setActiveTab('native'); setError('') }}
              className="flex-1 py-2.5 text-sm font-medium transition-colors cursor-pointer"
              style={{
                background: activeTab === 'native' ? 'var(--accent-primary)' : 'transparent',
                color: activeTab === 'native' ? 'white' : 'var(--text-secondary)',
              }}>
              Chat Account
            </button>
            <button
              onClick={() => { setActiveTab('flowtask'); setError('') }}
              className="flex-1 py-2.5 text-sm font-medium transition-colors cursor-pointer"
              style={{
                background: activeTab === 'flowtask' ? 'var(--accent-primary)' : 'transparent',
                color: activeTab === 'flowtask' ? 'white' : 'var(--text-secondary)',
              }}>
              FlowTask SSO
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm"
            style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--accent-red)', border: '1px solid rgba(239,68,68,0.3)' }}>
            {error}
          </div>
        )}

        {/* Native Login Form */}
        {activeTab === 'native' && (
          <form onSubmit={handleNativeLogin} className="flex flex-col gap-4">
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
                className="w-full px-4 py-2.5 rounded-lg outline-none transition-colors text-sm"
                style={inputStyle(false)}
                autoFocus
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
                  placeholder="Enter your password"
                  className="w-full px-4 py-2.5 rounded-lg outline-none transition-colors text-sm pr-10"
                  style={inputStyle(false)}
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

            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-sm hover:underline"
                style={{ color: 'var(--accent-primary)' }}>
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg font-medium transition-opacity text-white cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--accent-primary)' }}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <p className="text-sm text-center mt-1" style={{ color: 'var(--text-secondary)' }}>
              Don't have an account?{' '}
              <Link to="/register" className="font-medium hover:underline"
                style={{ color: 'var(--accent-primary)' }}>
                Create one
              </Link>
            </p>
          </form>
        )}

        {/* FlowTask SSO Form */}
        {activeTab === 'flowtask' && flowtaskEnabled && (
          <form onSubmit={handleFlowTaskLogin} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}>
                FlowTask Token
              </label>
              <input
                type="password"
                value={flowTaskToken}
                onChange={(e) => { setFlowTaskToken(e.target.value); setError('') }}
                placeholder="eyJhbGciOiJIUzI1NiIs..."
                className="w-full px-4 py-2.5 rounded-lg outline-none transition-colors text-sm"
                style={inputStyle(false)}
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg font-medium transition-opacity text-white cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--accent-primary)' }}>
              {loading ? 'Connecting...' : 'Connect via FlowTask'}
            </button>

            <p className="text-xs text-center mt-2" style={{ color: 'var(--text-muted)' }}>
              Get your token from FlowTask settings or use the FlowTask login API
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
