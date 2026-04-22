import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { Link, useNavigate } from 'react-router-dom'
import {
  Eye, EyeOff, MessageCircle, ArrowRight, Check,
  Sparkles, Shield, Zap, Users, Lock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'

const STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

  .rp * { font-family:'Plus Jakarta Sans',system-ui,sans-serif; box-sizing:border-box; }

  /* ── keyframes ── */
  @keyframes rpMesh   { 0%,100%{transform:translate(0,0) scale(1)}
                         33%   {transform:translate(24px,-16px) scale(1.08)}
                         66%   {transform:translate(-18px,12px) scale(.94)} }
  @keyframes rpOrb    { 0%,100%{transform:translate(0,0) scale(1);opacity:.6}
                         40%   {transform:translate(8px,-12px) scale(1.2);opacity:1}
                         75%   {transform:translate(-6px,8px) scale(.88);opacity:.7} }
  @keyframes rpSpin   { to{transform:rotate(360deg)} }
  @keyframes rpShimmer{ from{transform:translateX(-130%) skewX(-14deg)}
                        to  {transform:translateX(230%) skewX(-14deg)} }
  @keyframes rpFloat  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
  @keyframes rpCheckIn{ 0%{transform:scale(0) rotate(-20deg)} 65%{transform:scale(1.28) rotate(4deg)} 100%{transform:scale(1) rotate(0)} }
  @keyframes rpPulse  { 0%,100%{opacity:1} 50%{opacity:.6} }
  @keyframes rpBarFill{ from{width:0} to{width:var(--w)} }

  /* ── animation classes ── */
  .rp-spin    { animation:rpSpin .85s linear infinite; }
  .rp-float   { animation:rpFloat 3s ease-in-out infinite; }
  .rp-check   { animation:rpCheckIn .32s cubic-bezier(.22,1,.36,1) both; }
  .rp-shimmer-btn::after {
    content:''; position:absolute; inset:0;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.28),transparent);
    transform:translateX(-130%) skewX(-14deg);
  }
  .rp-shimmer-btn:hover:not(:disabled)::after { animation:rpShimmer .6s ease forwards; }

  /* ── page  (light) ── */
  .rp-page {
    min-height:100vh; position:relative; overflow:hidden;
    background:#f5f4f0; display:flex; flex-direction:column;
  }

  /* ── mesh bg  (soft pastel blobs, more opacity) ── */
  .rp-mesh { position:fixed; inset:0; pointer-events:none; z-index:0; overflow:hidden; }
  .rp-mesh-blob {
    position:absolute; border-radius:50%; filter:blur(90px); opacity:.13;
    animation:rpMesh var(--dur,14s) var(--delay,0s) ease-in-out infinite;
  }

  /* ── nav  (light) ── */
  .rp-nav {
    position:sticky; top:0; z-index:50; flex-shrink:0;
    background:rgba(245,244,240,.82); backdrop-filter:blur(14px);
    border-bottom:1px solid rgba(0,0,0,.07);
  }
  .rp-nav-inner {
    max-width:1200px; margin:0 auto; padding:0 28px;
    display:flex; align-items:center; justify-content:space-between; height:62px;
  }
  .rp-logo {
    display:flex; align-items:center; gap:10px; text-decoration:none;
    transition:opacity .15s;
  }
  .rp-logo:hover { opacity:.78; }
  .rp-logo-icon {
    width:34px; height:34px; border-radius:10px;
    background:linear-gradient(135deg,#6366f1,#8b5cf6);
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 4px 14px rgba(99,102,241,.3);
  }
  /* logo name — dark on light */
  .rp-logo-name { font-size:17px; font-weight:800; color:#18181b; letter-spacing:-.02em; }
  .rp-nav-link {
    font-size:13.5px; font-weight:600; color:#71717a;
    text-decoration:none; transition:color .15s;
  }
  .rp-nav-link:hover { color:#3f3f46; }
  .rp-nav-link strong { color:#6366f1; }

  /* ── layout ── */
  .rp-layout {
    flex:1; display:grid; grid-template-columns:1fr 1fr;
    max-width:1100px; margin:0 auto; width:100%;
    padding:48px 28px 80px; gap:64px; align-items:center;
    position:relative; z-index:1;
  }
  @media(max-width:900px) {
    .rp-layout { grid-template-columns:1fr; gap:40px; padding:32px 20px 64px; }
    .rp-aside  { display:none; }
  }

  /* ── form column ── */
  .rp-form-col { width:100%; max-width:440px; margin:0 auto; }

  /* eyebrow — light indigo tint */
  .rp-eyebrow {
    display:inline-flex; align-items:center; gap:7px;
    padding:5px 13px; border-radius:20px; margin-bottom:18px;
    background:rgba(99,102,241,.09); border:1px solid rgba(99,102,241,.2);
    font-size:11.5px; font-weight:700; color:#6366f1; letter-spacing:.04em;
  }

  /* headings — near-black */
  .rp-heading {
    font-size:32px; font-weight:800; color:#18181b; line-height:1.12;
    letter-spacing:-.04em; margin-bottom:10px;
  }
  .rp-subheading { font-size:14.5px; color:#71717a; line-height:1.65; margin-bottom:28px; }

  /* ── card  (white on light bg) ── */
  .rp-card {
    background:#ffffff;
    border:1px solid rgba(0,0,0,.07);
    border-radius:20px; padding:28px;
    box-shadow:0 4px 6px rgba(0,0,0,.04),
               0 16px 40px rgba(0,0,0,.07),
               0 1px 0 rgba(255,255,255,.9) inset;
    position:relative; overflow:hidden;
  }
  /* top shimmer line — indigo */
  .rp-card::before {
    content:''; position:absolute; top:0; left:0; right:0; height:2px;
    background:linear-gradient(90deg, transparent, rgba(99,102,241,.5) 40%, rgba(139,92,246,.5) 60%, transparent);
  }

  /* ── error ── */
  .rp-error {
    padding:12px 16px; border-radius:12px; font-size:13px; margin-bottom:20px;
    background:rgba(220,38,38,.06); border:1px solid rgba(220,38,38,.2); color:#dc2626;
    display:flex; align-items:flex-start; gap:8px; line-height:1.5;
  }

  /* ── field ── */
  .rp-field { margin-bottom:18px; }
  .rp-label {
    display:block; font-size:10.5px; font-weight:800; text-transform:uppercase;
    letter-spacing:.09em; color:#a1a1aa; margin-bottom:8px;
    display:flex; align-items:center; gap:6px;
  }
  .rp-label::after { content:''; flex:1; height:1px; background:rgba(0,0,0,.06); }

  /* inputs — light bg, dark text */
  .rp-input {
    width:100%; padding:12px 16px;
    border-radius:12px; font-size:14px; font-weight:500;
    background:#f9f9fb; border:1.5px solid #e4e4e7;
    color:#18181b; outline:none;
    font-family:'Plus Jakarta Sans',system-ui,sans-serif;
    box-shadow:inset 0 1px 2px rgba(0,0,0,.04);
    transition:border-color .16s, box-shadow .16s, background .16s, transform .12s;
  }
  .rp-input::placeholder { color:#d4d4d8; font-weight:400; }
  .rp-input:focus {
    border-color:rgba(99,102,241,.6);
    background:#fafaff;
    box-shadow:0 0 0 4px rgba(99,102,241,.1), inset 0 1px 2px rgba(0,0,0,.03);
    transform:translateY(-1px);
  }
  .rp-input.error { border-color:rgba(220,38,38,.45); }

  /* password eye btn */
  .rp-input-wrap { position:relative; }
  .rp-eye-btn {
    position:absolute; right:12px; top:50%; transform:translateY(-50%);
    background:transparent; border:none; cursor:pointer; color:#a1a1aa;
    padding:4px; border-radius:6px; transition:color .15s;
    display:flex; align-items:center; justify-content:center;
  }
  .rp-eye-btn:hover { color:#6b7280; }

  /* ── strength meter ── */
  .rp-strength-track {
    height:3px; border-radius:3px; background:#e4e4e7;
    overflow:hidden; margin-top:10px; margin-bottom:10px;
  }
  .rp-strength-fill {
    height:100%; border-radius:3px;
    transition:width .35s cubic-bezier(.22,1,.36,1), background .3s;
  }

  /* ── checks grid ── */
  .rp-checks {
    display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; margin-bottom:6px;
  }
  .rp-check-item {
    display:flex; align-items:center; gap:7px;
    font-size:11.5px; font-weight:500; transition:color .2s;
  }
  .rp-check-dot {
    width:16px; height:16px; border-radius:50%; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
    transition:background .2s, box-shadow .2s;
  }
  .rp-check-dot.ok {
    background:linear-gradient(135deg,#10b981,#059669);
    box-shadow:0 2px 6px rgba(16,185,129,.35);
  }
  .rp-check-dot.fail { background:#e4e4e7; }

  /* ── submit btn ── */
  .rp-submit {
    width:100%; padding:14px 24px; border-radius:13px; border:none;
    font-size:15px; font-weight:700; cursor:pointer; letter-spacing:-.01em;
    display:flex; align-items:center; justify-content:center; gap:9px;
    background:linear-gradient(135deg,#6366f1,#4f46e5 50%,#7c3aed);
    color:#fff; position:relative; overflow:hidden;
    box-shadow:0 4px 14px rgba(99,102,241,.35), 0 8px 28px rgba(99,102,241,.18);
    font-family:'Plus Jakarta Sans',system-ui,sans-serif;
    transition:transform .14s, box-shadow .14s, opacity .14s;
  }
  .rp-submit:hover:not(:disabled) {
    transform:translateY(-2px);
    box-shadow:0 8px 24px rgba(99,102,241,.45), 0 18px 44px rgba(99,102,241,.22);
  }
  .rp-submit:active:not(:disabled) { transform:translateY(0); }
  .rp-submit:disabled { opacity:.4; cursor:not-allowed; }

  /* ── divider ── */
  .rp-divider {
    display:flex; align-items:center; gap:12px; margin:20px 0;
    font-size:12px; color:#d4d4d8;
  }
  .rp-divider::before,.rp-divider::after {
    content:''; flex:1; height:1px; background:rgba(0,0,0,.07);
  }

  /* ── sign-in link ── */
  .rp-signin { text-align:center; font-size:13.5px; color:#71717a; margin-top:18px; }
  .rp-signin a { color:#6366f1; font-weight:700; text-decoration:none; transition:color .15s; }
  .rp-signin a:hover { color:#4f46e5; text-decoration:underline; }

  /* ── ASIDE ── */
  .rp-aside { padding-left:8px; }

  .rp-aside-heading {
    font-size:28px; font-weight:800; color:#18181b; letter-spacing:-.03em;
    line-height:1.2; margin-bottom:10px;
  }
  .rp-aside-sub { font-size:14px; color:#71717a; line-height:1.7; margin-bottom:32px; }

  .rp-feature-list { display:flex; flex-direction:column; gap:12px; margin-bottom:36px; }
  .rp-feature {
    display:flex; align-items:flex-start; gap:14px;
    padding:14px 16px; border-radius:14px;
    background:#ffffff; border:1px solid rgba(0,0,0,.07);
    box-shadow:0 2px 6px rgba(0,0,0,.04);
    transition:border-color .15s, background .15s, box-shadow .15s, transform .15s;
  }
  .rp-feature:hover {
    background:#fafaff; border-color:rgba(99,102,241,.22);
    box-shadow:0 4px 16px rgba(99,102,241,.1);
    transform:translateY(-1px);
  }
  .rp-feature-icon {
    width:36px; height:36px; border-radius:10px; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
  }
  /* feature text — dark */
  .rp-feature-title { font-size:14px; font-weight:700; color:#27272a; margin-bottom:2px; }
  .rp-feature-desc  { font-size:12.5px; color:#71717a; line-height:1.55; }

  /* trust badges */
  .rp-trust {
    display:flex; align-items:center; gap:12px; flex-wrap:wrap;
  }
  .rp-trust-badge {
    display:inline-flex; align-items:center; gap:6px;
    padding:6px 12px; border-radius:20px; font-size:12px; font-weight:600;
    background:#ffffff; border:1px solid rgba(0,0,0,.08); color:#71717a;
    box-shadow:0 1px 3px rgba(0,0,0,.04);
  }

  /* ── success page ── */
  .rp-success-page {
    min-height:100vh; display:flex; align-items:center; justify-content:center;
    background:#f5f4f0; position:relative; overflow:hidden;
  }
  .rp-success-card {
    text-align:center; max-width:420px; padding:48px 40px;
    background:#ffffff; border:1px solid rgba(0,0,0,.07);
    border-radius:24px;
    box-shadow:0 8px 32px rgba(0,0,0,.1), 0 2px 6px rgba(0,0,0,.05);
    position:relative; overflow:hidden; z-index:1;
  }
  .rp-success-card::before {
    content:''; position:absolute; top:0; left:0; right:0; height:2px;
    background:linear-gradient(90deg, transparent, rgba(16,185,129,.55), transparent);
  }
  .rp-success-ring {
    width:72px; height:72px; border-radius:50%; margin:0 auto 20px;
    background:linear-gradient(135deg,#10b981,#059669);
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 10px 32px rgba(16,185,129,.4);
  }
  /* success text — dark */
  .rp-success-card p:first-of-type {
    color:#18181b !important;
  }
  .rp-success-card p:last-of-type {
    color:#71717a !important;
  }

  .rp-go-btn {
    display:inline-flex; align-items:center; gap:8px;
    padding:12px 28px; border-radius:12px; font-size:15px; font-weight:700;
    background:linear-gradient(135deg,#6366f1,#4f46e5); color:#fff;
    text-decoration:none; border:none; cursor:pointer;
    box-shadow:0 4px 14px rgba(99,102,241,.35);
    font-family:'Plus Jakarta Sans',system-ui,sans-serif;
    transition:transform .14s, box-shadow .14s;
  }
  .rp-go-btn:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(99,102,241,.45); }

  @media(max-width:480px) {
    .rp-heading { font-size:26px; }
    .rp-card    { padding:20px; }
    .rp-checks  { grid-template-columns:1fr; }
  }
`

/* ─────────────────────────────────────────────────────────────────────────
   CONSTANTS  —  lighter blob colors for a pastel mesh on white
───────────────────────────────────────────────────────────────────────── */
const BLOBS = [
  { w:700, h:700, bg:'#a5b4fc', top:'-220px',  left:'-220px', dur:'14s', delay:'0s'  },
  { w:580, h:580, bg:'#c4b5fd', bottom:'-100px', right:'-160px',dur:'18s', delay:'3s'  },
  { w:420, h:420, bg:'#67e8f9', top:'45%',      right:'22%',   dur:'22s', delay:'7s'  },
]

const FEATURES = [
  { icon:Shield,   label:'Secure & private',        desc:'End-to-end encrypted messages and files.',        color:'#6366f1', bg:'rgba(99,102,241,.1)'  },
  { icon:Zap,      label:'Real-time collaboration', desc:'Instant messages, threads, and live presence.',   color:'#d97706', bg:'rgba(217,119,6,.1)'   },
  { icon:Users,    label:'Unlimited members',        desc:'Invite your whole team with no seat limits.',     color:'#059669', bg:'rgba(5,150,105,.1)'   },
  { icon:Sparkles, label:'Smart integrations',      desc:'Connect FlowTask, GitHub, Slack, and more.',     color:'#7c3aed', bg:'rgba(124,58,237,.1)'  },
]

/* ─────────────────────────────────────────────────────────────────────────
   HELPERS — strength calculation
───────────────────────────────────────────────────────────────────────── */
function getStrength(pass) {
  if (!pass) return { pct: 0, color: 'transparent', label: '' }
  let score = 0
  if (pass.length >= 8)        score++
  if (/[A-Z]/.test(pass))      score++
  if (/\d/.test(pass))         score++
  if (/[^A-Za-z0-9]/.test(pass)) score++
  const map = [
    { pct: 18,  color: '#ef4444', label: 'Weak'     },
    { pct: 42,  color: '#f59e0b', label: 'Fair'     },
    { pct: 68,  color: '#3b82f6', label: 'Good'     },
    { pct: 100, color: '#10b981', label: 'Strong'   },
  ]
  return map[Math.min(score - 1, 3)] ?? map[0]
}

/* ─────────────────────────────────────────────────────────────────────────
   FRAMER VARIANTS  (unchanged)
───────────────────────────────────────────────────────────────────────── */
const stagger = {
  hidden:  {},
  visible: { transition: { staggerChildren: .09, delayChildren: .08 } },
}
const fadeUp = {
  hidden:  { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: .28, ease: [.22,1,.36,1] } },
}
const fadeLeft = {
  hidden:  { opacity: 0, x: 16 },
  visible: { opacity: 1, x: 0,  transition: { duration: .3,  ease: [.22,1,.36,1] } },
}
const checkVariants = {
  hidden:  { scale: 0, rotate: -20 },
  visible: { scale: 1, rotate: 0, transition: { delay:.06, duration:.35, ease:[.22,1,.36,1] } },
}
const successCard = {
  hidden:  { opacity: 0, scale: .88, y: 20 },
  visible: { opacity: 1, scale: 1,   y: 0,  transition: { duration: .4, ease: [.22,1,.36,1] } },
}

/* ─────────────────────────────────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────────────────────────────────── */
export default function RegisterPage() {
  const { register, isLoading, error, clearError } = useAuthStore()
  const navigate = useNavigate()

  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [success, setSuccess] = useState(false)

  const updateField = (field) => (e) => {
    let value = e.target.value
    if (field === 'email') value = value.replace(/\s/g, '').toLowerCase()
    setForm((f) => ({ ...f, [field]: value }))
    clearError()
  }

  const passwordChecks = [
    { label: 'At least 8 characters', ok: form.password.length >= 8              },
    { label: 'Contains uppercase',    ok: /[A-Z]/.test(form.password)             },
    { label: 'Contains number',       ok: /\d/.test(form.password)                },
    { label: 'Passwords match',       ok: !!form.password && !!form.confirmPassword && form.password === form.confirmPassword },
  ]
  const allChecks = passwordChecks.every((c) => c.ok)

  const handleSubmit = async (e) => {
    e.preventDefault()
    clearError()
    if (!allChecks) { toast.error('Please fix password requirements'); return }
    try {
      await register({ name: form.name, email: form.email, password: form.password })
      setSuccess(true)
      toast.success('Account created! Check your email.')
    } catch { /* error set in store */ }
  }

  const strength = getStrength(form.password)

  /* ─────────────────────────────────────────────────────────────────────
     SUCCESS STATE
  ───────────────────────────────────────────────────────────────────── */
  if (success) {
    return (
      <div className="rp">
        <style>{STYLE}</style>
        <div className="rp-success-page">
          <div className="rp-mesh">
            {BLOBS.map((b, i) => (
              <div key={i} className="rp-mesh-blob" style={{ width:b.w, height:b.h, background:b.bg, top:b.top, bottom:b.bottom, left:b.left, right:b.right, '--dur':b.dur, '--delay':b.delay }} />
            ))}
          </div>

          <motion.div
            className="rp-success-card"
            variants={successCard}
            initial="hidden"
            animate="visible"
          >
            <motion.div className="rp-success-ring" variants={checkVariants} initial="hidden" animate="visible">
              <Check size={32} color="#fff" strokeWidth={3} />
            </motion.div>

            <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:.22 }}>
              <p style={{ fontSize:24, fontWeight:800, color:'#18181b', letterSpacing:'-.03em', marginBottom:10 }}>
                Account created! 🎉
              </p>
              <p style={{ fontSize:14, color:'#71717a', lineHeight:1.7, marginBottom:28 }}>
                We've sent a verification email to{' '}
                <strong style={{ color:'#6366f1' }}>{form.email}</strong>.
                Please verify your email to sign in.
              </p>
              <Link to="/login" className="rp-go-btn">
                Go to Sign In
                <ArrowRight size={16} />
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </div>
    )
  }

  /* ─────────────────────────────────────────────────────────────────────
     MAIN REGISTER PAGE
  ───────────────────────────────────────────────────────────────────── */
  return (
    <div className="rp">
      <style>{STYLE}</style>

      {/* ── Animated mesh bg ── */}
      <div className="rp-mesh">
        {BLOBS.map((b, i) => (
          <div key={i} className="rp-mesh-blob" style={{ width:b.w, height:b.h, background:b.bg, top:b.top, bottom:b.bottom, left:b.left, right:b.right, '--dur':b.dur, '--delay':b.delay }} />
        ))}
      </div>

      {/* ── Nav ── */}
      <nav className="rp-nav">
        <div className="rp-nav-inner">
          <Link to="/" className="rp-logo">
            <div className="rp-logo-icon">
              <MessageCircle size={18} color="white" />
            </div>
            <span className="rp-logo-name">FlowTask Chat</span>
          </Link>
          <p className="rp-nav-link">
            Already have an account?{' '}
            <Link to="/login"><strong>Sign in</strong></Link>
          </p>
        </div>
      </nav>

      {/* ── Layout ── */}
      <div className="rp-layout">

        {/* ══ LEFT — FORM ══ */}
        <motion.div
          className="rp-form-col"
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={fadeUp} className="rp-eyebrow">
            <Sparkles size={11} />
            Free forever · No credit card
          </motion.div>

          <motion.h1 variants={fadeUp} className="rp-heading">
            Create your<br />account
          </motion.h1>

          <motion.p variants={fadeUp} className="rp-subheading">
            Join thousands of teams already using FlowTask Chat to communicate and collaborate faster.
          </motion.p>

          {/* ── Card ── */}
          <motion.div variants={fadeUp} className="rp-card">

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  key="err"
                  initial={{ opacity:0, height:0, marginBottom:0 }}
                  animate={{ opacity:1, height:'auto', marginBottom:20 }}
                  exit={{ opacity:0, height:0, marginBottom:0 }}
                  transition={{ duration:.2 }}
                  className="rp-error"
                >
                  <Lock size={13} style={{ flexShrink:0, marginTop:1 }} />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit}>

              {/* ── Full name ── */}
              <div className="rp-field">
                <label htmlFor="rp-name" className="rp-label">Full Name</label>
                <input
                  id="rp-name"
                  className="rp-input"
                  type="text"
                  value={form.name}
                  onChange={updateField('name')}
                  placeholder="John Doe"
                  maxLength={30}
                  required
                />
              </div>

              {/* ── Email ── */}
              <div className="rp-field">
                <label htmlFor="rp-email" className="rp-label">Email Address</label>
                <input
                  id="rp-email"
                  className="rp-input"
                  type="email"
                  value={form.email}
                  onChange={updateField('email')}
                  placeholder="you@company.com"
                  onKeyDown={(e) => { if (e.key === ' ') e.preventDefault() }}
                  required
                />
              </div>

              {/* ── Password ── */}
              <div className="rp-field">
                <label htmlFor="rp-password" className="rp-label">Password</label>
                <div className="rp-input-wrap">
                  <input
                    id="rp-password"
                    className="rp-input"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={updateField('password')}
                    placeholder="Create a strong password"
                    style={{ paddingRight:44 }}
                    required
                  />
                  <button
                    type="button"
                    className="rp-eye-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* Strength bar */}
                <AnimatePresence>
                  {form.password && (
                    <motion.div
                      initial={{ opacity:0, scaleY:0 }}
                      animate={{ opacity:1, scaleY:1 }}
                      exit={{ opacity:0, scaleY:0 }}
                      style={{ transformOrigin:'top' }}
                    >
                      <div className="rp-strength-track">
                        <motion.div
                          className="rp-strength-fill"
                          initial={{ width:0 }}
                          animate={{ width:`${strength.pct}%`, background:strength.color }}
                          transition={{ duration:.35, ease:[.22,1,.36,1] }}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Confirm password ── */}
              <div className="rp-field">
                <label htmlFor="rp-confirm" className="rp-label">Confirm Password</label>
                <input
                  id="rp-confirm"
                  className={`rp-input${form.confirmPassword && form.confirmPassword !== form.password ? ' error' : ''}`}
                  type="password"
                  value={form.confirmPassword}
                  onChange={updateField('confirmPassword')}
                  placeholder="Confirm your password"
                  required
                />
              </div>

              {/* ── Password checks ── */}
              <AnimatePresence>
                {form.password && (
                  <motion.div
                    initial={{ opacity:0, y:-6, height:0 }}
                    animate={{ opacity:1, y:0, height:'auto' }}
                    exit={{ opacity:0, y:-6, height:0 }}
                    transition={{ duration:.22 }}
                    style={{ marginBottom:20 }}
                  >
                    <div className="rp-checks">
                      {passwordChecks.map(({ label, ok }) => (
                        <div key={label} className="rp-check-item" style={{ color: ok ? '#059669' : '#a1a1aa' }}>
                          <div className={`rp-check-dot ${ok ? 'ok' : 'fail'}`}>
                            {ok && <span className="rp-check"><Check size={9} color="#fff" strokeWidth={3} /></span>}
                          </div>
                          {label}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Submit ── */}
              <motion.button
                type="submit"
                disabled={isLoading || !allChecks}
                className="rp-submit rp-shimmer-btn"
                whileHover={isLoading || !allChecks ? {} : {
                  y: -2,
                  boxShadow: '0 8px 28px rgba(99,102,241,.48), 0 18px 44px rgba(99,102,241,.22)',
                }}
                whileTap={isLoading || !allChecks ? {} : { y:0, scale:.98 }}
              >
                {isLoading ? (
                  <>
                    <div className="rp-spin" style={{
                      width:17, height:17, border:'2.5px solid rgba(255,255,255,.35)',
                      borderTopColor:'rgba(255,255,255,.9)', borderRadius:'50%',
                    }} />
                    Creating account…
                  </>
                ) : (
                  <>
                    Create account
                    <ArrowRight size={17} />
                  </>
                )}
              </motion.button>

            </form>
          </motion.div>
        </motion.div>

        {/* ══ RIGHT — ASIDE ══ */}
        <motion.div
          className="rp-aside"
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          <motion.p variants={fadeLeft} className="rp-aside-heading">
            Everything your<br />team needs
          </motion.p>
          <motion.p variants={fadeLeft} className="rp-aside-sub">
            FlowTask Chat brings real-time messaging, file sharing, and project tools into one beautiful workspace.
          </motion.p>

          <motion.div variants={fadeLeft} className="rp-feature-list">
            {FEATURES.map(({ icon: Icon, label, desc, color, bg }) => (
              <div key={label} className="rp-feature">
                <div className="rp-feature-icon" style={{ background:bg }}>
                  <Icon size={16} color={color} />
                </div>
                <div>
                  <p className="rp-feature-title">{label}</p>
                  <p className="rp-feature-desc">{desc}</p>
                </div>
              </div>
            ))}
          </motion.div>

          <motion.div variants={fadeLeft} className="rp-trust">
            {['Free forever', 'No spam', 'Cancel anytime'].map((t) => (
              <span key={t} className="rp-trust-badge">
                <Check size={11} color="#10b981" strokeWidth={3} />
                {t}
              </span>
            ))}
          </motion.div>
        </motion.div>

      </div>
    </div>
  )
}