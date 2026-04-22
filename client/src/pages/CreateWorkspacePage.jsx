import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useWorkspaceStore } from '../stores/workspaceStore'
import {
  MessageSquare, ArrowRight, Loader2,
  Check, Sparkles, Layers, Users, Zap, Shield,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'

const STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');

  .cwp * { font-family:'Plus Jakarta Sans',system-ui,sans-serif; box-sizing:border-box; margin:0; padding:0; }
  .cwp-mono { font-family:'JetBrains Mono',monospace !important; }

  /* ═══ KEYFRAMES ════════════════════════════════════════════════════ */
  @keyframes cwpBlob1 {
    0%,100% { transform:translate(0,0) scale(1) rotate(0deg); }
    25%     { transform:translate(40px,-30px) scale(1.1) rotate(3deg); }
    50%     { transform:translate(20px,40px) scale(.93) rotate(-2deg); }
    75%     { transform:translate(-30px,10px) scale(1.05) rotate(4deg); }
  }
  @keyframes cwpBlob2 {
    0%,100% { transform:translate(0,0) scale(1) rotate(0deg); }
    33%     { transform:translate(-50px,30px) scale(1.08) rotate(-4deg); }
    66%     { transform:translate(30px,-40px) scale(.95) rotate(3deg); }
  }
  @keyframes cwpBlob3 {
    0%,100% { transform:translate(0,0) scale(1); }
    50%     { transform:translate(25px,-20px) scale(1.12); }
  }

  @keyframes cwpIconFloat {
    0%,100% { transform:translateY(0) rotate(0deg) scale(1); }
    25%     { transform:translateY(-8px) rotate(-5deg) scale(1.04); }
    75%     { transform:translateY(-4px) rotate(4deg) scale(1.02); }
  }
  @keyframes cwpShimmer {
    from { transform:translateX(-140%) skewX(-15deg); }
    to   { transform:translateX(240%)  skewX(-15deg); }
  }
  @keyframes cwpPulse {
    0%,100% { box-shadow:0 0 0 0 rgba(99,102,241,.3); }
    50%     { box-shadow:0 0 0 8px rgba(99,102,241,.0); }
  }
  @keyframes cwpSuccessRing {
    0%   { transform:scale(0) rotate(-20deg); }
    65%  { transform:scale(1.15) rotate(4deg); }
    100% { transform:scale(1) rotate(0deg); }
  }
  @keyframes spin { to{transform:rotate(360deg)} }

  .cwp-icon-float  { animation:cwpIconFloat 4s ease-in-out infinite; }
  .cwp-spin        { animation:spin .9s linear infinite; }

  .cwp-shimmer-btn::after {
    content:''; position:absolute; inset:0; pointer-events:none;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.28),transparent);
    transform:translateX(-140%) skewX(-15deg);
  }
  .cwp-shimmer-btn:hover:not(:disabled)::after { animation:cwpShimmer .65s ease forwards; }

  /* ═══ PAGE SHELL ═══════════════════════════════════════════════════ */
  .cwp-page {
    min-height:100vh;
    background:#f5f4f0;
    position:relative; overflow:hidden;
    display:flex; flex-direction:column;
  }

  /* ── mesh bg (pastel blobs on light) ── */
  .cwp-mesh { position:fixed; inset:0; z-index:0; pointer-events:none; overflow:hidden; }
  .cwp-blob {
    position:absolute; border-radius:50%;
    filter:blur(90px); opacity:.13;
  }
  .cwp-blob-1 { width:700px; height:700px; background:#a5b4fc; top:-200px; left:-200px; animation:cwpBlob1 18s ease-in-out infinite; }
  .cwp-blob-2 { width:580px; height:580px; background:#c4b5fd; bottom:-120px; right:-160px; animation:cwpBlob2 22s ease-in-out infinite; }
  .cwp-blob-3 { width:420px; height:420px; background:#67e8f9; top:42%; right:18%; animation:cwpBlob3 26s ease-in-out infinite; }

  /* ═══ NAV ══════════════════════════════════════════════════════════ */
  .cwp-nav {
    position:sticky; top:0; z-index:50; flex-shrink:0;
    background:rgba(245,244,240,.82); backdrop-filter:blur(16px);
    border-bottom:1px solid rgba(0,0,0,.07);
  }
  .cwp-nav-inner {
    max-width:1180px; margin:0 auto; padding:0 28px;
    display:flex; align-items:center; justify-content:space-between; height:64px;
  }
  .cwp-logo {
    display:flex; align-items:center; gap:10px; text-decoration:none;
    transition:opacity .15s;
  }
  .cwp-logo:hover { opacity:.78; }
  .cwp-logo-icon {
    width:34px; height:34px; border-radius:10px; flex-shrink:0;
    background:linear-gradient(135deg,#6366f1,#8b5cf6);
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 4px 14px rgba(99,102,241,.3);
  }
  .cwp-logo-name { font-size:17px; font-weight:800; color:#18181b; letter-spacing:-.02em; }

  /* steps pill row */
  .cwp-steps { display:flex; align-items:center; gap:6px; }
  .cwp-step-item {
    display:flex; align-items:center; gap:5px;
    font-size:11.5px; font-weight:700; padding:4px 12px; border-radius:20px;
    letter-spacing:.02em;
  }
  .cwp-step-item.active {
    background:rgba(99,102,241,.1); border:1px solid rgba(99,102,241,.25); color:#6366f1;
  }
  .cwp-step-item.idle {
    background:rgba(0,0,0,.03); border:1px solid rgba(0,0,0,.07); color:#a1a1aa;
  }
  .cwp-step-dot { width:5px; height:5px; border-radius:50%; }

  /* ═══ LAYOUT ════════════════════════════════════════════════════════ */
  .cwp-layout {
    flex:1; position:relative; z-index:1;
    display:grid; grid-template-columns:1fr 1fr;
    max-width:1060px; margin:0 auto; width:100%;
    padding:64px 28px 96px; gap:68px; align-items:start;
  }
  @media(max-width:860px) {
    .cwp-layout { grid-template-columns:1fr; gap:44px; padding:44px 20px 72px; }
    .cwp-right   { display:none; }
  }

  /* ═══ LEFT — FORM COLUMN ════════════════════════════════════════════ */
  .cwp-left { max-width:460px; }

  /* eyebrow */
  .cwp-eyebrow {
    display:inline-flex; align-items:center; gap:7px;
    padding:5px 13px; border-radius:20px; margin-bottom:20px;
    background:rgba(99,102,241,.09); border:1px solid rgba(99,102,241,.2);
    font-size:11.5px; font-weight:700; color:#6366f1; letter-spacing:.05em;
  }

  /* headings — dark on light */
  .cwp-title {
    font-size:42px; font-weight:900; color:#18181b; line-height:1.07;
    letter-spacing:-.05em; margin-bottom:14px;
  }
  .cwp-title-grad {
    background:linear-gradient(135deg,#6366f1,#818cf8,#7c3aed);
    -webkit-background-clip:text; background-clip:text;
    -webkit-text-fill-color:transparent;
  }
  .cwp-subtitle { font-size:15px; color:#71717a; line-height:1.75; margin-bottom:32px; }

  /* ── card (white) ── */
  .cwp-card {
    background:#ffffff;
    border:1px solid rgba(0,0,0,.07);
    border-radius:22px; padding:32px;
    position:relative; overflow:hidden;
    box-shadow:
      0 4px 6px rgba(0,0,0,.04),
      0 16px 40px rgba(0,0,0,.07),
      0 1px 0 rgba(255,255,255,.9) inset;
  }
  /* top shimmer line */
  .cwp-card::before {
    content:''; position:absolute; top:0; left:20%; right:20%; height:2px;
    background:linear-gradient(90deg,transparent,rgba(99,102,241,.5),rgba(139,92,246,.5),transparent);
  }

  /* ── plan badge ── */
  .cwp-plan-badge {
    display:flex; align-items:center; justify-content:space-between;
    padding:12px 16px; border-radius:13px; margin-bottom:26px;
    background:rgba(99,102,241,.06); border:1px solid rgba(99,102,241,.18);
  }
  .cwp-plan-left { display:flex; align-items:center; gap:8px; color:#71717a; font-size:13.5px; }
  .cwp-plan-name { color:#18181b; font-weight:800; text-transform:capitalize; }
  .cwp-plan-chip {
    font-size:10.5px; font-weight:800; padding:3px 10px; border-radius:20px;
    background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff; letter-spacing:.05em;
  }

  /* ── field ── */
  .cwp-field { margin-bottom:22px; }
  .cwp-field-label {
    font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.1em;
    color:#a1a1aa; margin-bottom:9px;
    display:flex; align-items:center; gap:7px;
  }
  .cwp-field-label::after { content:''; flex:1; height:1px; background:rgba(0,0,0,.06); }

  /* inputs — light */
  .cwp-input {
    width:100%; padding:13px 16px;
    border-radius:13px; font-size:14.5px; font-weight:500;
    background:#f9f9fb; border:1.5px solid #e4e4e7;
    color:#18181b; outline:none; caret-color:#6366f1;
    font-family:'Plus Jakarta Sans',system-ui,sans-serif;
    box-shadow:inset 0 1px 2px rgba(0,0,0,.04);
    transition:border-color .18s, box-shadow .18s, background .18s, transform .12s;
  }
  .cwp-input::placeholder { color:#d4d4d8; font-weight:400; }
  .cwp-input:focus {
    border-color:rgba(99,102,241,.6);
    background:#fafaff;
    box-shadow:0 0 0 4px rgba(99,102,241,.1), inset 0 1px 2px rgba(0,0,0,.03);
    transform:translateY(-1px);
  }

  /* ── slug row ── */
  .cwp-slug-row { display:flex; align-items:center; justify-content:space-between; margin-top:9px; gap:8px; }
  .cwp-slug-pill {
    display:inline-flex; align-items:center; gap:6px;
    padding:4px 13px; border-radius:20px; font-size:12px; font-weight:600;
    font-family:'JetBrains Mono',monospace;
    transition:all .2s;
  }
  .cwp-slug-pill.has   { background:rgba(99,102,241,.09); border:1px solid rgba(99,102,241,.25); color:#6366f1; animation:cwpPulse 2.8s ease infinite; }
  .cwp-slug-pill.empty { background:rgba(0,0,0,.03); border:1px solid rgba(0,0,0,.07); color:#a1a1aa; }
  .cwp-char-count { font-size:11px; color:#a1a1aa; font-family:'JetBrains Mono',monospace; white-space:nowrap; }

  /* ── submit ── */
  .cwp-submit {
    width:100%; padding:15px 24px; border-radius:14px; border:none;
    font-size:15.5px; font-weight:800; cursor:pointer; letter-spacing:-.01em;
    display:flex; align-items:center; justify-content:center; gap:10px;
    color:#fff; position:relative; overflow:hidden;
    background:linear-gradient(135deg,#6366f1 0%,#4f46e5 45%,#7c3aed 100%);
    box-shadow:0 4px 14px rgba(99,102,241,.35), 0 10px 32px rgba(99,102,241,.18);
    font-family:'Plus Jakarta Sans',system-ui,sans-serif;
    transition:transform .15s, box-shadow .15s;
  }
  .cwp-submit:hover:not(:disabled) {
    transform:translateY(-2px);
    box-shadow:0 8px 28px rgba(99,102,241,.48), 0 20px 48px rgba(99,102,241,.24);
  }
  .cwp-submit:active:not(:disabled) { transform:translateY(0); }
  .cwp-submit:disabled { opacity:.38; cursor:not-allowed; }

  /* ═══ RIGHT COLUMN ══════════════════════════════════════════════════ */
  .cwp-right { padding-top:4px; }

  /* live preview card */
  .cwp-preview {
    background:#ffffff; border:1px solid rgba(0,0,0,.07);
    border-radius:18px; padding:24px; margin-bottom:18px;
    position:relative; overflow:hidden;
    box-shadow:0 2px 6px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.05);
  }
  .cwp-preview::before {
    content:''; position:absolute; top:0; left:0; right:0; height:2px;
    background:linear-gradient(90deg,transparent,rgba(99,102,241,.4),rgba(139,92,246,.4),transparent);
  }

  .cwp-preview-label {
    font-size:9.5px; font-weight:800; text-transform:uppercase; letter-spacing:.12em;
    color:#a1a1aa; margin-bottom:18px;
    display:flex; align-items:center; gap:6px;
  }
  .cwp-preview-label::after { content:''; flex:1; height:1px; background:rgba(0,0,0,.06); }

  .cwp-ws-avatar {
    width:52px; height:52px; border-radius:15px; margin-bottom:14px;
    background:linear-gradient(135deg,#6366f1,#7c3aed);
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 8px 24px rgba(99,102,241,.35);
  }

  /* preview text — dark on white */
  .cwp-preview-name {
    font-size:20px; font-weight:800; color:#18181b; letter-spacing:-.02em;
    margin-bottom:6px; min-height:28px; line-height:1.2;
  }
  .cwp-preview-desc {
    font-size:13px; color:#71717a; line-height:1.65; min-height:40px;
  }
  .cwp-preview-footer {
    display:flex; align-items:center; gap:16px; margin-top:18px; padding-top:16px;
    border-top:1px solid rgba(0,0,0,.06);
    font-size:12px; color:#a1a1aa;
  }
  .cwp-online-dot {
    width:7px; height:7px; border-radius:50%; background:#22c55e; flex-shrink:0;
    box-shadow:0 0 8px rgba(34,197,94,.5);
  }

  /* feature list */
  .cwp-features { display:flex; flex-direction:column; gap:10px; }
  .cwp-feat {
    display:flex; align-items:center; gap:13px;
    padding:12px 15px; border-radius:13px;
    background:#ffffff; border:1px solid rgba(0,0,0,.07);
    box-shadow:0 2px 6px rgba(0,0,0,.04);
    transition:border-color .15s, background .15s, box-shadow .15s, transform .15s;
  }
  .cwp-feat:hover {
    background:#fafaff; border-color:rgba(99,102,241,.22);
    box-shadow:0 4px 16px rgba(99,102,241,.1); transform:translateY(-1px);
  }
  .cwp-feat-icon { width:33px; height:33px; border-radius:9px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
  .cwp-feat-title { font-size:13px; font-weight:700; color:#27272a; }
  .cwp-feat-desc  { font-size:11.5px; color:#71717a; margin-top:1px; }

  /* ═══ SUCCESS OVERLAY ════════════════════════════════════════════════ */
  .cwp-success-overlay {
    position:absolute; inset:0; z-index:20; border-radius:22px;
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px;
    background:rgba(255,255,255,.96);
    backdrop-filter:blur(6px); text-align:center; padding:32px;
  }
  .cwp-success-ring {
    width:76px; height:76px; border-radius:50%;
    background:linear-gradient(135deg,#6366f1,#7c3aed);
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 12px 36px rgba(99,102,241,.4);
    animation:cwpSuccessRing .45s cubic-bezier(.22,1,.36,1) both;
  }

  @media(max-width:480px) {
    .cwp-title { font-size:30px; }
    .cwp-card  { padding:22px; }
  }
`

/* ─────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────── */
const FEATURES = [
  { icon:Layers,  color:'#6366f1', bg:'rgba(99,102,241,.1)',  title:'Channels & Threads',  desc:'Organised, searchable conversations'  },
  { icon:Users,   color:'#059669', bg:'rgba(5,150,105,.1)',   title:'Unlimited members',    desc:'Invite your whole team, no limits'    },
  { icon:Zap,     color:'#d97706', bg:'rgba(217,119,6,.1)',   title:'Real-time messaging',  desc:'Instant delivery with live presence'  },
  { icon:Shield,  color:'#7c3aed', bg:'rgba(124,58,237,.1)',  title:'Secure by default',    desc:'End-to-end encrypted and private'     },
]

/* ─────────────────────────────────────────────────────────────────────────
   FRAMER VARIANTS  (unchanged)
───────────────────────────────────────────────────────────────────────── */
const pageStagger = {
  hidden:  {},
  visible: { transition: { staggerChildren: .1, delayChildren: .1 } },
}
const fadeUp = {
  hidden:  { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0,  transition: { duration: .32, ease: [.22,1,.36,1] } },
}
const fadeRight = {
  hidden:  { opacity: 0, x: 18 },
  visible: { opacity: 1, x: 0,  transition: { duration: .32, ease: [.22,1,.36,1] } },
}
const rightStagger = {
  hidden:  {},
  visible: { transition: { staggerChildren: .08, delayChildren: .25 } },
}
const slugVariants = {
  initial: { opacity: 0, x: -10, scale: .88 },
  animate: { opacity: 1, x: 0,   scale: 1,   transition: { duration: .24, ease: [.22,1,.36,1] } },
  exit:    { opacity: 0, x: 10,  scale: .88, transition: { duration: .14 } },
}
const previewText = {
  initial: { opacity: 0, y: 6  },
  animate: { opacity: 1, y: 0, transition: { duration: .2, ease: [.22,1,.36,1] } },
  exit:    { opacity: 0, y: -6, transition: { duration: .14 } },
}
const successVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: .25 } },
}
const ringVariants = {
  hidden:  { scale: 0, rotate: -25 },
  visible: { scale: 1, rotate: 0, transition: { delay: .06, duration: .4, ease: [.22,1,.36,1] } },
}
const successText = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0,  transition: { delay: .22, duration: .3 } },
}

/* ─────────────────────────────────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────────────────────────────────── */
export default function CreateWorkspacePage() {
  const navigate        = useNavigate()
  const [searchParams]  = useSearchParams()
  const selectedPlan    = searchParams.get('plan') || 'free'
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace)

  const [name,         setName]         = useState('')
  const [description,  setDescription]  = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [done,         setDone]         = useState(false)

  const slug = name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { toast.error('Workspace name is required'); return }
    setIsSubmitting(true)
    try {
      const workspace = await createWorkspace({
        name:        name.trim(),
        description: description.trim(),
        plan:        selectedPlan,
      })
      toast.success(`Workspace "${workspace.name}" created!`)
      setDone(true)
      setTimeout(() => navigate(`/workspace/${workspace._id}`), 800)
    } catch {
      /* error handled in store */
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="cwp">
      <style>{STYLE}</style>

      {/* ── Mesh bg ── */}
      <div className="cwp-mesh">
        <div className="cwp-blob cwp-blob-1" />
        <div className="cwp-blob cwp-blob-2" />
        <div className="cwp-blob cwp-blob-3" />
      </div>

      <div className="cwp-page">

        {/* ════ NAV ════ */}
        <nav className="cwp-nav">
          <div className="cwp-nav-inner">
            <Link to="/" className="cwp-logo">
              <div className="cwp-logo-icon">
                <MessageSquare size={18} color="white" />
              </div>
              <span className="cwp-logo-name">FlowTask Chat</span>
            </Link>

            <div className="cwp-steps">
              <span className="cwp-step-item active">
                <span className="cwp-step-dot" style={{ background:'#6366f1' }} />
                Create
              </span>
              <span style={{ color:'#d4d4d8', fontSize:12 }}>›</span>
              <span className="cwp-step-item idle">Invite</span>
              <span style={{ color:'#d4d4d8', fontSize:12 }}>›</span>
              <span className="cwp-step-item idle">Configure</span>
            </div>
          </div>
        </nav>

        {/* ════ LAYOUT ════ */}
        <div className="cwp-layout">

          {/* ═══ LEFT — FORM ═══ */}
          <motion.div
            className="cwp-left"
            variants={pageStagger}
            initial="hidden"
            animate="visible"
          >
            <motion.div variants={fadeUp} className="cwp-eyebrow">
              <Sparkles size={11} />
              Step 1 of 3
            </motion.div>

            <motion.h1 variants={fadeUp} className="cwp-title">
              Create your<br />
              <span className="cwp-title-grad">workspace</span>
            </motion.h1>

            <motion.p variants={fadeUp} className="cwp-subtitle">
              A workspace is where your team communicates and collaborates.
              Invite members and configure everything after creation.
            </motion.p>

            {/* ── Card ── */}
            <motion.div variants={fadeUp} className="cwp-card">

              {/* Success overlay */}
              <AnimatePresence>
                {done && (
                  <motion.div
                    className="cwp-success-overlay"
                    variants={successVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    <motion.div className="cwp-success-ring" variants={ringVariants} initial="hidden" animate="visible">
                      <Check size={32} color="#fff" strokeWidth={3} />
                    </motion.div>
                    <motion.div variants={successText} initial="hidden" animate="visible">
                      <p style={{ fontSize:20, fontWeight:800, color:'#18181b', letterSpacing:'-.02em', marginBottom:6 }}>
                        Workspace created!
                      </p>
                      <p style={{ fontSize:13.5, color:'#71717a' }}>
                        Redirecting you now…
                      </p>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Plan badge */}
              {selectedPlan !== 'free' && (
                <motion.div
                  className="cwp-plan-badge"
                  initial={{ opacity:0, y:-8 }}
                  animate={{ opacity:1, y:0 }}
                  transition={{ duration:.28 }}
                >
                  <div className="cwp-plan-left">
                    <Sparkles size={14} color="#6366f1" />
                    Selected plan:
                    <strong className="cwp-plan-name">{selectedPlan}</strong>
                  </div>
                  <span className="cwp-plan-chip">{selectedPlan.toUpperCase()}</span>
                </motion.div>
              )}

              <form onSubmit={handleSubmit}>

                {/* ── Workspace Name ── */}
                <div className="cwp-field">
                  <label htmlFor="workspace-name" className="cwp-field-label">
                    Workspace Name
                    <span style={{ color:'#ef4444', letterSpacing:0, fontWeight:900 }}>*</span>
                  </label>
                  <input
                    id="workspace-name"
                    className="cwp-input"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    maxLength={50}
                    autoFocus
                  />

                  <div className="cwp-slug-row">
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={slug || '__empty__'}
                        className={`cwp-slug-pill cwp-mono ${slug ? 'has' : 'empty'}`}
                        variants={slugVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                      >
                        {slug
                          ? <><motion.span initial={{scale:0}} animate={{scale:1}} transition={{duration:.25,ease:[.22,1,.36,1]}}>
                              <Check size={10} strokeWidth={3} />
                            </motion.span>…/{slug}</>
                          : 'auto-generated'
                        }
                      </motion.span>
                    </AnimatePresence>
                    <span className="cwp-char-count cwp-mono">{name.length} / 50</span>
                  </div>
                </div>

                {/* ── Description ── */}
                <div className="cwp-field">
                  <label htmlFor="workspace-description" className="cwp-field-label">
                    Description
                    <span style={{ fontSize:9, color:'#a1a1aa', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginLeft:4 }}>
                      optional
                    </span>
                  </label>
                  <textarea
                    id="workspace-description"
                    className="cwp-input"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What's this workspace for?"
                    maxLength={200}
                    rows={3}
                    style={{ resize:'vertical', lineHeight:1.7, marginBottom:description.length > 0 ? 6 : 0 }}
                  />
                  <AnimatePresence>
                    {description.length > 0 && (
                      <motion.div
                        initial={{ opacity:0, height:0 }}
                        animate={{ opacity:1, height:'auto' }}
                        exit={{ opacity:0, height:0 }}
                        style={{ textAlign:'right' }}
                      >
                        <span className="cwp-char-count cwp-mono">{description.length} / 200</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* ── Submit ── */}
                <motion.button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="cwp-submit cwp-shimmer-btn"
                  whileHover={isSubmitting || !name.trim() ? {} : {
                    y: -2,
                    boxShadow: '0 10px 32px rgba(99,102,241,.5), 0 22px 52px rgba(99,102,241,.25)',
                  }}
                  whileTap={isSubmitting || !name.trim() ? {} : { y: 0, scale: .98 }}
                >
                  {isSubmitting
                    ? <><div className="cwp-spin" style={{ width:18, height:18, border:'2.5px solid rgba(255,255,255,.35)', borderTopColor:'rgba(255,255,255,.9)', borderRadius:'50%' }} />Creating…</>
                    : <><ArrowRight size={18} />Create Workspace</>
                  }
                </motion.button>

              </form>
            </motion.div>
          </motion.div>

          {/* ═══ RIGHT — ASIDE ═══ */}
          <motion.div
            className="cwp-right"
            variants={rightStagger}
            initial="hidden"
            animate="visible"
          >
            {/* Live preview card */}
            <motion.div variants={fadeRight} className="cwp-preview">
              <p className="cwp-preview-label">Live Preview</p>

              <div className="cwp-ws-avatar cwp-icon-float">
                <MessageSquare size={24} color="#fff" />
              </div>

              <AnimatePresence mode="wait">
                <motion.p
                  key={name || '__name__'}
                  className="cwp-preview-name"
                  variants={previewText}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  {name || <span style={{ color:'#d4d4d8', fontStyle:'italic', fontWeight:500, fontSize:15 }}>Your workspace name</span>}
                </motion.p>
              </AnimatePresence>

              <AnimatePresence mode="wait">
                <motion.p
                  key={description || '__desc__'}
                  className="cwp-preview-desc"
                  variants={previewText}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  {description || <span style={{ color:'#d4d4d8', fontStyle:'italic' }}>Description will appear here</span>}
                </motion.p>
              </AnimatePresence>

              <div className="cwp-preview-footer">
                <div className="cwp-online-dot" />
                <span>1 member · {selectedPlan} plan</span>
                {slug && <span className="cwp-mono" style={{ color:'#a1a1aa', marginLeft:'auto', fontSize:11 }}>/{slug}</span>}
              </div>
            </motion.div>

            {/* Features */}
            <motion.div variants={fadeRight} className="cwp-features">
              {FEATURES.map(({ icon: Icon, color, bg, title, desc }) => (
                <div key={title} className="cwp-feat">
                  <div className="cwp-feat-icon" style={{ background:bg }}>
                    <Icon size={15} color={color} />
                  </div>
                  <div>
                    <p className="cwp-feat-title">{title}</p>
                    <p className="cwp-feat-desc">{desc}</p>
                  </div>
                </div>
              ))}
            </motion.div>
          </motion.div>

        </div>
      </div>
    </div>
  )
}