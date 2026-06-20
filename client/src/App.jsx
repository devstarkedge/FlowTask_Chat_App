import { useEffect, Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { useThemeStore } from './stores/themeStore'
import { usePresenceTracker } from './hooks/usePresenceTracker'

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

function PageFallback() {
  return (
    <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }} />
    </div>
  )
}

function App() {
  const { user, isInitialized } = useAuthStore()
  const hydrateFromPreferences = useThemeStore((s) => s.hydrateFromPreferences)

  usePresenceTracker()

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
        <Route path="/" element={!user ? <LandingPage /> : <Navigate to="/select-workspace" />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/select-workspace" />} />
        <Route path="/register" element={!user ? <RegisterPage /> : <Navigate to="/select-workspace" />} />
        <Route path="/forgot-password" element={!user ? <ForgotPasswordPage /> : <Navigate to="/select-workspace" />} />
        <Route path="/reset-password/:token" element={!user ? <ResetPasswordPage /> : <Navigate to="/select-workspace" />} />

        {/* Invite acceptance — public (works for both logged-in and logged-out users) */}
        <Route path="/invite/:token" element={<AcceptInvitePage />} />

        {/* Workspace selection & creation (requires auth) */}
        <Route path="/select-workspace" element={user ? <WorkspaceSelectorPage /> : <Navigate to="/login" />} />
        <Route path="/create-workspace" element={user ? <CreateWorkspacePage /> : <Navigate to="/login" />} />

        {/* Workspace-scoped routes */}
        <Route path="/workspace/:workspaceId/setup" element={user ? <WorkspaceSetupWizard /> : <Navigate to="/login" />} />
        <Route path="/workspace/:workspaceId/*" element={user ? <WorkspaceLayout /> : <Navigate to="/login" />} />

        {/* Legacy /chat redirect → workspace selector */}
        <Route path="/chat/*" element={user ? <Navigate to="/select-workspace" /> : <Navigate to="/login" />} />

        {/* Canvas deep-link — loads canvas and redirects to workspace layout */}
        <Route path="/canvas/:canvasId" element={user ? <CanvasDeepLink /> : <Navigate to="/login" />} />

        {/* Catch-all */}
        {import.meta.env.DEV && (
          <Route path="/dev/template" element={<DevTemplateSelector />} />
        )}
        <Route path="*" element={<Navigate to={user ? '/select-workspace' : '/'} />} />
      </Routes>
    </Suspense>
  )
}

export default App
