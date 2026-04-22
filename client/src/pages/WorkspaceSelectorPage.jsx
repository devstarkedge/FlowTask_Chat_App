import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useAuthStore } from '../stores/authStore'
import {
  MessageSquare, Plus, ArrowRight, LogOut,
  Loader2, LogIn, Sparkles, Crown, Users, Zap,
} from 'lucide-react'
import JoinWorkspaceModal from '../components/workspace/JoinWorkspaceModal'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'

const STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');

  .wsp * { font-family:'Plus Jakarta Sans',system-ui,sans-serif; box-sizing:border-box; margin:0; padding:0; }

  /* ── keyframes ── */
  @keyframes wspBlob1 {
    0%,100%{transform:translate(0,0) scale(1)}
    33%    {transform:translate(30px,-20px) scale(1.08)}
    66%    {transform:translate(-20px,15px) scale(.94)}
  }
  @keyframes wspBlob2 {
    0%,100%{transform:translate(0,0) scale(1)}
    40%    {transform:translate(-35px,25px) scale(1.06)}
    75%    {transform:translate(20px,-30px) scale(.96)}
  }
  @keyframes wspBlob3 {
    0%,100%{transform:translate(0,0) scale(1)}
    50%    {transform:translate(18px,-14px) scale(1.1)}
  }
  @keyframes wspShimmer {
    from{transform:translateX(-140%) skewX(-15deg)}
    to  {transform:translateX(240%)  skewX(-15deg)}
  }
  @keyframes wspSpin   { to{transform:rotate(360deg)} }
  @keyframes wspSlide  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes wspPop    {
    0%  {transform:scale(.92);opacity:0}
    65% {transform:scale(1.02);opacity:1}
    100%{transform:scale(1);opacity:1}
  }

  .wsp-spin { animation:wspSpin .85s linear infinite; }

  .wsp-shimmer-btn::after {
    content:''; position:absolute; inset:0; pointer-events:none;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.28),transparent);
    transform:translateX(-140%) skewX(-15deg);
  }
  .wsp-shimmer-btn:hover:not(:disabled)::after { animation:wspShimmer .6s ease forwards; }

  /* ── page shell ── */
  .wsp-page {
    min-height:100vh; background:#f5f4f0;
    position:relative; overflow:hidden;
    display:flex; flex-direction:column;
  }

  /* ── mesh blobs ── */
  .wsp-mesh { position:fixed; inset:0; z-index:0; pointer-events:none; overflow:hidden; }
  .wsp-blob {
    position:absolute; border-radius:50%;
    filter:blur(90px); opacity:.13;
  }
  .wsp-blob-1 { width:650px; height:650px; background:#a5b4fc; top:-180px; left:-180px; animation:wspBlob1 16s ease-in-out infinite; }
  .wsp-blob-2 { width:540px; height:540px; background:#c4b5fd; bottom:-100px; right:-140px; animation:wspBlob2 20s ease-in-out infinite; }
  .wsp-blob-3 { width:380px; height:380px; background:#67e8f9; top:50%;    right:15%;    animation:wspBlob3 24s ease-in-out infinite; }

  /* ── nav ── */
  .wsp-nav {
    position:sticky; top:0; z-index:50;
    background:rgba(245,244,240,.82); backdrop-filter:blur(16px);
    border-bottom:1px solid rgba(0,0,0,.07);
  }
  .wsp-nav-inner {
    max-width:1180px; margin:0 auto; padding:0 28px;
    display:flex; align-items:center; justify-content:space-between; height:62px;
  }
  .wsp-logo {
    display:flex; align-items:center; gap:10px; text-decoration:none; transition:opacity .15s;
  }
  .wsp-logo:hover { opacity:.78; }
  .wsp-logo-icon {
    width:34px; height:34px; border-radius:10px;
    background:linear-gradient(135deg,#6366f1,#8b5cf6);
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 4px 14px rgba(99,102,241,.3);
  }
  .wsp-logo-name { font-size:17px; font-weight:800; color:#18181b; letter-spacing:-.02em; }

  .wsp-nav-right { display:flex; align-items:center; gap:10px; }
  .wsp-user-email {
    font-size:13px; color:#a1a1aa; font-weight:500;
    padding:5px 12px; border-radius:20px;
    background:rgba(0,0,0,.04); border:1px solid rgba(0,0,0,.06);
    max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
  .wsp-signout-btn {
    display:flex; align-items:center; gap:7px;
    padding:7px 14px; border-radius:10px; border:1.5px solid #e4e4e7;
    background:#ffffff; color:#71717a; font-size:13px; font-weight:600;
    cursor:pointer; transition:all .15s;
    font-family:'Plus Jakarta Sans',system-ui,sans-serif;
  }
  .wsp-signout-btn:hover {
    border-color:rgba(99,102,241,.35); color:#6366f1;
    background:#fafaff; box-shadow:0 2px 8px rgba(99,102,241,.1);
  }

  /* ── content wrapper ── */
  .wsp-content {
    flex:1; position:relative; z-index:1;
    max-width:560px; margin:0 auto; width:100%;
    padding:64px 24px 96px;
  }

  /* ── header ── */
  .wsp-eyebrow {
    display:inline-flex; align-items:center; gap:7px;
    padding:5px 13px; border-radius:20px; margin-bottom:18px;
    background:rgba(99,102,241,.09); border:1px solid rgba(99,102,241,.2);
    font-size:11.5px; font-weight:700; color:#6366f1; letter-spacing:.04em;
  }
  .wsp-heading {
    font-size:34px; font-weight:900; color:#18181b; line-height:1.1;
    letter-spacing:-.04em; margin-bottom:10px; text-align:center;
  }
  .wsp-subheading {
    font-size:14.5px; color:#71717a; line-height:1.65;
    text-align:center; margin-bottom:36px;
  }

  /* ── workspace list ── */
  .wsp-list { display:flex; flex-direction:column; gap:10px; margin-bottom:20px; }

  .wsp-item {
    display:flex; align-items:center; gap:14px;
    width:100%; text-align:left; padding:16px 18px;
    border-radius:16px; border:1.5px solid rgba(0,0,0,.07);
    background:#ffffff; cursor:pointer;
    box-shadow:0 2px 6px rgba(0,0,0,.04);
    transition:border-color .18s, background .18s, box-shadow .18s, transform .15s;
    font-family:'Plus Jakarta Sans',system-ui,sans-serif;
    animation:wspSlide .25s ease both;
  }
  .wsp-item:hover {
    border-color:rgba(99,102,241,.3);
    background:#fafaff;
    box-shadow:0 6px 20px rgba(99,102,241,.1), 0 2px 6px rgba(0,0,0,.04);
    transform:translateY(-1px);
  }

  /* workspace avatar */
  .wsp-avatar {
    width:46px; height:46px; border-radius:13px; flex-shrink:0;
    background:linear-gradient(135deg,#6366f1,#7c3aed);
    display:flex; align-items:center; justify-content:center;
    font-size:19px; font-weight:900; color:#fff;
    box-shadow:0 4px 12px rgba(99,102,241,.3);
    letter-spacing:-.02em;
  }

  /* workspace info */
  .wsp-info { flex:1; min-width:0; }
  .wsp-name {
    font-size:15px; font-weight:700; color:#18181b;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    margin-bottom:4px;
  }
  .wsp-meta { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }

  /* role chip */
  .wsp-role-chip {
    font-size:10px; font-weight:800; padding:2px 8px; border-radius:20px;
    letter-spacing:.04em; text-transform:capitalize;
  }
  .wsp-role-chip.owner { background:rgba(99,102,241,.1); color:#6366f1; border:1px solid rgba(99,102,241,.2); }
  .wsp-role-chip.member { background:rgba(0,0,0,.05); color:#71717a; border:1px solid rgba(0,0,0,.08); }

  .wsp-meta-dot { width:3px; height:3px; border-radius:50%; background:#d4d4d8; flex-shrink:0; }
  .wsp-meta-text { font-size:12px; color:#a1a1aa; font-weight:500; }

  /* arrow */
  .wsp-arrow {
    color:#d4d4d8; flex-shrink:0;
    transition:color .18s, transform .18s;
  }
  .wsp-item:hover .wsp-arrow { color:#6366f1; transform:translateX(3px); }

  /* ── divider ── */
  .wsp-divider {
    display:flex; align-items:center; gap:12px; margin:24px 0;
    font-size:12px; color:#d4d4d8;
  }
  .wsp-divider::before,.wsp-divider::after {
    content:''; flex:1; height:1px; background:rgba(0,0,0,.07);
  }

  /* ── action row ── */
  .wsp-actions { display:flex; gap:12px; }

  /* primary CTA */
  .wsp-btn-primary {
    flex:1; display:flex; align-items:center; justify-content:center; gap:8px;
    padding:14px 20px; border-radius:13px; border:none;
    font-size:14.5px; font-weight:700; color:#fff; cursor:pointer;
    background:linear-gradient(135deg,#6366f1,#4f46e5 50%,#7c3aed);
    box-shadow:0 4px 14px rgba(99,102,241,.35), 0 8px 28px rgba(99,102,241,.18);
    position:relative; overflow:hidden;
    font-family:'Plus Jakarta Sans',system-ui,sans-serif;
    transition:transform .14s, box-shadow .14s;
    text-decoration:none;
  }
  .wsp-btn-primary:hover {
    transform:translateY(-2px);
    box-shadow:0 8px 24px rgba(99,102,241,.45), 0 18px 44px rgba(99,102,241,.22);
  }
  .wsp-btn-primary:active { transform:translateY(0); }

  /* secondary CTA */
  .wsp-btn-secondary {
    flex:1; display:flex; align-items:center; justify-content:center; gap:8px;
    padding:14px 20px; border-radius:13px;
    border:1.5px solid #e4e4e7; background:#ffffff;
    font-size:14.5px; font-weight:700; color:#3f3f46; cursor:pointer;
    box-shadow:0 2px 6px rgba(0,0,0,.04);
    font-family:'Plus Jakarta Sans',system-ui,sans-serif;
    transition:border-color .15s, background .15s, color .15s, box-shadow .15s, transform .14s;
  }
  .wsp-btn-secondary:hover {
    border-color:rgba(99,102,241,.3); color:#6366f1;
    background:#fafaff; box-shadow:0 4px 16px rgba(99,102,241,.1);
    transform:translateY(-1px);
  }
  .wsp-btn-secondary:active { transform:translateY(0); }

  /* ── empty state card ── */
  .wsp-empty {
    background:#ffffff; border:1.5px dashed #e4e4e7;
    border-radius:20px; padding:40px 32px; text-align:center;
    margin-bottom:24px;
    box-shadow:0 2px 6px rgba(0,0,0,.04);
  }
  .wsp-empty-icon {
    width:56px; height:56px; border-radius:16px; margin:0 auto 16px;
    background:rgba(99,102,241,.08); border:1px solid rgba(99,102,241,.15);
    display:flex; align-items:center; justify-content:center;
  }
  .wsp-empty-title { font-size:17px; font-weight:800; color:#18181b; margin-bottom:8px; }
  .wsp-empty-desc  { font-size:13.5px; color:#71717a; line-height:1.65; }

  /* ── loading / error states ── */
  .wsp-center {
    min-height:100vh; background:#f5f4f0;
    display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:16px;
  }
  .wsp-err-text { font-size:14px; color:#dc2626; font-family:'Plus Jakarta Sans',system-ui,sans-serif; }
  .wsp-retry-btn {
    padding:10px 24px; border-radius:10px; border:none;
    background:linear-gradient(135deg,#6366f1,#4f46e5); color:#fff;
    font-size:14px; font-weight:700; cursor:pointer;
    font-family:'Plus Jakarta Sans',system-ui,sans-serif;
    box-shadow:0 4px 14px rgba(99,102,241,.3);
    transition:transform .14s;
  }
  .wsp-retry-btn:hover { transform:translateY(-1px); }

  @media(max-width:480px) {
    .wsp-heading  { font-size:26px; }
    .wsp-actions  { flex-direction:column; }
    .wsp-content  { padding:44px 18px 72px; }
    .wsp-user-email { display:none; }
  }
`

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
        <style>{STYLE}</style>
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
        <style>{STYLE}</style>
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
      <style>{STYLE}</style>

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