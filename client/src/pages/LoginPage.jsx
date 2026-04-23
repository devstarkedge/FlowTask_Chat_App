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
  Sparkles,
  Lock,
} from "lucide-react";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import "./custom-css/loginPage.css";

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
        <div className="lp-auto-loader">
          <div className="lp-auto-spin" />
          <p
            style={{
              fontSize: 15,
              color: "var(--text-muted)",
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
      {/* ── Mesh bg ──*/}
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

      {/* ── Nav ──  */}
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

          <motion.div variants={fadeUp} className="lp-card">
            {flowtaskEnabled && (
              <div className="chat-header-tabs" style={{ marginBottom: 24 }}>
                <button
                  className={`chat-header-tab ${activeTab === "flowtask" ? "is-active" : ""}`}
                  onClick={() => {
                    setActiveTab("flowtask");
                    clearError();
                  }}
                >
                  FlowTask SSO
                </button>
                <button
                  className={`chat-header-tab ${activeTab === "native" ? "is-active" : ""}`}
                  onClick={() => {
                    setActiveTab("native");
                    clearError();
                  }}
                >
                  Email & Password
                </button>
              </div>
            )}

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
                  <div style={{ marginBottom: 18 }}>
                    <label className="lp-label">FlowTask JWT Token</label>
                    <textarea
                      className="input-field"
                      style={{
                        resize: "none",
                        fontFamily: "monospace",
                        fontSize: 12,
                        lineHeight: 1.6,
                      }}
                      rows={3}
                      value={flowtaskToken}
                      onChange={(e) => setFlowtaskToken(e.target.value)}
                      placeholder="Paste your FlowTask JWT token here…"
                    />
                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        marginTop: 6,
                      }}
                    >
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
                  {/* Email field */}
                  <div style={{ marginBottom: 18 }}>
                    <label htmlFor="lp-email" className="lp-label">
                      Email Address
                    </label>
                    <input
                      id="lp-email"
                      className="input-field"
                      type="email"
                      value={email}
                      onChange={(e) =>
                        setEmail(
                          e.target.value.replace(/\s/g, "").toLowerCase(),
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === " ") e.preventDefault();
                      }}
                      placeholder="you@company.com"
                      autoComplete="email"
                      required
                    />
                  </div>

                  {/* Password field */}
                  <div style={{ marginBottom: 18 }}>
                    <div className="lp-label-row">
                      <label htmlFor="lp-password" className="lp-label">
                        Password
                      </label>
                      <Link to="/forgot-password" className="lp-forgot">
                        Forgot password?
                      </Link>
                    </div>
                    <div style={{ position: "relative" }}>
                      <input
                        id="lp-password"
                        className="input-field"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) =>
                          setPassword(e.target.value.replace(/\s/g, ""))
                        }
                        onKeyDown={(e) => {
                          if (e.key === " ") e.preventDefault();
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
          {/* end card */}
        </motion.div>
        {/* end form col */}

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
      {/* end layout */}
    </div>
  );
}
