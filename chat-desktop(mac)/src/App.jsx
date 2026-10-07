import { useEffect, Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useSearchParams, useLocation } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { useThemeStore } from './stores/themeStore'
import { useWorkspaceStore, getSavedWorkspaceId } from './stores/workspaceStore'
import { usePresenceTracker } from './hooks/usePresenceTracker'
import { isDesktopApp, setWindowControlsColor } from './services/desktopService'

// Eager load workspace layout (most common route)
import WorkspaceLayout from './components/layout/WorkspaceLayout'
import DevTemplateSelector from './pages/DevTemplateSelector'
import CanvasDeepLink from './components/canvas/CanvasDeepLink'

// Lazy load auth & setup pages (rarely revisited after login)
const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const LandingPage = lazy(() => import('./pages/LandingPage'))
const PricingPage = lazy(() => import('./pages/PricingPage'))
const CreateWorkspacePage = lazy(() => import('./pages/CreateWorkspacePage'))
const WorkspaceSelectorPage = lazy(() => import('./pages/WorkspaceSelectorPage'))
const WorkspaceSetupWizard = lazy(() => import('./components/workspace/WorkspaceSetupWizard'))
const AcceptInvitePage = lazy(() => import('./pages/AcceptInvitePage'))
const AccountDeletionPage = lazy(() => import('./pages/AccountDeletionPage'))

function PageFallback() {
  return (
    <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }} />
    </div>
  )
}

/**
 * Smart redirect component for authenticated users navigating to root '/' or catch-all '*'.
 * Automatically restores last active workspace if valid, or opens Workspace Selector.
 * Displays loading fallback during auth & workspace state restoration to avoid UI flicker.
 */
function AuthenticatedDefaultRedirect() {
  const { user } = useAuthStore()
  const { activeWorkspaceId, workspaces, isLoading, isWorkspacesLoaded, fetchWorkspaces } = useWorkspaceStore()

  // If we don't have a target ID, we must wait for workspaces to load to pick one.
  // We must trigger the fetch here if it hasn't started, to prevent a deadlock.
  useEffect(() => {
    // Only run if we actually need to fetch (user is logged in, no target ID cached)
    if (user) {
      const savedId = getSavedWorkspaceId(user._id)
      const targetId = activeWorkspaceId || savedId
      if (!targetId && !isWorkspacesLoaded && !isLoading) {
        fetchWorkspaces()
      }
    }
  }, [user, activeWorkspaceId, isWorkspacesLoaded, isLoading, fetchWorkspaces])

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const savedId = getSavedWorkspaceId(user._id)
  const targetId = activeWorkspaceId || savedId

  // If a target workspace ID is already cached locally, navigate to it immediately
  if (targetId) {
    return <Navigate to={`/workspace/${targetId}`} replace />
  }

  // Show splash loader while workspaces are being restored ONLY if no target workspace is cached yet
  if (isLoading || !isWorkspacesLoaded) {
    return <PageFallback />
  }

  if (workspaces.length === 1) {
    return <Navigate to={`/workspace/${workspaces[0]._id}`} replace />
  }

  return <Navigate to="/select-workspace" replace />
}

/**
 * Smart redirect for authenticated users landing on auth pages (login, register, etc.).
 * Checks for pending invite or explicit redirect param before falling back to default redirect.
 */
function SmartAuthRedirect() {
  const [searchParams] = useSearchParams()
  const redirectTo = searchParams.get('redirect')
  const pendingInvite = sessionStorage.getItem('pendingInviteToken')

  if (pendingInvite) {
    sessionStorage.removeItem('pendingInviteToken')
    return <Navigate to={`/invite/${pendingInvite}`} replace />
  }
  if (redirectTo) {
    return <Navigate to={redirectTo} replace />
  }
  return <AuthenticatedDefaultRedirect />
}

function useTitlebarContrast() {
  const location = useLocation()

  useEffect(() => {
    if (!isDesktopApp() || !window.electronAPI?.setTitleBarOverlay) return

    const updateContrast = () => {
      const sampleX = Math.max(10, window.innerWidth - 30)
      const sampleY = 15
      let el = document.elementFromPoint(sampleX, sampleY)
      let bg = 'transparent'

      while (el && el !== document.documentElement) {
        const style = window.getComputedStyle(el)
        const color = style.backgroundColor
        if (color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') {
          bg = color
          break
        }
        el = el.parentElement
      }

      if (bg === 'transparent') {
        const bodyStyle = window.getComputedStyle(document.body)
        bg = bodyStyle.backgroundColor || '#ffffff'
      }

      let r = 255, g = 255, b = 255
      const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
      if (match) {
        r = parseInt(match[1], 10)
        g = parseInt(match[2], 10)
        b = parseInt(match[3], 10)
      } else if (bg.startsWith('#')) {
        const hex = bg.replace('#', '')
        if (hex.length === 3) {
          r = parseInt(hex[0] + hex[0], 16)
          g = parseInt(hex[1] + hex[1], 16)
          b = parseInt(hex[2] + hex[2], 16)
        } else if (hex.length >= 6) {
          r = parseInt(hex.substring(0, 2), 16)
          g = parseInt(hex.substring(2, 4), 16)
          b = parseInt(hex.substring(4, 6), 16)
        }
      }

      const luminance = (r * 299 + g * 587 + b * 114) / 1000
      const symbolColor = luminance > 128 ? '#0f172a' : '#ffffff'

      setWindowControlsColor(symbolColor)
    }

    updateContrast()
    const timer1 = setTimeout(updateContrast, 50)
    const timer2 = setTimeout(updateContrast, 200)

    window.addEventListener('resize', updateContrast)
    window.addEventListener('themeChanged', updateContrast)

    const observer = new MutationObserver(updateContrast)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] })
    if (document.body) {
      observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] })
    }

    let unsubMax = null
    if (window.electronAPI?.onMaximizedChange) {
      unsubMax = window.electronAPI.onMaximizedChange(() => {
        setTimeout(updateContrast, 50)
      })
    }

    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
      window.removeEventListener('resize', updateContrast)
      window.removeEventListener('themeChanged', updateContrast)
      observer.disconnect()
      if (unsubMax) unsubMax()
    }
  }, [location.pathname])
}

function App() {
  const { user, isInitialized } = useAuthStore()
  const hydrateFromPreferences = useThemeStore((s) => s.hydrateFromPreferences)

  usePresenceTracker()
  useTitlebarContrast()

  useEffect(() => {
    const state = useAuthStore.getState()
    if (state.accessToken && !state.user && !state.isLoading) {
      state.fetchUser().catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (user?.chatPreferences) {
      hydrateFromPreferences(user.chatPreferences)
    }
  }, [hydrateFromPreferences, user?.chatPreferences])

  if (!isInitialized) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={!user ? <LandingPage /> : <AuthenticatedDefaultRedirect />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/login" element={!user ? <LoginPage /> : <AuthenticatedDefaultRedirect />} />
        <Route path="/register" element={!user ? <RegisterPage /> : <AuthenticatedDefaultRedirect />} />
        <Route path="/forgot-password" element={!user ? <ForgotPasswordPage /> : <SmartAuthRedirect />} />
        <Route path="/reset-password/:token" element={!user ? <ResetPasswordPage /> : <SmartAuthRedirect />} />
        <Route path="/delete-account" element={<AccountDeletionPage />} />

        {/* Invite acceptance — public (works for both logged-in and logged-out users) */}
        <Route path="/invite/:token" element={<AcceptInvitePage />} />

        {/* Workspace selection & creation (requires auth) */}
        <Route path="/select-workspace" element={user ? <WorkspaceSelectorPage /> : <Navigate to="/login" />} />
        <Route path="/create-workspace" element={user ? <CreateWorkspacePage /> : <Navigate to="/login" />} />

        {/* Workspace-scoped routes */}
        <Route path="/workspace/:workspaceId/setup" element={user ? <WorkspaceSetupWizard /> : <Navigate to="/login" />} />
        <Route path="/workspace/:workspaceId/*" element={user ? <WorkspaceLayout /> : <Navigate to="/login" />} />

        {/* Legacy /chat redirect */}
        <Route path="/chat/*" element={user ? <AuthenticatedDefaultRedirect /> : <Navigate to="/login" />} />

        {/* Canvas deep-link — loads canvas and redirects to workspace layout */}
        <Route path="/canvas/:canvasId" element={user ? <CanvasDeepLink /> : <Navigate to="/login" />} />

        {/* Catch-all */}
        {import.meta.env.DEV && (
          <Route path="/dev/template" element={<DevTemplateSelector />} />
        )}
        <Route path="*" element={!user ? <LandingPage /> : <AuthenticatedDefaultRedirect />} />
      </Routes>
    </Suspense>
  )
}

export default App
