import { useState, useRef, useEffect } from "react";
import { useChannelStore } from "../../stores/channelStore";
import { X, Globe, Lock, Plus, Loader2, Hash, Sparkles } from "lucide-react";
import toast from "react-hot-toast";

/* ─────────────────────────────────────────────
   STYLES — scoped with .ccm- prefix
───────────────────────────────────────────── */
const STYLES = `
  /* ── Keyframes ── */
  @keyframes ccm-modal-in {
    from { opacity:0; transform:scale(0.92) translateY(24px); }
    to   { opacity:1; transform:scale(1)    translateY(0);    }
  }
  @keyframes ccm-overlay-in {
    from { opacity:0; }
    to   { opacity:1; }
  }
  @keyframes ccm-field-in {
    from { opacity:0; transform:translateY(12px); }
    to   { opacity:1; transform:translateY(0);    }
  }
  @keyframes ccm-stripe-shift {
    0%   { background-position: 0%   50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0%   50%; }
  }
  @keyframes ccm-ring-spin {
    from { transform:rotate(0deg); }
    to   { transform:rotate(360deg); }
  }
  @keyframes ccm-check-pop {
    0%   { opacity:0; transform:scale(0) rotate(-120deg); }
    60%  { transform:scale(1.2) rotate(8deg); }
    100% { opacity:1; transform:scale(1) rotate(0deg); }
  }
  @keyframes ccm-glow-pulse {
    0%,100% { opacity:0.08; }
    50%     { opacity:0.18; }
  }
  @keyframes ccm-badge-pop {
    0%   { transform:scale(0); opacity:0; }
    70%  { transform:scale(1.2); }
    100% { transform:scale(1); opacity:1; }
  }
  @keyframes ccm-spin {
    to { transform:rotate(360deg); }
  }
  @keyframes ccm-float {
    0%,100% { transform:translateY(0)    rotate(-2deg); }
    50%     { transform:translateY(-6px) rotate(2deg); }
  }
  @keyframes ccm-shimmer {
    0%   { background-position:-200% 0; }
    100% { background-position: 200% 0; }
  }

  /* ── Overlay ── */
  .ccm-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: var(--overlay-bg, rgba(0,0,0,0.55));
    backdrop-filter: blur(8px);
    animation: ccm-overlay-in 180ms ease;
  }

  /* ── Modal shell ── */
  .ccm-shell {
    position: relative;
    width: 100%;
    max-width: 460px;
    border-radius: 20px;
    overflow: hidden;
    background: var(--bg-modal, var(--surface-primary));
    border: 1px solid var(--border-primary);
    box-shadow:
      0 0 0 1px rgba(255,255,255,0.05),
      0 32px 80px rgba(0,0,0,0.55),
      0 8px 24px rgba(0,0,0,0.25);
    animation: ccm-modal-in 340ms cubic-bezier(0.34,1.4,0.64,1);
  }

  /* ── Top accent stripe ── */
  .ccm-stripe {
    height: 3px;
    width: 100%;
    background: linear-gradient(90deg,
      var(--accent-primary) 0%,
      #7c3aed 35%,
      var(--accent-cyan, #0891b2) 65%,
      var(--accent-primary) 100%);
    background-size: 300% 100%;
    animation: ccm-stripe-shift 5s ease infinite;
  }

  /* ── Background orbs ── */
  .ccm-orb {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
    filter: blur(60px);
    animation: ccm-glow-pulse 4s ease-in-out infinite;
  }
  .ccm-orb--a {
    width: 200px; height: 200px;
    top: -80px; right: -60px;
    background: var(--accent-primary);
    opacity: 0.08;
    animation-delay: 0s;
  }
  .ccm-orb--b {
    width: 160px; height: 160px;
    bottom: -60px; left: -40px;
    background: #7c3aed;
    opacity: 0.06;
    animation-delay: 2s;
  }

  /* ── Header ── */
  .ccm-header {
    position: relative;
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 18px 20px;
    border-bottom: 1px solid var(--border-primary);
  }

  .ccm-header__icon-ring {
    position: relative;
    width: 46px; height: 46px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ccm-header__ring-track {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    animation: ccm-ring-spin 5s linear infinite;
  }

  .ccm-header__ring-inner {
    position: relative;
    z-index: 1;
    width: 37px; height: 37px;
    border-radius: 50%;
    background: var(--bg-modal);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ccm-header__copy { flex: 1; min-width: 0; }

  .ccm-header__title {
    font-size: 15px;
    font-weight: 800;
    color: var(--text-white);
    letter-spacing: -0.02em;
    line-height: 1.2;
    margin: 0 0 2px;
  }

  .ccm-header__sub {
    font-size: 12px;
    color: var(--text-muted);
    margin: 0;
    line-height: 1.4;
  }

  .ccm-header__close {
    width: 30px; height: 30px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 140ms ease, color 140ms ease, transform 180ms ease;
  }
  .ccm-header__close:hover {
    background: var(--surface-hover, var(--bg-hover));
    color: var(--text-primary);
    transform: rotate(90deg) scale(1.1);
  }

  /* ── Form body ── */
  .ccm-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* ── Field wrapper ── */
  .ccm-field { animation: ccm-field-in 360ms ease both; }

  /* ── Field label ── */
  .ccm-label {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-secondary);
    margin-bottom: 8px;
    user-select: none;
  }

  .ccm-label__dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .ccm-label__optional {
    font-weight: 400;
    font-size: 11px;
    opacity: 0.5;
    text-transform: none;
    letter-spacing: 0;
    margin-left: 2px;
  }

  .ccm-label__required {
    margin-left: auto;
    font-size: 9.5px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 20px;
    background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
    color: var(--accent-primary);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    animation: ccm-badge-pop 300ms cubic-bezier(0.34,1.56,0.64,1) both;
  }

  /* ── Input wrap ── */
  .ccm-input-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--bg-input, var(--surface-secondary));
    border: 1.5px solid var(--border-primary);
    border-radius: 12px;
    padding: 11px 14px;
    transition: border-color 180ms ease, box-shadow 180ms ease, background 160ms ease;
  }

  .ccm-input-wrap:focus-within {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 16%, transparent),
                0 2px 12px color-mix(in srgb, var(--accent-primary) 8%, transparent);
    background: var(--surface-primary, var(--bg-primary));
  }

  .ccm-input-wrap__icon { color: var(--text-muted); flex-shrink: 0; transition: color 180ms ease; }
  .ccm-input-wrap:focus-within .ccm-input-wrap__icon { color: var(--accent-primary); }

  .ccm-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-primary);
    font-size: 14px;
    font-family: var(--font-sans);
    min-width: 0;
  }
  .ccm-input::placeholder { color: var(--text-muted); }

  /* ── Textarea wrap ── */
  .ccm-textarea-wrap {
    background: var(--bg-input, var(--surface-secondary));
    border: 1.5px solid var(--border-primary);
    border-radius: 12px;
    overflow: hidden;
    transition: border-color 180ms ease, box-shadow 180ms ease, background 160ms ease;
  }

  .ccm-textarea-wrap:focus-within {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 16%, transparent);
    background: var(--surface-primary, var(--bg-primary));
  }

  .ccm-textarea {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-primary);
    font-size: 13px;
    font-family: var(--font-sans);
    resize: none;
    padding: 11px 14px;
    line-height: 1.6;
    display: block;
  }
  .ccm-textarea::placeholder { color: var(--text-muted); }

  /* ── Meta row ── */
  .ccm-meta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 7px;
    gap: 8px;
  }

  .ccm-slug-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--text-muted);
    background: var(--surface-secondary, var(--bg-hover));
    border-radius: 6px;
    padding: 3px 9px;
    border: 1px solid var(--border-secondary);
    overflow: hidden;
    max-width: 240px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .ccm-slug-pill__value {
    background: linear-gradient(90deg, var(--accent-primary), #7c3aed);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    font-weight: 700;
  }

  .ccm-char-count {
    font-size: 11px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    flex-shrink: 0;
    transition: color 160ms ease;
  }
  .ccm-char-count.warn { color: var(--accent-yellow); }
  .ccm-char-count.danger { color: var(--accent-red); }

  /* ── Visibility cards ── */
  .ccm-vis-grid { display: flex; flex-direction: column; gap: 8px; }

  .ccm-vis-card {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 15px;
    border-radius: 14px;
    border: 1.5px solid var(--border-primary);
    background: transparent;
    cursor: pointer;
    overflow: hidden;
    transition:
      border-color 200ms ease,
      background 200ms ease,
      transform 180ms ease,
      box-shadow 200ms ease;
  }

  .ccm-vis-card:hover:not(.is-selected) {
    background: var(--surface-secondary, var(--bg-secondary));
    transform: translateX(3px);
  }

  .ccm-vis-card.is-selected {
    border-color: var(--ccm-accent, var(--accent-primary));
    background: color-mix(in srgb, var(--ccm-accent, var(--accent-primary)) 8%, transparent);
    box-shadow: 0 4px 16px color-mix(in srgb, var(--ccm-accent, var(--accent-primary)) 12%, transparent);
  }

  /* left bar */
  .ccm-vis-card__bar {
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--ccm-accent, var(--accent-primary));
    transform: scaleY(0);
    transition: transform 260ms cubic-bezier(0.34,1.56,0.64,1);
  }
  .ccm-vis-card.is-selected .ccm-vis-card__bar { transform: scaleY(1); }

  /* glow orb */
  .ccm-vis-card__glow {
    position: absolute;
    top: -30px; right: -30px;
    width: 100px; height: 100px;
    border-radius: 50%;
    background: var(--ccm-accent, var(--accent-primary));
    filter: blur(36px);
    opacity: 0;
    pointer-events: none;
    transition: opacity 300ms ease;
  }
  .ccm-vis-card.is-selected .ccm-vis-card__glow { opacity: 0.15; }

  /* icon tile */
  .ccm-vis-card__icon {
    width: 40px; height: 40px;
    border-radius: 11px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    background: var(--surface-secondary, var(--bg-hover));
    color: var(--text-muted);
    transition: background 200ms ease, color 200ms ease, transform 200ms ease;
  }
  .ccm-vis-card.is-selected .ccm-vis-card__icon {
    background: color-mix(in srgb, var(--ccm-accent, var(--accent-primary)) 18%, transparent);
    color: var(--ccm-accent, var(--accent-primary));
    transform: scale(1.06);
  }

  /* copy */
  .ccm-vis-card__copy { flex: 1; min-width: 0; }
  .ccm-vis-card__label {
    font-size: 13.5px;
    font-weight: 700;
    color: var(--text-white);
    letter-spacing: -0.01em;
    line-height: 1.2;
    margin: 0 0 2px;
  }
  .ccm-vis-card__desc {
    font-size: 11.5px;
    color: var(--text-muted);
    margin: 0;
    line-height: 1.3;
  }

  /* tag pill */
  .ccm-vis-card__tag {
    display: inline-flex;
    align-items: center;
    padding: 3px 9px;
    border-radius: 20px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    white-space: nowrap;
    flex-shrink: 0;
    background: color-mix(in srgb, var(--ccm-accent, var(--accent-primary)) 14%, transparent);
    color: var(--ccm-accent, var(--accent-primary));
    border: 1px solid color-mix(in srgb, var(--ccm-accent, var(--accent-primary)) 25%, transparent);
    transition: background 200ms ease;
  }

  /* check circle */
  .ccm-vis-card__check {
    width: 22px; height: 22px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: var(--ccm-accent, var(--accent-primary));
    flex-shrink: 0;
    opacity: 0;
    transform: scale(0) rotate(-120deg);
    transition: opacity 200ms ease, transform 300ms cubic-bezier(0.34,1.56,0.64,1);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--ccm-accent, var(--accent-primary)) 40%, transparent);
  }
  .ccm-vis-card.is-selected .ccm-vis-card__check {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }

  /* ── Footer ── */
  .ccm-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 16px 20px 20px;
    border-top: 1px solid var(--border-primary);
  }

  /* cancel */
  .ccm-btn-cancel {
    padding: 9px 18px;
    border-radius: 10px;
    border: 1px solid var(--border-primary);
    background: transparent;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: var(--font-sans);
    transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
  }
  .ccm-btn-cancel:hover {
    background: var(--surface-hover, var(--bg-hover));
    color: var(--text-primary);
    border-color: var(--border-primary);
  }

  /* submit */
  .ccm-btn-submit {
    position: relative;
    padding: 9px 20px;
    border-radius: 10px;
    border: none;
    background: var(--accent-primary);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    font-family: var(--font-sans);
    display: flex;
    align-items: center;
    gap: 7px;
    overflow: hidden;
    transition: transform 150ms ease, box-shadow 150ms ease, opacity 150ms ease, filter 150ms ease;
    box-shadow: 0 4px 16px color-mix(in srgb, var(--accent-primary) 40%, transparent);
  }

  .ccm-btn-submit::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.18), transparent 60%);
    pointer-events: none;
  }

  .ccm-btn-submit:not(:disabled):hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px color-mix(in srgb, var(--accent-primary) 50%, transparent);
    filter: brightness(1.1);
  }

  .ccm-btn-submit:not(:disabled):active {
    transform: scale(0.97) translateY(0);
  }

  .ccm-btn-submit:disabled {
    opacity: 0.38;
    cursor: not-allowed;
  }

  /* shimmer on submit hover */
  .ccm-btn-submit::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent);
    transform: translateX(-100%) skewX(-18deg);
    transition: none;
  }
  .ccm-btn-submit:not(:disabled):hover::after {
    animation: ccm-shimmer 600ms ease forwards;
  }

  .ccm-spin { animation: ccm-spin 700ms linear infinite; }

  /* ── Responsive ── */
  @media (max-width: 500px) {
    .ccm-shell { border-radius: 16px; }
    .ccm-body { padding: 16px; gap: 16px; }
    .ccm-footer { padding: 14px 16px 16px; }
    .ccm-vis-card { padding: 11px 12px; }
    .ccm-vis-card__desc { display: none; }
  }
`;

/* ─────────────────────────────────────────────
   FIELD LABEL
───────────────────────────────────────────── */
function FieldLabel({ gradient, text, optional, required, delay = 0 }) {
  return (
    <div className="ccm-label" style={{ animationDelay: `${delay}ms` }}>
      <div
        className="ccm-label__dot"
        style={{ background: gradient }}
      />
      {text}
      {optional && <span className="ccm-label__optional">(optional)</span>}
      {required && <span className="ccm-label__required">Required</span>}
    </div>
  );
}

/* ─────────────────────────────────────────────
   VISIBILITY CARD
───────────────────────────────────────────── */
function VisibilityCard({ icon, label, desc, tag, accentCss, selected, onSelect }) {
  return (
    <label
      className={`ccm-vis-card ${selected ? "is-selected" : ""}`}
      style={{ "--ccm-accent": accentCss }}
      onClick={onSelect}
    >
      <input type="radio" name="vis" value={label} checked={selected} onChange={onSelect} style={{ display: "none" }} />

      <div className="ccm-vis-card__bar" />
      <div className="ccm-vis-card__glow" />

      <div className="ccm-vis-card__icon">{icon}</div>

      <div className="ccm-vis-card__copy">
        <p className="ccm-vis-card__label">{label}</p>
        <p className="ccm-vis-card__desc">{desc}</p>
      </div>

      <span className="ccm-vis-card__tag">{tag}</span>

      <div className="ccm-vis-card__check">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    </label>
  );
}

/* ─────────────────────────────────────────────
   MAIN MODAL
───────────────────────────────────────────── */
export default function CreateChannelModal({ onClose }) {
  const { createChannel } = useChannelStore();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameInputRef = useRef(null);

  /* auto-focus */
  useEffect(() => { nameInputRef.current?.focus(); }, []);

  /* close on Escape */
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) {
      toast.error("Channel name must be at least 2 characters");
      return;
    }
    setIsSubmitting(true);
    try {
      const channel = await createChannel({ name: trimmed, description: description.trim(), visibility });
      const displayName = visibility === "public" ? `#${channel.name}` : channel.name;
      toast.success(`Channel ${displayName} created!`);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error?.message || "Failed to create channel");
    } finally {
      setIsSubmitting(false);
    }
  };

  /* slug preview */
  const slugPreview = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);

  const nameLen = name.replace(/\s/g, "").length;
  const charCountClass = nameLen > 70 ? "danger" : nameLen > 55 ? "warn" : "";
  const isPublic = visibility === "public";
  const canSubmit = name.trim().length >= 2 && !isSubmitting;

  return (
    <>
      <style>{STYLES}</style>

      <div
        className="ccm-overlay"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="ccm-shell">
          {/* Background orbs */}
          <div className="ccm-orb ccm-orb--a" />
          <div className="ccm-orb ccm-orb--b" />

          {/* Animated top stripe */}
          <div className="ccm-stripe" />

          {/* ── Header ── */}
          <div className="ccm-header">
            <div className="ccm-header__icon-ring">
              <div
                className="ccm-header__ring-track"
                style={{
                  background: isPublic
                    ? "conic-gradient(from 0deg, #059669, #34d399, #059669)"
                    : "conic-gradient(from 0deg, var(--accent-primary), #7c3aed, var(--accent-primary))",
                  padding: 2,
                  borderRadius: "50%",
                }}
              />
              <div className="ccm-header__ring-inner">
                {isPublic
                  ? <Globe size={18} style={{ color: "#34d399" }} />
                  : <Lock size={18} style={{ color: "var(--accent-primary)" }} />}
              </div>
            </div>

            <div className="ccm-header__copy">
              <h2 className="ccm-header__title">Create a channel</h2>
              <p className="ccm-header__sub">Channels are where your team communicates</p>
            </div>

            <button className="ccm-header__close" onClick={onClose} title="Close (Esc)">
              <X size={15} />
            </button>
          </div>

          {/* ── Form ── */}
          <form onSubmit={handleSubmit}>
            <div className="ccm-body">

              {/* ── Channel Name ── */}
              <div className="ccm-field" style={{ animationDelay: "60ms" }}>
                <FieldLabel
                  gradient="linear-gradient(135deg, var(--accent-primary), #7c3aed)"
                  text="Channel Name"
                />
                <div className="ccm-input-wrap">
                  <span className="ccm-input-wrap__icon">
                    {isPublic ? <Hash size={15} strokeWidth={2.5} /> : <Lock size={14} strokeWidth={2.5} />}
                  </span>
                  <input
                    ref={nameInputRef}
                    className="ccm-input"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value.replace(/\s{2,}/g, " "))}
                    onKeyDown={(e) => { if (e.key === " " && name.endsWith(" ")) e.preventDefault(); }}
                    placeholder="e.g. marketing-team"
                    maxLength={80}
                    autoComplete="off"
                  />
                </div>

                <div className="ccm-meta-row">
                  {slugPreview ? (
                    <span className="ccm-slug-pill">
                      {isPublic ? "# " : "🔒 "}
                      <span className="ccm-slug-pill__value">{slugPreview}</span>
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className={`ccm-char-count ${charCountClass}`}>
                    {nameLen}&thinsp;/&thinsp;80
                  </span>
                </div>
              </div>

              {/* ── Description ── */}
              <div className="ccm-field" style={{ animationDelay: "140ms" }}>
                <FieldLabel
                  gradient="linear-gradient(135deg, #7c3aed, var(--accent-cyan, #0891b2))"
                  text="Description"
                  optional
                />
                <div className="ccm-textarea-wrap">
                  <textarea
                    className="ccm-textarea"
                    value={description}
                    onChange={(e) => setDescription(e.target.value.replace(/\s{2,}/g, " "))}
                    placeholder="What is this channel about?"
                    maxLength={500}
                    rows={2}
                  />
                </div>
              </div>

              {/* ── Visibility ── */}
              <div className="ccm-field" style={{ animationDelay: "220ms" }}>
                <FieldLabel
                  gradient="linear-gradient(135deg, var(--accent-cyan, #0891b2), #059669)"
                  text="Visibility"
                  required
                />
                <div className="ccm-vis-grid">
                  <VisibilityCard
                    icon={<Globe size={17} />}
                    label="Public"
                    desc="Anyone in the workspace can view and join"
                    tag="Open"
                    accentCss="#059669"
                    selected={visibility === "public"}
                    onSelect={() => setVisibility("public")}
                  />
                  <VisibilityCard
                    icon={<Lock size={17} />}
                    label="Private"
                    desc="Only invited members can access this channel"
                    tag="Invite only"
                    accentCss="var(--accent-primary)"
                    selected={visibility === "private"}
                    onSelect={() => setVisibility("private")}
                  />
                </div>
              </div>
            </div>

            {/* ── Footer ── */}
            <div className="ccm-footer">
              <button type="button" className="ccm-btn-cancel" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="ccm-btn-submit" disabled={!canSubmit}>
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="ccm-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Create Channel
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}