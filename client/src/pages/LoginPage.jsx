import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { Link, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, MessageCircle, ArrowRight, Zap, Shield, Users, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { loginNative, loginFlowTask, isLoading, error, clearError, flowtaskEnabled } = useAuthStore()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(flowtaskEnabled ? 'flowtask' : 'native')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [flowtaskToken, setFlowtaskToken] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [autoLoginAttempted, setAutoLoginAttempted] = useState(false)
  const [autoLoginInProgress, setAutoLoginInProgress] = useState(false)

  // Auto-login from FlowTask redirect: ?token=<jwt>&source=flowtask
  useEffect(() => {
    if (autoLoginAttempted) return
    const token = searchParams.get('token')
    const source = searchParams.get('source')
    if (token && source === 'flowtask') {
      setAutoLoginAttempted(true)
      setAutoLoginInProgress(true)
      loginFlowTask(token)
        .then(() => toast.success('Welcome from FlowTask!'))
        .catch(() => {
          toast.error('FlowTask auto-login failed. Please try again.')
          setAutoLoginInProgress(false)
        })
    }
  }, [searchParams, autoLoginAttempted, loginFlowTask])

  // Show loading screen during auto-login
  if (autoLoginInProgress) {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{ background: 'var(--bg-primary)' }}
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={40} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
            Signing in from FlowTask...
          </p>
        </div>
      </div>
    )
  }

  const handleNativeLogin = async (e) => {
    e.preventDefault()
    clearError()
    try {
      await loginNative({ email, password })
      toast.success('Welcome back!')
    } catch {
      // error handled in store
    }
  }

  const handleFlowTaskLogin = async (e) => {
    e.preventDefault()
    clearError()
    if (!flowtaskToken.trim()) {
      toast.error('Please enter your FlowTask token')
      return
    }
    try {
      await loginFlowTask(flowtaskToken.trim())
      toast.success('FlowTask login successful!')
    } catch {
      // error handled in store
    }
  }

  return (
    <div
      className="h-full flex"
      style={{ background: 'var(--bg-primary)' }}
    >
      {/* Left Panel — Branding */}
      <div
        className="hidden lg:flex flex-col justify-between p-10"
        style={{
          width: '45%',
          background: 'linear-gradient(135deg, #0f1922 0%, #0d2137 50%, #1a1d21 100%)',
          borderRight: '1px solid var(--border-secondary)',
        }}
      >
        <div>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--accent-primary)' }}
            >
              <MessageCircle size={22} color="white" />
            </div>
            <span
              className="text-xl font-bold"
              style={{ color: 'var(--text-white)' }}
            >
              FlowTask Chat
            </span>
          </div>

          {/* Headline */}
          <h1
            className="text-4xl font-bold leading-tight mb-4"
            style={{ color: 'var(--text-white)' }}
          >
            Enterprise
            <br />
            Communication
            <br />
            <span style={{ color: 'var(--accent-primary)' }}>Reimagined.</span>
          </h1>

          <p
            className="text-lg leading-relaxed mb-10"
            style={{ color: 'var(--text-secondary)', maxWidth: 400 }}
          >
            Real-time messaging platform built for teams that use FlowTask.
            Project-aware channels, instant notifications, and seamless integration.
          </p>

          {/* Features */}
          <div className="flex flex-col gap-4">
            <FeatureItem
              icon={Zap}
              title="Real-Time Messaging"
              desc="Instant delivery with WebSocket technology"
            />
            <FeatureItem
              icon={Shield}
              title="Enterprise Security"
              desc="JWT auth, RBAC, and HMAC verification"
            />
            <FeatureItem
              icon={Users}
              title="Project Channels"
              desc="Auto-created from FlowTask projects"
            />
          </div>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          © {new Date().getFullYear()} FlowTask Chat · Enterprise Edition
        </p>
      </div>

      {/* Right Panel — Login Form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md animate-fade-in-up">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
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

          <h2
            className="text-2xl font-bold mb-1"
            style={{ color: 'var(--text-white)' }}
          >
            Welcome back
          </h2>
          <p className="mb-6" style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Sign in to continue to your workspace
          </p>

          {/* Auth Method Tabs */}
          {flowtaskEnabled && (
            <div
              className="flex rounded-lg p-1 mb-6"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
            >
              <TabButton
                active={activeTab === 'flowtask'}
                onClick={() => { setActiveTab('flowtask'); clearError() }}
                label="FlowTask SSO"
              />
              <TabButton
                active={activeTab === 'native'}
                onClick={() => { setActiveTab('native'); clearError() }}
                label="Email & Password"
              />
            </div>
          )}

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

          {/* FlowTask SSO Tab */}
          {activeTab === 'flowtask' && (
            <form onSubmit={handleFlowTaskLogin} className="animate-fade-in">
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  FlowTask JWT Token
                </label>
                <textarea
                  value={flowtaskToken}
                  onChange={(e) => setFlowtaskToken(e.target.value)}
                  placeholder="Paste your FlowTask JWT token here..."
                  rows={3}
                  className="input-field"
                  style={{ resize: 'none', fontFamily: 'monospace', fontSize: 12 }}
                />
                <p className="mt-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Get your token from FlowTask → Settings → API Access
                </p>
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
                    Authenticating...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    Sign in with FlowTask
                    <ArrowRight size={16} />
                  </div>
                )}
              </button>
            </form>
          )}

          {/* Native Login Tab */}
          {activeTab === 'native' && (
            <form onSubmit={handleNativeLogin} className="animate-fade-in">
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
                  autoComplete="email"
                />
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Password
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-xs hover:underline"
                    style={{ color: 'var(--text-link)' }}
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="input-field"
                    style={{ paddingRight: 40 }}
                    required
                    autoComplete="current-password"
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
                    Signing in...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    Sign in
                    <ArrowRight size={16} />
                  </div>
                )}
              </button>
            </form>
          )}

          {/* Register Link */}
          <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            Don't have an account?{' '}
            <Link
              to="/register"
              className="font-medium hover:underline"
              style={{ color: 'var(--text-link)' }}
            >
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function TabButton({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-2 rounded-md text-sm font-medium transition-all cursor-pointer"
      style={{
        background: active ? 'var(--accent-primary)' : 'transparent',
        color: active ? 'white' : 'var(--text-muted)',
        border: 'none',
      }}
    >
      {label}
    </button>
  )
}

function FeatureItem({ icon: Icon, title, desc }) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: 'rgba(18, 100, 163, 0.15)' }}
      >
        <Icon size={18} style={{ color: 'var(--accent-primary)' }} />
      </div>
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-white)' }}>{title}</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{desc}</p>
      </div>
    </div>
  )
}
