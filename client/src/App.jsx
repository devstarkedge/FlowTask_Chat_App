import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import ChatLayout from './components/layout/ChatLayout'
import LoginPage from './pages/LoginPage'

function App() {
  const { token, user, syncUser, isLoading } = useAuthStore()

  useEffect(() => {
    if (token && !user) {
      syncUser()
    }
  }, [token, user, syncUser])

  if (isLoading) {
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
      <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/chat" />} />
      <Route path="/chat/*" element={user ? <ChatLayout /> : <Navigate to="/login" />} />
      <Route path="*" element={<Navigate to={user ? '/chat' : '/login'} />} />
    </Routes>
  )
}

export default App
