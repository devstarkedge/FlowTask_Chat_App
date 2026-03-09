import { useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useAuthStore } from '../stores/authStore'
import { MessageSquare, Plus, ArrowRight, LogOut, Loader2 } from 'lucide-react'

export default function WorkspaceSelectorPage() {
  const navigate = useNavigate()
  const { workspaces, isLoading, error, fetchWorkspaces, switchWorkspace } = useWorkspaceStore()
  const { user, logout } = useAuthStore()

  useEffect(() => {
    fetchWorkspaces()
  }, [fetchWorkspaces])

  // If user has exactly 1 workspace, go directly
  useEffect(() => {
    if (!isLoading && workspaces.length === 1) {
      switchWorkspace(workspaces[0]._id)
      navigate(`/workspace/${workspaces[0]._id}`, { replace: true })
    }
  }, [isLoading, workspaces, navigate, switchWorkspace])

  const handleSelect = (ws) => {
    switchWorkspace(ws._id)
    navigate(`/workspace/${ws._id}`)
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  if (error) {
    return (
      <div style={{ background: '#0a0a0f', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <p style={{ color: '#ef4444', fontSize: 15 }}>{error}</p>
        <button
          onClick={fetchWorkspaces}
          style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#6366f1', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div style={{ background: '#0a0a0f', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={32} color="#6366f1" className="animate-spin" />
      </div>
    )
  }

  return (
    <div style={{ background: '#0a0a0f', color: '#e5e7eb', minHeight: '100vh' }}>
      {/* Nav */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(10, 10, 15, 0.8)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <MessageSquare size={18} color="white" />
              </div>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>FlowTask Chat</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, color: '#71717a' }}>
                {user?.email}
              </span>
              <button
                onClick={handleLogout}
                style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#a1a1aa', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <LogOut size={14} /> Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '80px 24px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: 'white', marginBottom: 8, textAlign: 'center' }}>
          {workspaces.length > 0 ? 'Choose a workspace' : 'Welcome to FlowTask Chat'}
        </h1>
        <p style={{ textAlign: 'center', color: '#a1a1aa', fontSize: 15, marginBottom: 40 }}>
          {workspaces.length > 0
            ? 'Select a workspace to continue, or create a new one.'
            : 'Create your first workspace to get started.'}
        </p>

        {/* Workspace List */}
        {workspaces.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {workspaces.map((ws) => (
              <button
                key={ws._id}
                onClick={() => handleSelect(ws)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12, cursor: 'pointer', textAlign: 'left', width: '100%',
                  transition: 'border-color 0.2s, background 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'
                  e.currentTarget.style.background = 'rgba(99,102,241,0.06)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 700, color: 'white', flexShrink: 0,
                }}>
                  {ws.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'white' }}>{ws.name}</div>
                  <div style={{ fontSize: 13, color: '#71717a', marginTop: 2 }}>
                    {ws.plan && <span style={{ textTransform: 'capitalize' }}>{ws.plan} plan</span>}
                    {ws.memberCount != null && <span> · {ws.memberCount} member{ws.memberCount !== 1 ? 's' : ''}</span>}
                  </div>
                </div>
                <ArrowRight size={18} color="#71717a" />
              </button>
            ))}
          </div>
        )}

        {/* Create Workspace */}
        <Link
          to="/create-workspace"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            width: '100%', padding: '14px 24px', borderRadius: 12, textDecoration: 'none',
            background: workspaces.length === 0
              ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
              : 'rgba(255,255,255,0.06)',
            border: workspaces.length === 0 ? 'none' : '1px solid rgba(255,255,255,0.1)',
            color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={18} />
          Create a new workspace
        </Link>
      </div>
    </div>
  )
}
