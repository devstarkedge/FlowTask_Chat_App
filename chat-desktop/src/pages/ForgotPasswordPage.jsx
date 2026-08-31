import { useState, useEffect } from "react";
import { useAuthStore } from "../stores/authStore";
import { Link } from "react-router-dom";
import { MessageCircle, ArrowLeft, Mail, Send } from "lucide-react";
import toast from "react-hot-toast";

/* ─── self-contained styles injected once ─── */
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

  .fp-root {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 48px 16px;
    background: #0b0f17;
    font-family: 'DM Sans', sans-serif;
    position: relative;
    overflow: hidden;
  }

  /* ── animated mesh background ── */
  .fp-root::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 80% 60% at 10% 20%, rgba(56, 189, 248, 0.07) 0%, transparent 60%),
      radial-gradient(ellipse 60% 50% at 90% 80%, rgba(99, 102, 241, 0.08) 0%, transparent 60%),
      radial-gradient(ellipse 50% 40% at 50% 50%, rgba(16, 185, 129, 0.04) 0%, transparent 70%);
    pointer-events: none;
  }

  /* floating orbs */
  .fp-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.18;
    pointer-events: none;
    animation: fp-drift linear infinite;
  }
  .fp-orb-1 {
    width: 340px; height: 340px;
    background: radial-gradient(circle, #38bdf8, transparent 70%);
    top: -80px; left: -80px;
    animation-duration: 18s;
  }
  .fp-orb-2 {
    width: 280px; height: 280px;
    background: radial-gradient(circle, #818cf8, transparent 70%);
    bottom: -60px; right: -60px;
    animation-duration: 22s;
    animation-direction: reverse;
  }
  .fp-orb-3 {
    width: 200px; height: 200px;
    background: radial-gradient(circle, #10b981, transparent 70%);
    top: 50%; left: 60%;
    animation-duration: 28s;
  }

  @keyframes fp-drift {
    0%   { transform: translate(0, 0) scale(1); }
    33%  { transform: translate(30px, -20px) scale(1.05); }
    66%  { transform: translate(-20px, 30px) scale(0.95); }
    100% { transform: translate(0, 0) scale(1); }
  }

  /* ── card ── */
  .fp-card {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 400px;
  }

  /* ── logo ── */
  .fp-logo {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-bottom: 48px;
    animation: fp-slide-down 0.6s cubic-bezier(0.16,1,0.3,1) both;
  }
  .fp-logo-icon {
    width: 44px; height: 44px;
    border-radius: 14px;
    background: linear-gradient(135deg, #38bdf8, #6366f1);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 0 1px rgba(99,102,241,0.3), 0 8px 32px rgba(56,189,248,0.25);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    cursor: default;
  }
  .fp-logo-icon:hover {
    transform: translateY(-2px) scale(1.05);
    box-shadow: 0 0 0 1px rgba(99,102,241,0.5), 0 12px 40px rgba(56,189,248,0.35);
  }
  .fp-logo-text {
    font-size: 18px;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.02em;
  }

  /* ── heading group ── */
  .fp-heading-group {
    text-align: center;
    margin-bottom: 32px;
    animation: fp-slide-up 0.6s cubic-bezier(0.16,1,0.3,1) 0.1s both;
  }
  .fp-heading-group h2 {
    font-size: 26px;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 8px;
    letter-spacing: -0.03em;
    line-height: 1.2;
  }
  .fp-heading-group p {
    font-size: 14px;
    color: var(--text-muted);
    margin: 0;
    line-height: 1.6;
  }

  /* ── error banner ── */
  .fp-error {
    margin-bottom: 20px;
    padding: 12px 16px;
    border-radius: 12px;
    font-size: 13.5px;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.22);
    color: #f87171;
    line-height: 1.5;
    animation: fp-error-shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
  }

  @keyframes fp-error-shake {
    0%, 100% { transform: translateX(0); }
    20%       { transform: translateX(-6px); }
    40%       { transform: translateX(6px); }
    60%       { transform: translateX(-4px); }
    80%       { transform: translateX(4px); }
  }

  /* ── form ── */
  .fp-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    animation: fp-slide-up 0.6s cubic-bezier(0.16,1,0.3,1) 0.2s both;
  }

  .fp-field label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: #94a3b8;
    margin-bottom: 8px;
    letter-spacing: 0.02em;
  }

  .fp-input {
    width: 100%;
    padding: 12px 16px;
    font-size: 15px;
    font-family: 'DM Sans', sans-serif;
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
  }
  .fp-input::placeholder { color: #334155; }
  .fp-input:hover {
    border-color: rgba(255,255,255,0.14);
    background: rgba(255,255,255,0.055);
  }
  .fp-input:focus {
    border-color: rgba(56,189,248,0.5);
    background: rgba(56,189,248,0.04);
    box-shadow: 0 0 0 3px rgba(56,189,248,0.1), 0 1px 2px rgba(0,0,0,0.3);
  }

  /* ── submit button ── */
  .fp-btn {
    position: relative;
    width: 100%;
    padding: 13px 20px;
    font-size: 15px;
    font-weight: 600;
    font-family: 'DM Sans', sans-serif;
    color: #fff;
    background: linear-gradient(135deg, #38bdf8 0%, #6366f1 100%);
    border: none;
    border-radius: 12px;
    cursor: pointer;
    overflow: hidden;
    margin-top: 4px;
    transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
    box-shadow: 0 4px 20px rgba(56,189,248,0.25), 0 1px 3px rgba(0,0,0,0.3);
  }
  .fp-btn::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 60%);
    opacity: 0;
    transition: opacity 0.2s ease;
  }
  .fp-btn:hover:not(:disabled)::before { opacity: 1; }
  .fp-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 8px 28px rgba(56,189,248,0.35), 0 2px 6px rgba(0,0,0,0.3);
  }
  .fp-btn:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 2px 10px rgba(56,189,248,0.2);
  }
  .fp-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* ripple */
  .fp-btn-ripple {
    position: absolute;
    border-radius: 50%;
    background: rgba(255,255,255,0.3);
    transform: scale(0);
    animation: fp-ripple 0.5s linear;
    pointer-events: none;
  }
  @keyframes fp-ripple {
    to { transform: scale(4); opacity: 0; }
  }

  .fp-btn-inner {
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }

  /* spinner */
  .fp-spinner {
    width: 16px; height: 16px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: fp-spin 0.7s linear infinite;
  }
  @keyframes fp-spin { to { transform: rotate(360deg); } }

  /* ── back link ── */
  .fp-back {
    margin-top: 28px;
    text-align: center;
    animation: fp-slide-up 0.6s cubic-bezier(0.16,1,0.3,1) 0.3s both;
  }
  .fp-back a {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 13.5px;
    color: #475569;
    text-decoration: none;
    padding: 6px 10px;
    border-radius: 8px;
    transition: color 0.15s ease, background 0.15s ease;
  }
  .fp-back a:hover {
    color: #94a3b8;
    background: rgba(255,255,255,0.05);
  }

  /* ── success state ── */
  .fp-success {
    text-align: center;
    animation: fp-scale-in 0.5s cubic-bezier(0.16,1,0.3,1) both;
  }

  .fp-success-icon-wrap {
    position: relative;
    width: 88px; height: 88px;
    margin: 0 auto 28px;
  }
  .fp-success-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 1.5px solid rgba(16,185,129,0.3);
    animation: fp-ring-expand 2s ease-out infinite;
  }
  .fp-success-ring:nth-child(2) { animation-delay: 0.6s; }
  .fp-success-ring:nth-child(3) { animation-delay: 1.2s; }
  @keyframes fp-ring-expand {
    0%   { transform: scale(0.85); opacity: 0.6; }
    100% { transform: scale(1.6);  opacity: 0; }
  }
  .fp-success-icon {
    position: absolute;
    inset: 12px;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05));
    border: 1px solid rgba(16,185,129,0.25);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 30px rgba(16,185,129,0.15);
  }

  .fp-success h2 {
    font-size: 24px;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 10px;
    letter-spacing: -0.03em;
  }
  .fp-success p {
    font-size: 14px;
    color: var(--text-muted);
    margin: 0 0 32px;
    line-height: 1.7;
  }
  .fp-success p strong { color: #94a3b8; font-weight: 500; }

  .fp-success-btn {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 11px 28px;
    font-size: 14px;
    font-weight: 600;
    font-family: 'DM Sans', sans-serif;
    color: var(--text-primary);
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    text-decoration: none;
    transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
  }
  .fp-success-btn:hover {
    background: rgba(255,255,255,0.11);
    border-color: rgba(255,255,255,0.18);
    transform: translateY(-1px);
  }

  .fp-try-again {
    margin-top: 16px;
    font-size: 12.5px;
    color: #334155;
  }
  .fp-try-again button {
    background: none; border: none; cursor: pointer;
    color: #38bdf8; font-size: inherit; font-family: inherit;
    padding: 0;
    transition: opacity 0.15s ease;
  }
  .fp-try-again button:hover { opacity: 0.75; }

  /* ── keyframes ── */
  @keyframes fp-slide-down {
    from { opacity: 0; transform: translateY(-18px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fp-slide-up {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fp-scale-in {
    from { opacity: 0; transform: scale(0.92); }
    to   { opacity: 1; transform: scale(1); }
  }
`;

function useRipple() {
  const createRipple = (e) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const span = document.createElement("span");
    span.className = "fp-btn-ripple";
    span.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px`;
    btn.appendChild(span);
    setTimeout(() => span.remove(), 500);
  };
  return createRipple;
}

export default function ForgotPasswordPage() {
  const { forgotPassword, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const ripple = useRipple();

  /* inject styles once */
  useEffect(() => {
    if (document.getElementById("fp-styles")) return;
    const el = document.createElement("style");
    el.id = "fp-styles";
    el.textContent = STYLES;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    try {
      await forgotPassword(email);
      setSent(true);
      toast.success("Reset link sent!");
    } catch {
      // error set in store
    }
  };

  return (
    <div className="page-container flex items-center justify-center">
      {/* ambient orbs */}
      <div className="fp-orb fp-orb-1" />
      <div className="fp-orb fp-orb-2" />
      <div className="fp-orb fp-orb-3" />

      <div className="fp-card">
        {/* Logo */}
        <div className="fp-logo">
          <div className="fp-logo-icon">
            <MessageCircle size={21} color="white" strokeWidth={2.2} />
          </div>
          <span className="fp-logo-text">FlowTask Chat</span>
        </div>

        {sent ? (
          /* ── Success ── */
          <div className="fp-success">
            <div className="fp-success-icon-wrap">
              <div className="fp-success-ring" />
              <div className="fp-success-ring" />
              <div className="fp-success-ring" />
              <div className="fp-success-icon">
                <Mail size={26} color="#10b981" strokeWidth={1.8} />
              </div>
            </div>

            <h2>Check your email</h2>
            <p>
              We sent a reset link to <strong>{email}</strong>.<br />
              It may take a minute to arrive.
            </p>

            <Link to="/login" className="btn-ghost">
              Back to Sign In
            </Link>

            <p className="fp-try-again">
              Didn't get it?{" "}
              <button onClick={() => setSent(false)}>Try again</button>
            </p>
          </div>
        ) : (
          /* ── Form ── */
          <>
            <div className="fp-heading-group">
              <h2>Forgot password?</h2>
              <p>Enter your email and we'll send you a reset link</p>
            </div>

            {error && (
              <div className="fp-error" key={error}>
                {error}
              </div>
            )}

            <form className="fp-form" onSubmit={handleSubmit}>
              <div className="fp-field">
                <label htmlFor="fp-email">Email address</label>
                <input
                  id="fp-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    const val = e.target.value
                      .replace(/\s+/g, "")
                      .toLowerCase();
                    setEmail(val);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === " ") {
                      e.preventDefault();
                    }
                  }}
                  placeholder="you@company.com"
                  className="input-field"
                  autoComplete="email"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary"
                onClick={ripple}
              >
                <span className="fp-btn-inner">
                  {isLoading ? (
                    <>
                      <span className="fp-spinner" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send size={15} strokeWidth={2.2} />
                      Send reset link
                    </>
                  )}
                </span>
              </button>
            </form>

            <div className="fp-back">
              <Link to="/login">
                <ArrowLeft size={14} strokeWidth={2.2} />
                Back to Sign In
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}