import { useState, useRef, useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { X, LogIn, Info, Check } from 'lucide-react';
import Loader from '../shared/Loader';
import useRipple from "../../hooks/useRipple";
import "./custom-css/joinWorkspaceModal.css";

export default function JoinWorkspaceModal({ onClose, onJoined }) {
  const { joinByInviteCode, isLoading } = useWorkspaceStore();
  const [inviteCode, setInviteCode] = useState("");
  const [joined, setJoined] = useState(false);
  const titleId = useId();
  const inputId = useId();
  const helpId = useId();

  const inputRef = useRef(null);
  const [submitRef, triggerRipple] = useRipple();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!inviteCode.trim() || isLoading) return;
    setJoined(true);
    try {
      const workspace = await joinByInviteCode(inviteCode.trim());
      onJoined?.(workspace);
      onClose();
    } catch {
      setJoined(false);
    }
  };

  return createPortal(
    <div
      className="jw-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* ── Modal shell ── */}
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="jw-modal">
        
        {/* ── Header ── */}
        <div className="jw-header">
          
          {/* Floating orbs */}
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                borderRadius: "50%",
                pointerEvents: "none",
                left: `${10 + i * 18}%`,
                top: `${20 + (i % 2) * 40}%`,
                width: 5,
                height: 5,
                background: "rgba(52,199,89,.3)",
                animation: `jw-particle ${2.5 + i}s ease-in-out infinite`,
              }}
            />
          ))}

          <div className="jw-heading">
            <div className="jw-icon-box">
              <LogIn size={16} />
            </div>

            <div>
              <h2 id={titleId} className="jw-title">Join a workspace</h2>
              <p className="jw-sub">Enter your invite code below</p>
            </div>
          </div>

          <button type="button" onClick={onClose} className="jw-close" aria-label="Close join workspace dialog">
            <X size={14} />
          </button>
        </div>

        {/* ── Body ── */}
        <form className="jw-body" onSubmit={handleSubmit}>
          
          {/* Info */}
          <div id={helpId} className="jw-info">
            <Info size={14} />
            <p>
              Ask a workspace admin to share an invite code with you. Codes are
              case-sensitive.
            </p>
          </div>

          {/* Input */}
          <div className="jw-field">
            <label htmlFor={inputId} className="jw-label">Invite Code</label>

            <div className="jw-input-wrapper">
              <input
                ref={inputRef}
                id={inputId}
                aria-describedby={helpId}
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="e.g. WS-A1B2-C3D4"
                className="jw-input"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="jw-actions">
            <button type="button" onClick={onClose} className="jw-button jw-cancel">
              Cancel
            </button>

            <button
              ref={submitRef}
              type="submit"
              disabled={!inviteCode.trim() || isLoading}
              onMouseDown={(e) => triggerRipple(e)}
              className="jw-button jw-submit"
            >
              {isLoading ? (
                <Loader size={14} className="jw-spin" />
              ) : joined ? (
                <Check size={14} />
              ) : (
                <LogIn size={14} />
              )}

              {isLoading ? "Joining…" : "Join workspace"}
            </button>
          </div>

        </form>
      </div>
    </div>,
    document.body
  );
}
