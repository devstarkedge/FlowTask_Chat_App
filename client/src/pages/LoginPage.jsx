import { useState, useEffect } from "react";
import { useAuthStore } from "../stores/authStore";
import { Link, useSearchParams } from "react-router-dom";
import {
  Eye,
  EyeOff,
  MessageCircle,
  ArrowRight,
  Zap,
  Shield,
  Users,
  Loader2,
  Sparkles,
  Lock,
} from "lucide-react";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";

const STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

  .lp * { font-family:'Plus Jakarta Sans',system-ui,sans-serif; box-sizing:border-box; }

  /* ── keyframes ── */
  @keyframes lpMesh    { 0%,100%{transform:translate(0,0) scale(1)}
                          33%   {transform:translate(24px,-16px) scale(1.08)}
                          66%   {transform:translate(-18px,12px) scale(.94)} }
  @keyframes lpSpin    { to{transform:rotate(360deg)} }
  @keyframes lpShimmer { from{transform:translateX(-130%) skewX(-14deg)}
                         to  {transform:translateX(230%) skewX(-14deg)} }
  @keyframes lpFadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }

  /* ── shimmer btn ── */
  .lp-shimmer-btn::after {
    content:''; position:absolute; inset:0;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.28),transparent);
    transform:translateX(-130%) skewX(-14deg);
  }
  .lp-shimmer-btn:hover:not(:disabled)::after { animation:lpShimmer .6s ease forwards; }

  /* ── page ── */
  .lp-page {
    min-height:100vh; position:relative; overflow:hidden;
    background:#f5f4f0; display:flex; flex-direction:column;
  }

  /* ── mesh bg ── */
  .lp-mesh { position:fixed; inset:0; pointer-events:none; z-index:0; overflow:hidden; }
  .lp-mesh-blob {
    position:absolute; border-radius:50%; filter:blur(90px); opacity:.13;
    animation:lpMesh var(--dur,14s) var(--delay,0s) ease-in-out infinite;
  }

  /* ── nav ── */
  .lp-nav {
    position:sticky; top:0; z-index:50; flex-shrink:0;
    background:rgba(245,244,240,.82); backdrop-filter:blur(14px);
    border-bottom:1px solid rgba(0,0,0,.07);
  }
  .lp-nav-inner {
    max-width:1200px; margin:0 auto; padding:0 28px;
    display:flex; align-items:center; justify-content:space-between; height:62px;
  }
  .lp-logo {
    display:flex; align-items:center; gap:10px; text-decoration:none;
    transition:opacity .15s;
  }
  .lp-logo:hover { opacity:.78; }
  .lp-logo-icon {
    width:34px; height:34px; border-radius:10px;
    background:linear-gradient(135deg,#6366f1,#8b5cf6);
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 4px 14px rgba(99,102,241,.3);
  }
  .lp-logo-name { font-size:17px; font-weight:800; color:#18181b; letter-spacing:-.02em; }
  .lp-nav-link {
    font-size:13.5px; font-weight:600; color:#71717a;
    text-decoration:none; transition:color .15s;
  }
  .lp-nav-link:hover { color:#3f3f46; }
  .lp-nav-link strong { color:#6366f1; }

  /* ── layout ── */
  .lp-layout {
    flex:1; display:grid; grid-template-columns:1fr 1fr;
    max-width:1100px; margin:0 auto; width:100%;
    padding:48px 28px 80px; gap:64px; align-items:center;
    position:relative; z-index:1;
  }
  @media(max-width:900px) {
    .lp-layout { grid-template-columns:1fr; gap:40px; padding:32px 20px 64px; }
    .lp-aside  { display:none; }
  }

  /* ── form column ── */
  .lp-form-col { width:100%; max-width:440px; margin:0 auto; }

  /* eyebrow */
  .lp-eyebrow {
    display:inline-flex; align-items:center; gap:7px;
    padding:5px 13px; border-radius:20px; margin-bottom:18px;
    background:rgba(99,102,241,.09); border:1px solid rgba(99,102,241,.2);
    font-size:11.5px; font-weight:700; color:#6366f1; letter-spacing:.04em;
  }

  /* headings */
  .lp-heading {
    font-size:32px; font-weight:800; color:#18181b; line-height:1.12;
    letter-spacing:-.04em; margin-bottom:10px;
  }
  .lp-subheading { font-size:14.5px; color:#71717a; line-height:1.65; margin-bottom:28px; }

  /* ── card ── */
  .lp-card {
    background:#ffffff;
    border:1px solid rgba(0,0,0,.07);
    border-radius:20px; padding:28px;
    box-shadow:0 4px 6px rgba(0,0,0,.04),
               0 16px 40px rgba(0,0,0,.07),
               0 1px 0 rgba(255,255,255,.9) inset;
    position:relative; overflow:hidden;
  }
  .lp-card::before {
    content:''; position:absolute; top:0; left:0; right:0; height:2px;
    background:linear-gradient(90deg, transparent, rgba(99,102,241,.5) 40%, rgba(139,92,246,.5) 60%, transparent);
  }

  /* ── tabs ── */
  .lp-tabs {
    display:flex; gap:4px; padding:4px; border-radius:12px;
    background:#f4f4f5; border:1px solid rgba(0,0,0,.06);
    margin-bottom:24px;
  }
  .lp-tab {
    flex:1; padding:8px 12px; border-radius:9px; border:none;
    font-size:13px; font-weight:600; cursor:pointer;
    font-family:'Plus Jakarta Sans',system-ui,sans-serif;
    transition:background .18s, color .18s, box-shadow .18s;
  }
  .lp-tab.active {
    background:#ffffff; color:#18181b;
    box-shadow:0 1px 4px rgba(0,0,0,.1), 0 0 0 1px rgba(0,0,0,.06);
  }
  .lp-tab.inactive { background:transparent; color:#a1a1aa; }
  .lp-tab.inactive:hover { color:#71717a; }

  /* ── error ── */
  .lp-error {
    padding:12px 16px; border-radius:12px; font-size:13px; margin-bottom:20px;
    background:rgba(220,38,38,.06); border:1px solid rgba(220,38,38,.2); color:#dc2626;
    display:flex; align-items:flex-start; gap:8px; line-height:1.5;
  }

  /* ── field ── */
  .lp-field { margin-bottom:18px; }
  .lp-label {
    display:flex; align-items:center; gap:6px;
    font-size:10.5px; font-weight:800; text-transform:uppercase;
    letter-spacing:.09em; color:#a1a1aa; margin-bottom:8px;
  }
  .lp-label::after { content:''; flex:1; height:1px; background:rgba(0,0,0,.06); }

  /* inline label row (password + forgot) */
  .lp-label-row {
    display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;
  }
  .lp-label-row .lp-label { margin-bottom:0; flex:1; }
  .lp-forgot {
    font-size:12px; font-weight:600; color:#6366f1;
    text-decoration:none; transition:color .15s; white-space:nowrap;
  }
  .lp-forgot:hover { color:#4f46e5; text-decoration:underline; }

  /* inputs */
  .lp-input {
    width:100%; padding:12px 16px;
    border-radius:12px; font-size:14px; font-weight:500;
    background:#f9f9fb; border:1.5px solid #e4e4e7;
    color:#18181b; outline:none;
    font-family:'Plus Jakarta Sans',system-ui,sans-serif;
    box-shadow:inset 0 1px 2px rgba(0,0,0,.04);
    transition:border-color .16s, box-shadow .16s, background .16s, transform .12s;
  }
  .lp-input::placeholder { color:#d4d4d8; font-weight:400; }
  .lp-input:focus {
    border-color:rgba(99,102,241,.6);
    background:#fafaff;
    box-shadow:0 0 0 4px rgba(99,102,241,.1), inset 0 1px 2px rgba(0,0,0,.03);
    transform:translateY(-1px);
  }

  /* textarea token */
  .lp-textarea {
    width:100%; padding:12px 16px; resize:none;
    border-radius:12px; font-size:12px; font-weight:500; font-family:monospace;
    background:#f9f9fb; border:1.5px solid #e4e4e7;
    color:#18181b; outline:none; line-height:1.6;
    box-shadow:inset 0 1px 2px rgba(0,0,0,.04);
    transition:border-color .16s, box-shadow .16s, background .16s;
  }
  .lp-textarea::placeholder { color:#d4d4d8; font-family:'Plus Jakarta Sans',system-ui,sans-serif; font-size:13px; }
  .lp-textarea:focus {
    border-color:rgba(99,102,241,.6); background:#fafaff;
    box-shadow:0 0 0 4px rgba(99,102,241,.1), inset 0 1px 2px rgba(0,0,0,.03);
  }
  .lp-hint { font-size:11px; color:#a1a1aa; margin-top:6px; }

  /* eye btn */
  .lp-input-wrap { position:relative; }
  .lp-eye-btn {
    position:absolute; right:12px; top:50%; transform:translateY(-50%);
    background:transparent; border:none; cursor:pointer; color:#a1a1aa;
    padding:4px; border-radius:6px; transition:color .15s;
    display:flex; align-items:center; justify-content:center;
  }
  .lp-eye-btn:hover { color:#6b7280; }

  /* ── submit btn ── */
  .lp-submit {
    width:100%; padding:14px 24px; border-radius:13px; border:none;
    font-size:15px; font-weight:700; cursor:pointer; letter-spacing:-.01em;
    display:flex; align-items:center; justify-content:center; gap:9px;
    background:linear-gradient(135deg,#6366f1,#4f46e5 50%,#7c3aed);
    color:#fff; position:relative; overflow:hidden;
    box-shadow:0 4px 14px rgba(99,102,241,.35), 0 8px 28px rgba(99,102,241,.18);
    font-family:'Plus Jakarta Sans',system-ui,sans-serif;
    transition:transform .14s, box-shadow .14s, opacity .14s;
  }
  .lp-submit:hover:not(:disabled) {
    transform:translateY(-2px);
    box-shadow:0 8px 24px rgba(99,102,241,.45), 0 18px 44px rgba(99,102,241,.22);
  }
  .lp-submit:active:not(:disabled) { transform:translateY(0); }
  .lp-submit:disabled { opacity:.4; cursor:not-allowed; }
  .lp-spin { animation:lpSpin .85s linear infinite; }

  /* register link */
  .lp-register { text-align:center; font-size:13.5px; color:#71717a; margin-top:18px; }
  .lp-register a { color:#6366f1; font-weight:700; text-decoration:none; transition:color .15s; }
  .lp-register a:hover { color:#4f46e5; text-decoration:underline; }

  /* ── ASIDE ── */
  .lp-aside { padding-left:8px; }
  .lp-aside-heading {
    font-size:28px; font-weight:800; color:#18181b; letter-spacing:-.03em;
    line-height:1.2; margin-bottom:10px;
  }
  .lp-aside-sub { font-size:14px; color:#71717a; line-height:1.7; margin-bottom:32px; }

  .lp-feature-list { display:flex; flex-direction:column; gap:12px; margin-bottom:36px; }
  .lp-feature {
    display:flex; align-items:flex-start; gap:14px;
    padding:14px 16px; border-radius:14px;
    background:#ffffff; border:1px solid rgba(0,0,0,.07);
    box-shadow:0 2px 6px rgba(0,0,0,.04);
    transition:border-color .15s, background .15s, box-shadow .15s, transform .15s;
  }
  .lp-feature:hover {
    background:#fafaff; border-color:rgba(99,102,241,.22);
    box-shadow:0 4px 16px rgba(99,102,241,.1); transform:translateY(-1px);
  }
  .lp-feature-icon {
    width:36px; height:36px; border-radius:10px; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
  }
  .lp-feature-title { font-size:14px; font-weight:700; color:#27272a; margin-bottom:2px; }
  .lp-feature-desc  { font-size:12.5px; color:#71717a; line-height:1.55; }

  /* trust badges */
  .lp-trust { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
  .lp-trust-badge {
    display:inline-flex; align-items:center; gap:6px;
    padding:6px 12px; border-radius:20px; font-size:12px; font-weight:600;
    background:#ffffff; border:1px solid rgba(0,0,0,.08); color:#71717a;
    box-shadow:0 1px 3px rgba(0,0,0,.04);
  }

  /* ── auto-login loader ── */
  .lp-auto-loader {
    min-height:100vh; display:flex; align-items:center; justify-content:center;
    background:#f5f4f0; flex-direction:column; gap:16px;
  }
  .lp-auto-spin {
    width:40px; height:40px; border:3px solid #e4e4e7;
    border-top-color:#6366f1; border-radius:50%;
    animation:lpSpin .85s linear infinite;
  }

  @media(max-width:480px) {
    .lp-heading { font-size:26px; }
    .lp-card    { padding:20px; }
  }
`;

/* ─────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────── */
const BLOBS = [
  {
    w: 700,
    h: 700,
    bg: "#a5b4fc",
    top: "-220px",
    left: "-220px",
    dur: "14s",
    delay: "0s",
  },
  {
    w: 580,
    h: 580,
    bg: "#c4b5fd",
    bottom: "-100px",
    right: "-160px",
    dur: "18s",
    delay: "3s",
  },
  {
    w: 420,
    h: 420,
    bg: "#67e8f9",
    top: "45%",
    right: "22%",
    dur: "22s",
    delay: "7s",
  },
];

const FEATURES = [
  {
    icon: Zap,
    label: "Real-Time Messaging",
    desc: "Instant delivery with WebSocket technology.",
    color: "#d97706",
    bg: "rgba(217,119,6,.1)",
  },
  {
    icon: Shield,
    label: "Enterprise Security",
    desc: "JWT auth, RBAC, and HMAC verification.",
    color: "#6366f1",
    bg: "rgba(99,102,241,.1)",
  },
  {
    icon: Users,
    label: "Project Channels",
    desc: "Auto-created from FlowTask projects.",
    color: "#059669",
    bg: "rgba(5,150,105,.1)",
  },
];

/* ─────────────────────────────────────────────────────────────────────────
   FRAMER VARIANTS
───────────────────────────────────────────────────────────────────────── */
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.08 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
  },
};
const fadeLeft = {
  hidden: { opacity: 0, x: 16 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
  },
};
const tabContent = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────────────────────────────────── */
export default function LoginPage() {
  const {
    loginNative,
    loginFlowTask,
    isLoading,
    error,
    clearError,
    flowtaskEnabled,
  } = useAuthStore();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState(
    flowtaskEnabled ? "flowtask" : "native",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [flowtaskToken, setFlowtaskToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [autoLoginAttempted, setAutoLoginAttempted] = useState(false);
  const [autoLoginInProgress, setAutoLoginInProgress] = useState(false);

  /* ── auto-login from FlowTask redirect ── */
  useEffect(() => {
    if (autoLoginAttempted) return;
    const token = searchParams.get("token");
    const source = searchParams.get("source");
    if (token && source === "flowtask") {
      setAutoLoginAttempted(true);
      setAutoLoginInProgress(true);
      loginFlowTask(token)
        .then(() => toast.success("Welcome from FlowTask!"))
        .catch(() => {
          toast.error("FlowTask auto-login failed. Please try again.");
          setAutoLoginInProgress(false);
        });
    }
  }, [searchParams, autoLoginAttempted, loginFlowTask]);

  /* ── auto-login loading screen ── */
  if (autoLoginInProgress) {
    return (
      <div className="lp">
        <style>{STYLE}</style>
        <div className="lp-auto-loader">
          <div className="lp-auto-spin" />
          <p
            style={{
              fontSize: 15,
              color: "#71717a",
              fontFamily: "Plus Jakarta Sans,system-ui,sans-serif",
            }}
          >
            Signing in from FlowTask…
          </p>
        </div>
      </div>
    );
  }

  const handleNativeLogin = async (e) => {
    e.preventDefault();
    clearError();
    try {
      await loginNative({ email, password });
      toast.success("Welcome back!");
    } catch {
      /* error in store */
    }
  };

  const handleFlowTaskLogin = async (e) => {
    e.preventDefault();
    clearError();
    if (!flowtaskToken.trim()) {
      toast.error("Please enter your FlowTask token");
      return;
    }
    try {
      await loginFlowTask(flowtaskToken.trim());
      toast.success("FlowTask login successful!");
    } catch {
      /* error in store */
    }
  };

  /* ─────────────────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────────────────── */
  return (
    <div className="lp">
      <style>{STYLE}</style>

      {/* ── Mesh bg ── */}
      <div className="lp-mesh">
        {BLOBS.map((b, i) => (
          <div
            key={i}
            className="lp-mesh-blob"
            style={{
              width: b.w,
              height: b.h,
              background: b.bg,
              top: b.top,
              bottom: b.bottom,
              left: b.left,
              right: b.right,
              "--dur": b.dur,
              "--delay": b.delay,
            }}
          />
        ))}
      </div>

      {/* ── Nav ── */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <Link to="/" className="lp-logo">
            <div className="lp-logo-icon">
              <MessageCircle size={18} color="white" />
            </div>
            <span className="lp-logo-name">FlowTask Chat</span>
          </Link>
          <p className="lp-nav-link">
            New here?{" "}
            <Link to="/register">
              <strong>Create account</strong>
            </Link>
          </p>
        </div>
      </nav>

      {/* ── Layout ── */}
      <div className="lp-layout">
        {/* ══ LEFT — FORM ══ */}
        <motion.div
          className="lp-form-col"
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={fadeUp} className="lp-eyebrow">
            <Sparkles size={11} />
            Enterprise · Secure · Real-time
          </motion.div>

          <motion.h1 variants={fadeUp} className="lp-heading">
            Welcome
            <br />
            back
          </motion.h1>

          <motion.p variants={fadeUp} className="lp-subheading">
            Sign in to continue to your workspace and pick up right where you
            left off.
          </motion.p>

          {/* ── Card ── */}
          <motion.div variants={fadeUp} className="lp-card">
            {/* Tabs — only when FlowTask is enabled */}
            {flowtaskEnabled && (
              <div className="lp-tabs">
                <button
                  className={`lp-tab ${activeTab === "flowtask" ? "active" : "inactive"}`}
                  onClick={() => {
                    setActiveTab("flowtask");
                    clearError();
                  }}
                >
                  FlowTask SSO
                </button>
                <button
                  className={`lp-tab ${activeTab === "native" ? "active" : "inactive"}`}
                  onClick={() => {
                    setActiveTab("native");
                    clearError();
                  }}
                >
                  Email & Password
                </button>
              </div>
            )}

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  key="err"
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: "auto", marginBottom: 20 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.2 }}
                  className="lp-error"
                >
                  <Lock size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── FlowTask SSO tab ── */}
            <AnimatePresence mode="wait">
              {activeTab === "flowtask" && (
                <motion.form
                  key="flowtask"
                  variants={tabContent}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  onSubmit={handleFlowTaskLogin}
                >
                  <div className="lp-field">
                    <label className="lp-label">FlowTask JWT Token</label>
                    <textarea
                      className="lp-textarea"
                      rows={3}
                      value={flowtaskToken}
                      onChange={(e) => setFlowtaskToken(e.target.value)}
                      placeholder="Paste your FlowTask JWT token here…"
                    />
                    <p className="lp-hint">
                      Get your token from FlowTask → Settings → API Access
                    </p>
                  </div>

                  <motion.button
                    type="submit"
                    disabled={isLoading}
                    className="lp-submit lp-shimmer-btn"
                    whileHover={
                      isLoading
                        ? {}
                        : {
                            y: -2,
                            boxShadow: "0 8px 28px rgba(99,102,241,.48)",
                          }
                    }
                    whileTap={isLoading ? {} : { y: 0, scale: 0.98 }}
                  >
                    {isLoading ? (
                      <>
                        <div
                          className="lp-spin"
                          style={{
                            width: 17,
                            height: 17,
                            border: "2.5px solid rgba(255,255,255,.35)",
                            borderTopColor: "rgba(255,255,255,.9)",
                            borderRadius: "50%",
                          }}
                        />
                        Authenticating…
                      </>
                    ) : (
                      <>
                        Sign in with FlowTask <ArrowRight size={17} />
                      </>
                    )}
                  </motion.button>
                </motion.form>
              )}

              {/* ── Native email/password tab ── */}
              {activeTab === "native" && (
                <motion.form
                  key="native"
                  variants={tabContent}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  onSubmit={handleNativeLogin}
                >
                  {/* Email */}
                  <div className="lp-field">
                    <label htmlFor="lp-email" className="lp-label">
                      Email Address
                    </label>
                    <input
                      id="lp-email"
                      className="lp-input"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        let v = e.target.value
                          .replace(/\s/g, "") //  remove ALL spaces
                          .toLowerCase(); //  normalize
                        setEmail(v);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === " ") {
                          e.preventDefault(); //  block space completely
                        }
                      }}
                      placeholder="you@company.com"
                      autoComplete="email"
                      required
                    />
                  </div>

                  {/* Password */}
                  <div className="lp-field">
                    <div className="lp-label-row">
                      <label htmlFor="lp-password" className="lp-label">
                        Password
                      </label>
                      <Link to="/forgot-password" className="lp-forgot">
                        Forgot password?
                      </Link>
                    </div>
                    <div className="lp-input-wrap">
                      <input
                        id="lp-password"
                        className="lp-input"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => {
                          let v = e.target.value
                            .replace(/\s/g, "") //  remove ALL spaces
                            setPassword(v);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === " ") {
                            e.preventDefault(); //  block space completely
                          }
                        }}
                        placeholder="Enter your password"
                        style={{ paddingRight: 44 }}
                        autoComplete="current-password"
                        required
                      />
                      <button
                        type="button"
                        className="lp-eye-btn"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    </div>
                  </div>

                  <motion.button
                    type="submit"
                    disabled={isLoading}
                    className="lp-submit lp-shimmer-btn"
                    whileHover={
                      isLoading
                        ? {}
                        : {
                            y: -2,
                            boxShadow: "0 8px 28px rgba(99,102,241,.48)",
                          }
                    }
                    whileTap={isLoading ? {} : { y: 0, scale: 0.98 }}
                  >
                    {isLoading ? (
                      <>
                        <div
                          className="lp-spin"
                          style={{
                            width: 17,
                            height: 17,
                            border: "2.5px solid rgba(255,255,255,.35)",
                            borderTopColor: "rgba(255,255,255,.9)",
                            borderRadius: "50%",
                          }}
                        />
                        Signing in…
                      </>
                    ) : (
                      <>
                        Sign in <ArrowRight size={17} />
                      </>
                    )}
                  </motion.button>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>

        {/* ══ RIGHT — ASIDE ══ */}
        <motion.div
          className="lp-aside"
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          <motion.p variants={fadeLeft} className="lp-aside-heading">
            Enterprise
            <br />
            communication,
            <br />
            reimagined
          </motion.p>
          <motion.p variants={fadeLeft} className="lp-aside-sub">
            FlowTask Chat brings real-time messaging, project-aware channels,
            and enterprise security into one seamless workspace.
          </motion.p>

          <motion.div variants={fadeLeft} className="lp-feature-list">
            {FEATURES.map(({ icon: Icon, label, desc, color, bg }) => (
              <div key={label} className="lp-feature">
                <div className="lp-feature-icon" style={{ background: bg }}>
                  <Icon size={16} color={color} />
                </div>
                <div>
                  <p className="lp-feature-title">{label}</p>
                  <p className="lp-feature-desc">{desc}</p>
                </div>
              </div>
            ))}
          </motion.div>

          <motion.div variants={fadeLeft} className="lp-trust">
            {["JWT Secured", "RBAC Roles", "HMAC Verified"].map((t) => (
              <span key={t} className="lp-trust-badge">
                <Shield size={11} color="#6366f1" strokeWidth={2.5} />
                {t}
              </span>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
