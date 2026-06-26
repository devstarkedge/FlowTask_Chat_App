import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { MessageSquare, ArrowRight, Check, Sparkles, Layers, Users, Zap, Shield } from 'lucide-react';
import Loader from '../components/shared/Loader';
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import './custom-css/createWorkspacePage.css'

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
   FRAMER VARIANTS 
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