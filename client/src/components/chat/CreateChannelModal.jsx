import { useState } from "react";
import { useChannelStore } from "../../stores/channelStore";
import { X, Globe, Lock, Plus, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

export default function CreateChannelModal({ onClose }) {
  const { createChannel } = useChannelStore();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [descFocused, setDescFocused] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || name.trim().length < 2) {
      toast.error("Channel name must be at least 2 characters");
      return;
    }
    setIsSubmitting(true);
    try {
      const channel = await createChannel({
        name: name.trim(),
        description: description.trim(),
        visibility,
      });
      const displayName =
        visibility === "private" ? channel.name : `#${channel.name}`;
      toast.success(`Channel ${displayName} created!`);
      onClose();
    } catch (error) {
      toast.error(
        error.response?.data?.error?.message || "Failed to create channel",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const slugPreview = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);

  const isPublic = visibility === "public";

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-content w-full max-w-md mx-4"
        style={{
          borderRadius: 20,
          padding: 0,
          overflow: "hidden",
          position: "relative",
          animation: "ccModalIn 320ms cubic-bezier(0.34,1.56,0.64,1)",
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.06), 0 32px 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* Animated rainbow top bar */}
        <div
          style={{
            height: 3,
            width: "100%",
            background: "linear-gradient(90deg,black)",
            backgroundSize: "300% 100%",
            animation: "ccGradientShift 4s ease infinite",
          }}
        />

        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--border-secondary)" }}
        >
          {/* Spinning ring icon */}
          <div
            style={{
              position: "relative",
              width: 44,
              height: 44,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                background: "conic-gradient(from 0deg,black)",
                animation: "ccSpinRing 4s linear infinite",
                opacity: 0.7,
              }}
            />
            <div
              style={{
                position: "relative",
                zIndex: 1,
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "var(--bg-modal)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isPublic ? (
                <Globe size={18} style={{ color: "#34d399" }} />
              ) : (
                <Lock size={18} style={{ color: "#1db9ce" }} />
              )}
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <h2
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--text-white)",
              }}
            >
              Create a channel
            </h2>
            <p
              style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}
            >
              Channels are where your team communicates
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 120ms, color 120ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
              e.currentTarget.style.color = "var(--text-white)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div
            style={{
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            {/* Channel Name */}
            <div
              style={{
                animation: "ccFieldSlide 350ms ease both",
                animationDelay: "80ms",
              }}
            >
              <FieldLabel
                color="linear-gradient(135deg,#7c3aed,#1264a3)"
                text="Channel Name"
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "var(--bg-input)",
                  border: `1px solid ${nameFocused ? "#1985c4" : "var(--border-primary)"}`,
                  borderRadius: 12,
                  padding: "11px 14px",
                  boxShadow: nameFocused
                    ? "0 0 0 3px rgba(30, 156, 240, 0.18), 0 0 20px rgba(19, 142, 199, 0.08)"
                    : "none",
                  transition: "border-color 180ms, box-shadow 180ms",
                }}
              >
                {isPublic ? (
                  <Globe
                    size={15}
                    style={{ color: "var(--text-muted)", flexShrink: 0 }}
                  />
                ) : (
                  <Lock
                    size={15}
                    style={{ color: "var(--text-muted)", flexShrink: 0 }}
                  />
                )}
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    let value = e.target.value;
                    setName(value.replace(/\s{2,}/g, " "));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === " " && name.endsWith(" ")) e.preventDefault();
                  }}
                  onFocus={() => setNameFocused(true)}
                  onBlur={() => setNameFocused(false)}
                  placeholder="e.g. marketing-team"
                  maxLength={80}
                  autoFocus
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--text-primary)",
                    fontSize: 14,
                    fontFamily: "inherit",
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 7,
                  alignItems: "center",
                }}
              >
                {slugPreview ? (
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      background: "var(--bg-hover)",
                      borderRadius: 6,
                      padding: "2px 8px",
                      fontFamily: "monospace",
                    }}
                  >
                    slug:{" "}
                    <span
                      style={{
                        background: "linear-gradient(90deg,#7c3aed,#1264a3)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                        fontWeight: 700,
                      }}
                    >
                      {isPublic ? "#" : ""}
                      {slugPreview}
                    </span>
                  </span>
                ) : (
                  <span />
                )}
                <span className="cw-char-count cw-mono">
                  {name.replace(/\s/g, "").length}&nbsp;/&nbsp;80
                </span>
              </div>
            </div>

            {/* Description */}
            <div
              style={{
                animation: "ccFieldSlide 350ms ease both",
                animationDelay: "160ms",
              }}
            >
              <FieldLabel
                color="linear-gradient(135deg,#1264a3,#059669)"
                text="Description"
                suffix={
                  <span
                    style={{
                      fontWeight: 400,
                      opacity: 0.55,
                      textTransform: "none",
                      letterSpacing: 0,
                      fontSize: 11,
                    }}
                  >
                    (optional)
                  </span>
                }
              />
              <div
                style={{
                  background: "var(--bg-input)",
                  border: `1px solid ${descFocused ? "#1264a3" : "var(--border-primary)"}`,
                  borderRadius: 12,
                  overflow: "hidden",
                  boxShadow: descFocused
                    ? "0 0 0 3px rgba(18,100,163,0.18), 0 0 20px rgba(18,100,163,0.08)"
                    : "none",
                  transition: "border-color 180ms, box-shadow 180ms",
                }}
              >
                <textarea
                  value={description}
                  onChange={(e) => {
                    let value = e.target.value;
                    setDescription(value.replace(/\s{2,}/g, " "));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === " " && name.endsWith(" ")) e.preventDefault();
                  }}
                  onFocus={() => setDescFocused(true)}
                  onBlur={() => setDescFocused(false)}
                  placeholder="What is this channel about?"
                  maxLength={500}
                  rows={2}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    fontFamily: "inherit",
                    resize: "none",
                    padding: "11px 14px",
                    lineHeight: 1.55,
                  }}
                />
              </div>
            </div>

            {/* Visibility */}
            <div
              style={{
                animation: "ccFieldSlide 350ms ease both",
                animationDelay: "240ms",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <FieldLabel
                  color="linear-gradient(135deg,#059669,#1264a3)"
                  text="Visibility"
                  noMargin
                />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 20,
                    background: "rgba(21, 205, 238, 0.15)",
                    color: "#40a3e6",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    animation: "ccBadgePulse 2s infinite",
                  }}
                >
                  Required
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <VisibilityCard
                  icon={<Globe size={17} />}
                  label="Public"
                  desc="Anyone in the workspace can view and join"
                  tag="Open"
                  tagColor="rgba(29,158,117,0.15)"
                  tagText="#34d399"
                  accentColor="#1d9e75"
                  accentBg="rgba(29,158,117,0.1)"
                  accentBg2="rgba(29,158,117,0.18)"
                  checkGradient="linear-gradient(135deg,#059669,#1d9e75)"
                  iconColor="#1d9e75"
                  selected={visibility === "public"}
                  onSelect={() => setVisibility("public")}
                />
                <VisibilityCard
                  icon={<Lock size={17} />}
                  label="Private"
                  desc="Only invited members can access"
                  tag="Invite only"
                  tagColor="rgba(20, 159, 184, 0.15)"
                  tagText="#48b1be"
                  accentColor="#78ccee"
                  accentBg="rgba(16, 141, 179, 0.1)"
                  accentBg2="rgba(16, 40, 148, 0.18)"
                  checkGradient="linear-gradient(135deg,#78ccee)"
                  iconColor="#1a93e4"
                  selected={visibility === "private"}
                  onSelect={() => setVisibility("private")}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "16px 20px 20px",
              borderTop: "1px solid var(--border-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: 5 }}
            ></div>

            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={onClose} className="btn-ghost">
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  !name.trim() || name.trim().length < 2 || isSubmitting
                }
                style={{
                  padding: "9px 20px",
                  borderRadius: 10,
                  border: "none",
                  background: "linear-gradient(135deg,#1a93e4)",
                  backgroundSize: "200% 100%",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  transition:
                    "transform 150ms, box-shadow 150ms, opacity 150ms",
                  boxShadow: "0 4px 16px rgba(20, 81, 160, 0.4)",
                  opacity:
                    !name.trim() || name.trim().length < 2 || isSubmitting
                      ? 0.4
                      : 1,
                }}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow =
                      "0 8px 24px rgba(21, 109, 190, 0.5)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 16px rgba(24, 150, 223, 0.4)";
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Creating...
                  </>
                ) : (
                  <>
                    <Plus size={14} /> Create Channel
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes ccModalIn {
          from { opacity:0; transform:scale(0.9) translateY(20px); }
          to   { opacity:1; transform:scale(1) translateY(0); }
        }
        @keyframes ccGradientShift {
          0%   { background-position:0% 50%; }
          50%  { background-position:100% 50%; }
          100% { background-position:0% 50%; }
        }
        @keyframes ccSpinRing {
          from { transform:rotate(0deg); }
          to   { transform:rotate(360deg); }
        }
        @keyframes ccFieldSlide {
          from { opacity:0; transform:translateY(10px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes ccDotBounce {
          0%,100% { transform:translateY(0); }
          50%     { transform:translateY(-4px); }
        }
        @keyframes ccBadgePulse {
          0%,100% { box-shadow:0 0 0 0 rgba(28, 74, 226, 0.4); }
          50%     { box-shadow:0 0 0 6px rgba(17, 146, 231, 0); }
        }
        @keyframes ccCheckPop {
          from { opacity:0; transform:scale(0) rotate(-90deg); }
          to   { opacity:1; transform:scale(1) rotate(0deg); }
        }
      `}</style>
    </div>
  );
}

function FieldLabel({ color, text, suffix, noMargin }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        color: "var(--text-secondary)",
        marginBottom: noMargin ? 0 : 8,
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      {text}
      {suffix}
    </div>
  );
}

function VisibilityCard({
  icon,
  label,
  desc,
  tag,
  tagColor,
  tagText,
  accentColor,
  accentBg,
  accentBg2,
  checkGradient,
  iconColor,
  selected,
  onSelect,
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <label
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "13px 14px",
        borderRadius: 14,
        cursor: "pointer",
        border: `1px solid ${selected ? accentColor : "var(--border-secondary)"}`,
        background: selected ? accentBg : "transparent",
        position: "relative",
        overflow: "hidden",
        transition: "border-color 200ms, background 200ms, transform 150ms",
        transform: !selected && hovered ? "translateX(3px)" : "translateX(0)",
      }}
    >
      <input
        type="radio"
        name="visibility"
        value={label.toLowerCase()}
        checked={selected}
        onChange={onSelect}
        style={{ display: "none" }}
      />

      {/* Left accent bar */}
      {selected && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background: accentColor,
            borderRadius: 0,
          }}
        />
      )}

      {/* Glow orb */}
      <div
        style={{
          position: "absolute",
          top: -20,
          right: -20,
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: accentColor,
          opacity: selected ? 0.12 : 0,
          filter: "blur(28px)",
          transition: "opacity 300ms",
          pointerEvents: "none",
        }}
      />

      {/* Icon */}
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: selected ? accentBg2 : "var(--bg-hover)",
          transition: "background 200ms",
        }}
      >
        <div style={{ color: selected ? iconColor : "var(--text-muted)" }}>
          {icon}
        </div>
      </div>

      {/* Copy */}
      <div style={{ flex: 1 }}>
        <p
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-white)",
            margin: 0,
          }}
        >
          {label}
        </p>
        <p
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            margin: "2px 0 0",
          }}
        >
          {desc}
        </p>
      </div>

      {/* Tag pill */}
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          padding: "2px 8px",
          borderRadius: 20,
          background: tagColor,
          color: tagText,
          letterSpacing: "0.04em",
          flexShrink: 0,
        }}
      >
        {tag}
      </span>

      {/* Animated check */}
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: checkGradient,
          opacity: selected ? 1 : 0,
          transform: selected
            ? "scale(1) rotate(0deg)"
            : "scale(0) rotate(-90deg)",
          transition: "opacity 200ms, transform 280ms ",
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    </label>
  );
}
