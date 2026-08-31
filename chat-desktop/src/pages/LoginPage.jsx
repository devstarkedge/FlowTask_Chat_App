import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "../stores/authStore";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
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
  const { loginNative, loginFlowTask, isLoading, error, clearError, user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const redirectTo = searchParams.get("redirect");
  const ssoToken = searchParams.get("token");
  const ssoSource = searchParams.get("source");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const ssoAttempted = useRef(false);
  const [ssoLoading, setSsoLoading] = useState(ssoSource === "flowtask" && !!ssoToken);

  /* ── FlowTask "Open Chat" SSO landing ──────────────────────────────────
     FlowTask redirects here as /login?token=...&source=flowtask&workspaceId=...
     The workspaceId query param is display-only/untrusted — the actual
     target workspace comes back from the server, which derives it from the
     token's signed, verified claim (see auth.controller.js#loginFlowTask). */
  useEffect(() => {
    if (ssoSource !== "flowtask" || !ssoToken || ssoAttempted.current) return;
    ssoAttempted.current = true;
    loginFlowTask(ssoToken)
      .then((data) => {
        const workspaceId = data?.data?.workspaceId;
        navigate(workspaceId ? `/workspace/${workspaceId}` : "/select-workspace", { replace: true });
      })
      .catch(() => {
        // Error surfaces via the store's `error` state below; fall back to
        // showing the native login form instead of a permanent spinner.
        setSsoLoading(false);
      });
  }, [ssoSource, ssoToken, loginFlowTask, navigate]);

  /* ── Post-login redirect (handles ALL login paths: native email/password, already-authenticated) ── */
  useEffect(() => {
    if (!user || ssoLoading) return;
    // User is authenticated — check for pending invite or explicit redirect
    const pendingInvite = sessionStorage.getItem("pendingInviteToken");
    if (pendingInvite) {
      sessionStorage.removeItem("pendingInviteToken");
      navigate(`/invite/${pendingInvite}`, { replace: true });
    } else if (redirectTo) {
      navigate(redirectTo, { replace: true });
    } else {
      navigate("/select-workspace", { replace: true });
    }
  }, [user, navigate, redirectTo, ssoLoading]);


  const handleNativeLogin = async (e) => {
    e.preventDefault();
    clearError();
    try {
      await loginNative({ email, password });
      toast.success("Welcome back!");
      // Redirect handled by the user-watch useEffect above
    } catch {
      /* error in store */
    }
  };


  /* ─────────────────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────────────────── */
  if (ssoLoading) {
    return (
      <div className="lp" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div
            className="lp-spin"
            style={{
              width: 32,
              height: 32,
              border: "3px solid rgba(99,102,241,.2)",
              borderTopColor: "#6366f1",
              borderRadius: "50%",
            }}
          />
          <p className="lp-subheading" style={{ margin: 0 }}>
            Signing you in from FlowTask…
          </p>
        </div>
      </div>
    );
  }

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

            <AnimatePresence mode="wait">

              {/* ── Native email/password login ── */}
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
