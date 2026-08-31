import { useState, useEffect } from "react";
import { useAuthStore } from "../stores/authStore";
import { Link, useNavigate } from "react-router-dom";
import {
  Eye,
  EyeOff,
  MessageCircle,
  ArrowRight,
  Check,
  Sparkles,
  Shield,
  Zap,
  Users,
  Lock,
  PartyPopper
} from "lucide-react";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import TermsAndConditionsModal from "../components/shared/TermsAndConditionsModal";
import './custom-css/registerPage.css'


/* ─────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────── */
const BLOBS = [
  { w: 700, h: 700, bg: "#a5b4fc", top: "-220px",   left: "-220px",  dur: "14s", delay: "0s" },
  { w: 580, h: 580, bg: "#c4b5fd", bottom: "-100px", right: "-160px", dur: "18s", delay: "3s" },
  { w: 420, h: 420, bg: "#67e8f9", top: "45%",       right: "22%",    dur: "22s", delay: "7s" },
];

const FEATURES = [
  { icon: Shield,   label: "Secure & private",       desc: "End-to-end encrypted messages and files.",       color: "#6366f1", bg: "rgba(99,102,241,.1)"  },
  { icon: Zap,      label: "Real-time collaboration", desc: "Instant messages, threads, and live presence.",  color: "#d97706", bg: "rgba(217,119,6,.1)"   },
  { icon: Users,    label: "Unlimited members",       desc: "Invite your whole team with no seat limits.",    color: "#059669", bg: "rgba(5,150,105,.1)"   },
  { icon: Sparkles, label: "Smart integrations",      desc: "Connect FlowTask, GitHub, Slack, and more.",     color: "#7c3aed", bg: "rgba(124,58,237,.1)"  },
];

/* ─────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────── */
function getStrength(pass) {
  if (!pass) return { pct: 0, color: "transparent", label: "" };
  let score = 0;
  if (pass.length >= 8) score++;
  if (/[A-Z]/.test(pass)) score++;
  if (/\d/.test(pass)) score++;
  if (/[^A-Za-z0-9]/.test(pass)) score++;
  const map = [
    { pct: 18,  color: "#ef4444", label: "Weak"   },
    { pct: 42,  color: "#f59e0b", label: "Fair"   },
    { pct: 68,  color: "#3b82f6", label: "Good"   },
    { pct: 100, color: "#10b981", label: "Strong" },
  ];
  return map[Math.min(score - 1, 3)] ?? map[0];
}

/* ─────────────────────────────────────────────────────────────────────────
   FRAMER VARIANTS
───────────────────────────────────────────────────────────────────────── */
const stagger      = { hidden: {}, visible: { transition: { staggerChildren: 0.09, delayChildren: 0.08 } } };
const fadeUp       = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } } };
const fadeLeft     = { hidden: { opacity: 0, x: 16 }, visible: { opacity: 1, x: 0, transition: { duration: 0.3,  ease: [0.22, 1, 0.36, 1] } } };
const checkVariants= { hidden: { scale: 0, rotate: -20 }, visible: { scale: 1, rotate: 0, transition: { delay: 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] } } };
const successCard  = { hidden: { opacity: 0, scale: 0.88, y: 20 }, visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } } };

/* ─────────────────────────────────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────────────────────────────────── */
export default function RegisterPage() {
  const { register, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const updateField = (field) => (e) => {
    let value = e.target.value;
    if (field === "name") value = value.replace(/\s{2,}/g, " ");
    if (field === "email") value = value.replace(/\s/g, "").toLowerCase();
    if (field === "password" || field === "confirmPassword") value = value.replace(/\s/g, "");
    setForm((f) => ({ ...f, [field]: value }));
    clearError();
  };

  const passwordChecks = [
    { label: "At least 8 characters", ok: form.password.length >= 8 },
    { label: "Contains uppercase",    ok: /[A-Z]/.test(form.password) },
    { label: "Contains number",       ok: /\d/.test(form.password) },
    { label: "Passwords match",       ok: !!form.password && !!form.confirmPassword && form.password === form.confirmPassword },
  ];
  const allChecks = passwordChecks.every((c) => c.ok);
  const canSubmit = allChecks && agreedToTerms;

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    if (!allChecks) { toast.error("Please fix password requirements"); return; }
    if (!agreedToTerms) { toast.error("Please accept the Terms & Conditions"); return; }
    try {
      await register({ name: form.name, email: form.email, password: form.password });
      setSuccess(true);
      toast.success("Account created! Check your email.");
    } catch { /* error set in store */ }
  };

  const strength = getStrength(form.password);

  /* ─────────────────────────────────────────────────────────────────────
     SUCCESS STATE
  ───────────────────────────────────────────────────────────────────── */
  if (success) {
    return (
      <div className="rp">
        
        <div className="rp-success-page">
          <div className="rp-mesh">
            {BLOBS.map((b, i) => (
              <div key={i} className="rp-mesh-blob" style={{ width: b.w, height: b.h, background: b.bg, top: b.top, bottom: b.bottom, left: b.left, right: b.right, "--dur": b.dur, "--delay": b.delay }} />
            ))}
          </div>

          <motion.div className="rp-success-card" variants={successCard} initial="hidden" animate="visible">
            <motion.div className="rp-success-ring" variants={checkVariants} initial="hidden" animate="visible">
              <Check size={32} color="#fff" strokeWidth={3} />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
              <p style={{ fontSize: 24, fontWeight: 800, color: "#18181b", letterSpacing: "-.03em", marginBottom: 10 }}>
                Account created! <PartyPopper />
              </p>
              <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 28 }}>
                We've sent a verification email to{" "}
                <strong style={{ color: "#6366f1" }}>{form.email}</strong>.
                Please verify your email to sign in.
              </p>
              <Link to="/login" className="rp-go-btn">
                Go to Sign In <ArrowRight size={16} />
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────────────
     MAIN REGISTER PAGE
  ───────────────────────────────────────────────────────────────────── */
  return (
    <div className="rp">
      

      {/* ── Mesh bg ── */}
      <div className="rp-mesh">
        {BLOBS.map((b, i) => (
          <div key={i} className="rp-mesh-blob" style={{ width: b.w, height: b.h, background: b.bg, top: b.top, bottom: b.bottom, left: b.left, right: b.right, "--dur": b.dur, "--delay": b.delay }} />
        ))}
      </div>

      {/* ── Nav (light-bg override, no global match) ── */}
      <nav className="rp-nav">
        <div className="rp-nav-inner">
          <Link to="/" className="rp-logo">
            <div className="rp-logo-icon">
              <MessageCircle size={18} color="white" />
            </div>
            <span className="rp-logo-name">FlowTask Chat</span>
          </Link>
          <p className="rp-nav-link">
            Already have an account?{" "}
            <Link to="/login"><strong>Sign in</strong></Link>
          </p>
        </div>
      </nav>

      {/* ── Layout ── */}
      <div className="rp-layout">

        {/* ══ LEFT — FORM ══ */}
        <motion.div className="rp-form-col" variants={stagger} initial="hidden" animate="visible">

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

            <AnimatePresence>
              {error && (
                <motion.div
                  key="err"
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: "auto", marginBottom: 20 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.2 }}
                  className="activity-message"
                  style={{
                    borderLeftColor: "var(--accent-red)",
                    background: "rgba(220,38,38,.06)",
                    color: "var(--accent-red)",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <Lock size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit}>

              {/* ── Full name ── */}
              <div style={{ marginBottom: 18 }}>
                <label htmlFor="rp-name" className="rp-label">Full Name</label>
                <input
                  id="rp-name"
                  className="input-field"
                  type="text"
                  value={form.name}
                  onChange={updateField("name")}
                  placeholder="John Doe"
                  maxLength={30}
                  required
                />
              </div>

              {/* ── Email ── */}
              <div style={{ marginBottom: 18 }}>
                <label htmlFor="rp-email" className="rp-label">Email Address</label>
                <input
                  id="rp-email"
                  className="input-field"
                  type="email"
                  value={form.email}
                  onChange={updateField("email")}
                  placeholder="you@company.com"
                  onKeyDown={(e) => { if (e.key === " ") e.preventDefault(); }}
                  required
                />
              </div>

              {/* ── Password ── */}
              <div style={{ marginBottom: 18 }}>
                <label htmlFor="rp-password" className="rp-label">Password</label>
                <div style={{ position: "relative" }}>
                  <input
                    id="rp-password"
                    className="input-field"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={updateField("password")}
                    placeholder="Create a strong password"
                    style={{ paddingRight: 44 }}
                    required
                  />
                  <button
                    type="button"
                    className="rp-eye-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* Strength bar */}
                <AnimatePresence>
                  {form.password && (
                    <motion.div
                      initial={{ opacity: 0, scaleY: 0 }}
                      animate={{ opacity: 1, scaleY: 1 }}
                      exit={{ opacity: 0, scaleY: 0 }}
                      style={{ transformOrigin: "top" }}
                    >
                      <div className="rp-strength-track">
                        <motion.div
                          className="rp-strength-fill"
                          initial={{ width: 0 }}
                          animate={{ width: `${strength.pct}%`, background: strength.color }}
                          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Confirm password ── */}
              <div style={{ marginBottom: 18 }}>
                <label htmlFor="rp-confirm" className="rp-label">Confirm Password</label>
                <input
                  id="rp-confirm"
                  className={`input-field${form.confirmPassword && form.confirmPassword !== form.password ? " rp-input-error" : ""}`}
                  type="password"
                  value={form.confirmPassword}
                  onChange={updateField("confirmPassword")}
                  placeholder="Confirm your password"
                  required
                />
              </div>

              {/* ── Password requirement checks ── */}
              <AnimatePresence>
                {form.password && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: -6, height: 0 }}
                    transition={{ duration: 0.22 }}
                    style={{ marginBottom: 20 }}
                  >
                    <div className="rp-checks">
                      {passwordChecks.map(({ label, ok }) => (
                        <div key={label} className="rp-check-item" style={{ color: ok ? "#059669" : "#a1a1aa" }}>
                          <div className={`rp-check-dot ${ok ? "ok" : "fail"}`}>
                            {ok && (
                              <span className="rp-check">
                                <Check size={9} color="#fff" strokeWidth={3} />
                              </span>
                            )}
                          </div>
                          {label}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Terms & Conditions acceptance ── */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    style={{ marginTop: 2, width: 16, height: 16, accentColor: "#6366f1", cursor: "pointer", flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text-muted)" }}>
                    I have read and agree to the{" "}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setShowTerms(true);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        font: "inherit",
                        color: "#6366f1",
                        fontWeight: 600,
                        textDecoration: "underline",
                        cursor: "pointer",
                      }}
                    >
                      Terms &amp; Conditions
                    </button>
                  </span>
                </label>
              </div>

              {/* ── Submit (gradient + shimmer — no global equivalent) ── */}
              <motion.button
                type="submit"
                disabled={isLoading || !canSubmit}
                className="rp-submit rp-shimmer-btn"
                whileHover={isLoading || !canSubmit ? {} : { y: -2, boxShadow: "0 8px 28px rgba(99,102,241,.48), 0 18px 44px rgba(99,102,241,.22)" }}
                whileTap={isLoading || !canSubmit ? {} : { y: 0, scale: 0.98 }}
              >
                {isLoading ? (
                  <>
                    <div className="rp-spin" style={{ width: 17, height: 17, border: "2.5px solid rgba(255,255,255,.35)", borderTopColor: "rgba(255,255,255,.9)", borderRadius: "50%" }} />
                    Creating account…
                  </>
                ) : (
                  <>Create account <ArrowRight size={17} /></>
                )}
              </motion.button>

            </form>
          </motion.div>
          {/* end card */}

        </motion.div>
        {/* end form col */}

        {/* ══ RIGHT — ASIDE (page-specific marketing layout) ══ */}
        <motion.div className="rp-aside" variants={stagger} initial="hidden" animate="visible">
          <motion.p variants={fadeLeft} className="rp-aside-heading">
            Everything your<br />team needs
          </motion.p>
          <motion.p variants={fadeLeft} className="rp-aside-sub">
            FlowTask Chat brings real-time messaging, file sharing, and project tools into one beautiful workspace.
          </motion.p>

          <motion.div variants={fadeLeft} className="rp-feature-list">
            {FEATURES.map(({ icon: Icon, label, desc, color, bg }) => (
              <div key={label} className="rp-feature">
                <div className="rp-feature-icon" style={{ background: bg }}>
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
            {["Free forever", "No spam", "Cancel anytime"].map((t) => (
              <span key={t} className="rp-trust-badge">
                <Check size={11} color="#10b981" strokeWidth={3} />
                {t}
              </span>
            ))}
          </motion.div>
        </motion.div>

        {/* Terms & Conditions viewer */}
        <TermsAndConditionsModal isOpen={showTerms} onClose={() => setShowTerms(false)} />

      </div>
    </div>
  );
}