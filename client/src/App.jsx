import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import ChatLayout from './components/layout/ChatLayout'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import LandingPage from './pages/LandingPage'
import WorkspaceSetupWizard from './components/workspace/WorkspaceSetupWizard'

function App() {
  const { accessToken, user, fetchUser, isLoading } = useAuthStore()

  useEffect(() => {
    if (accessToken && !user) {
      fetchUser()
    }
  }, [accessToken, user, fetchUser])

  if (isLoading && accessToken) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Connecting to FlowTask Chat...</p>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={!user ? <LandingPage /> : <Navigate to="/chat" />} />
      <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/chat" />} />
      <Route path="/register" element={!user ? <RegisterPage /> : <Navigate to="/chat" />} />
      <Route path="/forgot-password" element={!user ? <ForgotPasswordPage /> : <Navigate to="/chat" />} />
      <Route path="/reset-password/:token" element={!user ? <ResetPasswordPage /> : <Navigate to="/chat" />} />

      {/* Protected routes */}
      <Route path="/workspace/setup/:workspaceId" element={user ? <WorkspaceSetupWizard /> : <Navigate to="/login" />} />
      <Route path="/chat/*" element={user ? <ChatLayout /> : <Navigate to="/login" />} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to={user ? '/chat' : '/'} />} />
    </Routes>
  )
}

export default App
