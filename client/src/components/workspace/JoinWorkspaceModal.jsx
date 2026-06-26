import { useState, useRef, useEffect } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { X, LogIn, Lock, Info, Check } from 'lucide-react';
import Loader from '../shared/Loader';
import useRipple from "../../hooks/useRipple";
import toast from "react-hot-toast";
import "./custom-css/joinWorkspaceModal.css";

export default function JoinWorkspaceModal({ onClose, onJoined }) {
  const { joinByInviteCode, isLoading } = useWorkspaceStore();
  const [inviteCode, setInviteCode] = useState("");
  const [joined, setJoined] = useState(false);

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

  return (
    <div
      className="modal-overlay px-4 sm:px-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* ── Modal shell ── */}
      <div role="dialog" aria-modal="true" className="jw-modal">
        
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

          <div className="flex items-center gap-4">
            <div className="jw-icon-box">
              <LogIn size={16} />
            </div>

            <div>
              <p className="jw-title">Join a workspace</p>
              <p className="jw-sub">Enter your invite code below</p>
            </div>
          </div>

          <button onClick={onClose} className="jw-close">
            <X size={14} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="jw-body">
          
          {/* Info */}
          <div className="jw-info">
            <Info size={14} />
            <p className="text-sm text-secondary">
              Ask a workspace admin to share an invite code with you. Codes are
              case-sensitive.
            </p>
          </div>

          {/* Input */}
          <div className="flex flex-col gap-2">
            <label className="jw-label">Invite Code</label>

            <div className="relative">
              <input
                ref={inputRef}
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit(e)}
                placeholder="e.g. WS-A1B2-C3D4"
                className="input-field pr-10"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="btn-ghost">
              Cancel
            </button>

            <button
              ref={submitRef}
              disabled={!inviteCode.trim() || isLoading}
              onMouseDown={(e) => triggerRipple(e)}
              onClick={handleSubmit}
              className={`btn-primary flex items-center gap-2 jw-shimmer ${
                (!inviteCode.trim() || isLoading)
                  ? "opacity-50 cursor-not-allowed"
                  : ""
              }`}
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

        </div>
      </div>
    </div>
  );
}
