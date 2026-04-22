import { useState, useRef, useEffect } from 'react'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { X, Loader2, Plus, Check, Sparkles, Layers, ArrowRight } from 'lucide-react'
import useRipple from '../../hooks/useRipple'
import { motion, AnimatePresence } from 'framer-motion'
import './custom-css/createWorkspaceModal.css'

/* ─────────────────────────────────────────────────────────────────────────
   ORBS CONFIG
───────────────────────────────────────────────────────────────────────── */
const ORBS = [
  { left:'7%',  top:'58%', size:7,  dur:'2.6s', delay:'0s',   op:.32 },
  { left:'25%', top:'20%', size:5,  dur:'3.3s', delay:'.7s',  op:.22 },
  { left:'54%', top:'68%', size:6,  dur:'2.9s', delay:'1.3s', op:.28 },
  { left:'74%', top:'16%', size:4,  dur:'3.7s', delay:'.4s',  op:.22 },
  { left:'90%', top:'60%', size:5,  dur:'3.1s', delay:'1.0s', op:.28 },
]

/* ─────────────────────────────────────────────────────────────────────────
   FRAMER VARIANTS
───────────────────────────────────────────────────────────────────────── */
const overlayV = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: .18 } },
  exit:    { opacity: 0, transition: { duration: .16 } },
}

const shellV = {
  hidden:  { opacity: 0, scale: .94, y: 20, filter: 'blur(4px)' },
  visible: { opacity: 1, scale: 1,   y: 0,  filter: 'blur(0px)',
             transition: { duration: .32, ease: [.22, 1, .36, 1] } },
  exit:    { opacity: 0, scale: .96, y: 12, filter: 'blur(2px)',
             transition: { duration: .2,  ease: 'easeIn' } },
}

const bodyV = {
  hidden:  {},
  visible: { transition: { staggerChildren: .07, delayChildren: .1 } },
}

const itemV = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0,  transition: { duration: .24, ease: [.22, 1, .36, 1] } },
}

const slugV = {
  initial: { opacity: 0, x: -8, scale: .9 },
  animate: { opacity: 1, x: 0,  scale: 1,  transition: { duration: .22, ease: [.22, 1, .36, 1] } },
  exit:    { opacity: 0, x: 8,  scale: .9, transition: { duration: .15 } },
}

const successV = {
  hidden:  { opacity: 0, scale: .9 },
  visible: { opacity: 1, scale: 1, transition: { duration: .3, ease: [.22, 1, .36, 1] } },
}

/* ─────────────────────────────────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────────────────────────────────── */
export default function CreateWorkspaceModal({ onClose, onCreated }) {
  const { createWorkspace, isLoading } = useWorkspaceStore()

  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [submitted,   setSubmitted]   = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const inputRef               = useRef(null)
  const [submitRef, triggerRipple] = useRipple()

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim() || isLoading) return
    setSubmitted(true)
    try {
      const workspace = await createWorkspace({
        name:        name.trim(),
        description: description.trim() || undefined,
      })
      setShowSuccess(true)
      setTimeout(() => { onCreated?.(workspace); onClose() }, 900)
    } catch {
      setSubmitted(false)
    }
  }

  const slug = name.trim()
    ? name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    : ''

  return (
    <div className="cw">

      <AnimatePresence>
        {/* ── Backdrop ── */}
        <motion.div
          key="cw-overlay"
          variants={overlayV}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={{
            position:'fixed', inset:0, zIndex:50,
            display:'flex', alignItems:'center', justifyContent:'center', padding:16,
            background:'var(--bg-overlay, rgba(0,0,0,0.5))', backdropFilter:'blur(10px)',
          }}
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          {/* ── Shell ── */}
          <motion.div
            key="cw-shell"
            variants={shellV}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cw-title"
            className="cw-shell"
            style={{ position:'relative' }}
          >

            {/* ── Success overlay ── */}
            <AnimatePresence>
              {showSuccess && (
                <motion.div
                  key="cw-success"
                  variants={successV}
                  initial="hidden"
                  animate="visible"
                  className="cw-success-overlay"
                >
                  <motion.div
                    className="cw-success-ring"
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: .05, duration: .4, ease: [.22, 1, .36, 1] }}
                  >
                    <Check size={30} color="#fff" strokeWidth={3} />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: .18 }}
                    style={{ textAlign:'center' }}
                  >
                    <p style={{ fontSize:18, fontWeight:800, color:'var(--text-primary)', letterSpacing:'-.03em' }}>
                      Workspace created!
                    </p>
                    <p style={{ fontSize:13, color:'var(--accent-primary)', marginTop:4, fontWeight:500 }}>
                      Setting everything up…
                    </p>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ══ HEADER ══ */}
            <div className="cw-header">
              {/* Orbs */}
              {ORBS.map((o, i) => (
                <div
                  key={i}
                  className="cw-orb"
                  style={{
                    left:o.left, top:o.top,
                    width:o.size, height:o.size,
                    background:`rgba(99,102,241,${o.op})`,
                    '--dur':o.dur, '--delay':o.delay,
                  }}
                />
              ))}

              {/* Left */}
              <div style={{ display:'flex', alignItems:'flex-start', gap:16, position:'relative', zIndex:1, flex:1, minWidth:0 }}>
                <div className="cw-header-icon cw-icon-float">
                  <Sparkles size={24} color="#fff" />
                </div>
                <div className="cw-header-text">
                  <p id="cw-title" className="cw-header-title">Create Workspace</p>
                  <p className="cw-header-sub">Set up a new collaborative space</p>
                  <div className="cw-header-badge">
                    <Layers size={10} />
                    Channels · Members · Files
                  </div>
                </div>
              </div>

              {/* Close */}
              <button
                className="cw-close-btn"
                onClick={onClose}
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </div>

            {/* ══ FORM ══ */}
            <form onSubmit={handleSubmit}>
              <motion.div
                className="cw-body"
                variants={bodyV}
                initial="hidden"
                animate="visible"
              >

                {/* ── Workspace Name ── */}
                <motion.div variants={itemV} className="cw-field-group">
                  <p className="cw-field-label">Workspace Name</p>
                  <input
                    ref={inputRef}
                    className="cw-input"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      let v = e.target.value.replace(/^\s+/, '').replace(/\s{2,}/g, ' ')
                      setName(v)
                    }}
                    onKeyDown={(e) => { if (e.key === ' ' && name.endsWith(' ')) e.preventDefault() }}
                    onBlur={() => setName((p) => p.trim())}
                    maxLength={80}
                    placeholder="e.g. Engineering, Design, Marketing…"
                  />

                  {/* Slug row */}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={slug || '__empty__'}
                        variants={slugV}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className={`cw-slug-pill cw-mono ${slug ? 'has-slug' : 'no-slug'}`}
                      >
                        {slug
                          ? <span className="cw-check"><Check size={10} strokeWidth={3} /></span>
                          : <Plus size={10} />
                        }
                        {slug || 'slug auto-generated'}
                      </motion.span>
                    </AnimatePresence>
                    <span className="cw-char-count cw-mono">
                      {name.replace(/\s/g, '').length}&nbsp;/&nbsp;80
                    </span>
                  </div>
                </motion.div>

                {/* ── Description ── */}
                <motion.div variants={itemV} className="cw-field-group">
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <p className="cw-field-label" style={{ margin:0 }}>Description</p>
                    <span style={{
                      fontSize:10.5, fontWeight:700, color:'#94a3b8',
                      background:'#f1f5f9', padding:'2px 8px', borderRadius:6,
                      border:'1px solid #e2e8f0', letterSpacing:'.02em',
                    }}>optional</span>
                  </div>
                  <textarea
                    className="cw-input"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="What's this workspace for? Give your team some context."
                    style={{ resize:'none', lineHeight:1.65, marginTop:8 }}
                  />
                  {description.length > 0 && (
                    <div style={{ textAlign:'right' }}>
                      <span className="cw-char-count cw-mono">
                        {description.length}&nbsp;/&nbsp;500
                      </span>
                    </div>
                  )}
                </motion.div>

                {/* ── Info banner ── */}
                <motion.div variants={itemV} className="cw-banner">
                  <div className="cw-banner-icon">
                    <Layers size={15} color="#fff" />
                  </div>
                  <div>
                    <p style={{ fontSize:13.5, fontWeight:700, color:'#3730a3', marginBottom:4 }}>
                      What happens next?
                    </p>
                    <p style={{ fontSize:12.5, color:'#6366f1', lineHeight:1.65 }}>
                      After creation you can invite members, create channels, and configure integrations — all from workspace settings.
                    </p>
                  </div>
                </motion.div>

              </motion.div>

              {/* ══ FOOTER ══ */}
              <div className="cw-footer">
                <button
                  type="button"
                  className="cw-btn-cancel"
                  onClick={onClose}
                >
                  Cancel
                </button>

                <motion.button
                  ref={submitRef}
                  type="submit"
                  disabled={!name.trim() || isLoading}
                  onMouseDown={(e) => triggerRipple(e)}
                  className="cw-btn-submit"
                  whileHover={!name.trim() || isLoading ? {} : { y: -2, boxShadow: '0 6px 18px rgba(99,102,241,.4), 0 14px 36px rgba(99,102,241,.24)' }}
                  whileTap={!name.trim() || isLoading ? {} : { y: 0, scale: .98 }}
                >
                  {isLoading ? (
                    <Loader2 size={16} className="cw-spin" />
                  ) : submitted ? (
                    <span className="cw-check"><Check size={16} strokeWidth={3} /></span>
                  ) : (
                    <ArrowRight size={16} />
                  )}
                  {isLoading ? 'Creating…' : submitted ? 'Created!' : 'Create Workspace'}
                </motion.button>
              </div>
            </form>

          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}