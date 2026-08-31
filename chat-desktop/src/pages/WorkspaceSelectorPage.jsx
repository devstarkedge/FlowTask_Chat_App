import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useAuthStore } from '../stores/authStore'
import { MessageSquare, Plus, ArrowRight, LogOut, LogIn, Sparkles, Crown, Users, Zap } from 'lucide-react';
import Loader from '../components/shared/Loader';
import JoinWorkspaceModal from '../components/workspace/JoinWorkspaceModal'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import './custom-css/workspaceSelectorPage.css'



/* ─────────────────────────────────────────────────────────────────────────
   FRAMER VARIANTS
───────────────────────────────────────────────────────────────────────── */
const stagger = {
  hidden:  {},
  visible: { transition: { staggerChildren: .08, delayChildren: .06 } },
}
const fadeUp = {
  hidden:  { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: .28, ease: [.22,1,.36,1] } },
}
const listItem = {
  hidden:  { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0,  transition: { duration: .24, ease: [.22,1,.36,1] } },
}

/* ─────────────────────────────────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────────────────────────────────── */
export default function WorkspaceSelectorPage() {
  const navigate = useNavigate()
  const { workspaces, isLoading, error, fetchWorkspaces, switchWorkspace } = useWorkspaceStore()
  const { user, logout } = useAuthStore()
  const [showJoinModal, setShowJoinModal]   = useState(false)
  const [isSigningOut, setIsSigningOut]     = useState(false)

  useEffect(() => { fetchWorkspaces() }, [fetchWorkspaces])

  /* auto-navigate when only one workspace */
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
      toast((t) => (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10
          }}
        >
          <span style={{ fontWeight: 500 }}>
            Are you sure you want to sign out?
          </span>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              className="btn-ghost"
              onClick={() => toast.dismiss(t.id)}
            >
              Cancel
            </button>

            <button
              className="btn-danger"
              onClick={async () => {
                toast.dismiss(t.id)

                setIsSigningOut(true)
                const loadingToast = toast.loading("Signing out...")

                try {
                  await logout()
                } catch (err) {
                  console.error("Logout API failed:", err)
                }

                try {
                  localStorage.clear()
                  sessionStorage.clear()

                  useWorkspaceStore.getState().reset?.()
                  useAuthStore.getState().reset?.()

                  toast.dismiss(loadingToast)
                  toast.success("Signed out successfully 👋")

                  onClose?.()
                  window.location.href = "/login"

                } catch (err) {
                  toast.dismiss(loadingToast)
                  toast.error("Something went wrong")
                } finally {
                  setIsSigningOut(false)
                }
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      ), {
        duration: 5000
      })
    }

  const handleJoined = (workspace) => {
    fetchWorkspaces()
    if (workspace?._id) {
      switchWorkspace(workspace._id)
      navigate(`/workspace/${workspace._id}`)
    }
  }

  /* ── error state ── */
  if (error) {
    return (
      <div className="wsp">
        
        <div className="wsp-center">
          <p className="wsp-err-text">{error}</p>
          <button className="wsp-retry-btn" onClick={fetchWorkspaces}>Retry</button>
        </div>
      </div>
    )
  }

  /* ── loading state ── */
  if (isLoading) {
    return (
      <div className="wsp">
        
        <div className="wsp-center">
          <div className="wsp-spin" style={{
            width:36, height:36, border:'3px solid #e4e4e7',
            borderTopColor:'#6366f1', borderRadius:'50%',
          }} />
          <p style={{ fontSize:14, color:'#a1a1aa', fontFamily:'Plus Jakarta Sans,system-ui,sans-serif' }}>
            Loading workspaces…
          </p>
        </div>
      </div>
    )
  }

  const hasWorkspaces = workspaces.length > 0

  /* ─────────────────────────────────────────────────────────────────── */
  return (
    <div className="wsp">
      

      {/* ── Mesh bg ── */}
      <div className="wsp-mesh">
        <div className="wsp-blob wsp-blob-1" />
        <div className="wsp-blob wsp-blob-2" />
        <div className="wsp-blob wsp-blob-3" />
      </div>

      <div className="wsp-page">

        {/* ════ NAV ════ */}
        <nav className="wsp-nav">
          <div className="wsp-nav-inner">
            <Link to="/" className="wsp-logo">
              <div className="wsp-logo-icon">
                <MessageSquare size={18} color="white" />
              </div>
              <span className="wsp-logo-name">FlowTask Chat</span>
            </Link>

            <div className="wsp-nav-right">
              {user?.email && (
                <span className="wsp-user-email">{user.email}</span>
              )}
              <button
                className="wsp-signout-btn"
                onClick={handleLogout}
                disabled={isSigningOut}
              >
                {isSigningOut
                  ? <div className="wsp-spin" style={{ width:13, height:13, border:'2px solid #e4e4e7', borderTopColor:'#6366f1', borderRadius:'50%' }} />
                  : <LogOut size={14} />
                }
                Sign out
              </button>
            </div>
          </div>
        </nav>

        {/* ════ CONTENT ════ */}
        <div className="wsp-content">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="visible"
            style={{ display:'flex', flexDirection:'column', alignItems:'center' }}
          >

            {/* Eyebrow */}
            <motion.div variants={fadeUp} className="wsp-eyebrow">
              <Sparkles size={11} />
              {hasWorkspaces ? `${workspaces.length} workspace${workspaces.length !== 1 ? 's' : ''}` : 'Getting started'}
            </motion.div>

            {/* Heading */}
            <motion.h1 variants={fadeUp} className="wsp-heading">
              {hasWorkspaces ? 'Choose a workspace' : 'Welcome to FlowTask Chat'}
            </motion.h1>
            <motion.p variants={fadeUp} className="wsp-subheading">
              {hasWorkspaces
                ? 'Select a workspace to continue, or create a new one.'
                : 'You\'re not part of any workspace yet. Create one or join with an invite code.'}
            </motion.p>

            {/* ── Workspace list ── */}
            {hasWorkspaces && (
              <motion.div
                variants={stagger}
                initial="hidden"
                animate="visible"
                style={{ width:'100%', marginBottom:8 }}
              >
                <div className="wsp-list">
                  {workspaces.map((ws, i) => (
                    <motion.button
                      key={ws._id}
                      className="wsp-item"
                      style={{ animationDelay:`${i * 60}ms` }}
                      variants={listItem}
                      onClick={() => handleSelect(ws)}
                    >
                      {/* Avatar */}
                      <div className="wsp-avatar">
                        {ws.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>

                      {/* Info */}
                      <div className="wsp-info">
                        <div className="wsp-name">{ws.name}</div>
                        <div className="wsp-meta">
                          {ws.role && (
                            <span className={`wsp-role-chip ${ws.role === 'owner' ? 'owner' : 'member'}`}>
                              {ws.role === 'owner' && <Crown size={9} style={{ display:'inline', marginRight:3 }} />}
                              {ws.role}
                            </span>
                          )}
                          {ws.plan && (
                            <>
                              {ws.role && <span className="wsp-meta-dot" />}
                              <span className="wsp-meta-text" style={{ textTransform:'capitalize' }}>{ws.plan} plan</span>
                            </>
                          )}
                          {ws.memberCount != null && (
                            <>
                              <span className="wsp-meta-dot" />
                              <span className="wsp-meta-text">
                                {ws.memberCount} member{ws.memberCount !== 1 ? 's' : ''}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Arrow */}
                      <ArrowRight size={17} className="wsp-arrow" />
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── Empty state ── */}
            {!hasWorkspaces && (
              <motion.div variants={fadeUp} className="wsp-empty" style={{ width:'100%' }}>
                <div className="wsp-empty-icon">
                  <MessageSquare size={24} color="#6366f1" />
                </div>
                <p className="wsp-empty-title">No workspaces yet</p>
                <p className="wsp-empty-desc">
                  Create your first workspace and invite your team, or join one using an invite code.
                </p>
              </motion.div>
            )}

            {/* ── Divider ── */}
            {hasWorkspaces && (
              <motion.div variants={fadeUp} className="wsp-divider" style={{ width:'100%' }}>
                or
              </motion.div>
            )}

            {/* ── Action buttons ── */}
            <motion.div variants={fadeUp} className="wsp-actions" style={{ width:'100%' }}>
              <Link
                to="/create-workspace"
                className={`wsp-btn-primary wsp-shimmer-btn`}
              >
                <Plus size={17} />
                Create Workspace
              </Link>

              <button
                className="wsp-btn-secondary"
                onClick={() => setShowJoinModal(true)}
              >
                <LogIn size={17} />
                Join Workspace
              </button>
            </motion.div>

          </motion.div>
        </div>
      </div>

      {/* ── Join modal ── */}
      {showJoinModal && (
        <JoinWorkspaceModal
          onClose={() => setShowJoinModal(false)}
          onJoined={handleJoined}
        />
      )}
    </div>
  )
}