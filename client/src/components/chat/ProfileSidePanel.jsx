import { useEffect, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  MessageSquare,
  Headphones,
  MoreHorizontal,
  Mail,
  Building2,
  Shield,
  Clock,
  Copy,
  ExternalLink,
  Hash,
} from "lucide-react";
import { useChannelStore } from "../../stores/channelStore";
import { useChatStore } from "../../stores/chatStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useAuthStore } from "../../stores/authStore";
import { usePresenceStore } from "../../stores/presenceStore";
import { getDMPath } from "../../utils/chatRoutes";
import toast from "react-hot-toast";

const STATUS_META = {
  online: {
    color: "var(--status-online)",
    label: "Active now",
    bg: "rgba(34,197,94,0.1)",
    border: "rgba(34,197,94,0.25)",
    text: "var(--accent-green)",
  },
  away: {
    color: "var(--status-away)",
    label: "Away",
    bg: "rgba(234,179,8,0.1)",
    border: "rgba(234,179,8,0.25)",
    text: "var(--accent-yellow)",
  },
  dnd: {
    color: "var(--status-dnd)",
    label: "Do Not Disturb",
    bg: "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.25)",
    text: "var(--accent-red)",
  },
  offline: {
    color: "var(--status-offline)",
    label: "Offline",
    bg: "rgba(113,113,122,0.1)",
    border: "rgba(113,113,122,0.25)",
    text: "var(--text-muted)",
  },
};

export default function ProfileSidePanel({ user, onClose }) {
  const navigate = useNavigate();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const currentUser = useAuthStore((s) => s.user);
  const presenceMap = usePresenceStore((s) => s.presence);
  const [showMore, setShowMore] = useState(false);
  const [sendingDM, setSendingDM] = useState(false);

  const userId = user?._id || user?.userId;
  const liveStatus = presenceMap[userId] || presenceMap[user?.flowTaskUserId] || presenceMap[user?.chatUserId] || user?.onlineStatus || "offline";
  const isCurrentUser = userId === currentUser?._id;
  const statusMeta = STATUS_META[liveStatus] || STATUS_META.offline;

  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    if (!showMore) return;
    const h = () => setShowMore(false);
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, [showMore]);

  const handleMessage = useCallback(async () => {
    if (!userId || !workspaceId || sendingDM || isCurrentUser) return;
    setSendingDM(true);
    try {
      const channel = await useChannelStore.getState().createDM(userId);
      if (channel?._id) {
        navigate(getDMPath(workspaceId, channel._id));
        onClose();
      }
    } finally {
      setSendingDM(false);
    }
  }, [userId, workspaceId, sendingDM, isCurrentUser, navigate, onClose]);

  const handleCopyEmail = useCallback(() => {
    if (!user?.email) return;
    navigator.clipboard.writeText(user.email);
    toast.success("Email copied", { duration: 1500 });
    setShowMore(false);
  }, [user?.email]);

  if (!user) return null;

  const name = user.name || user.displayName || "Unknown User";
  const avatar = user.avatar || user.profilePicture;
  const title = user.title || "";
  const role = user.role || "member";
  const email = user.email;
  const department = user.departmentNames?.length
    ? user.departmentNames.join(", ")
    : typeof user.department === "string"
      ? user.department
      : null;
  const sharedChannels = user.sharedChannels || [];

  return (
    <div
      className="profile-panel"
      style={{
        animation: "ppSlideIn 0.28s cubic-bezier(0.34,1.2,0.64,1)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          height: "var(--header-height)",
          flexShrink: 0,
          borderBottom: "1px solid var(--border-secondary)",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-muted)",
          }}
        >
          Profile
        </span>
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
          <X size={14} />
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Hero banner + avatar */}
        <div
          style={{
            position: "relative",
            padding: "28px 20px 20px",
            textAlign: "center",
            overflow: "hidden",
          }}
        >
          {/* Animated gradient banner */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 72,
              // background: 'linear-gradient(135deg,#7c3aed,#1264a3,#059669)',
              backgroundSize: "300% 300%",
              animation: "ppGradShift 5s ease infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 40,
              left: 0,
              right: 0,
              height: 32,
              // background: 'linear-gradient(to bottom, transparent, var(--bg-primary))',
            }}
          />

          {/* Spinning avatar ring */}
          <div
            style={{
              position: "relative",
              display: "inline-block",
              width: 88,
              height: 88,
              marginTop: 12,
              animation: "ppAvatarIn .45s cubic-bezier(.34,1.3,.64,1) .1s both",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: -3,
                borderRadius: "50%",
                background:
                  "conic-gradient(from 0deg,#7c3aed,#1264a3,#059669,#7c3aed)",
                animation: "ppSpinRing 5s linear infinite",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 2,
                borderRadius: "50%",
                background: "var(--bg-primary)",
              }}
            />
            <div
              style={{
                position: "relative",
                zIndex: 1,
                width: "100%",
                height: "100%",
                borderRadius: "50%",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                fontWeight: 800,
                color: "var(--text-white)",
                background: "linear-gradient(135deg,#7c3aed,#1264a3)",
              }}
            >
              {avatar ? (
                <img
                  src={avatar}
                  alt={name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                name.charAt(0).toUpperCase()
              )}
            </div>
            {/* Status dot */}
            <span
              style={{
                position: "absolute",
                bottom: 3,
                right: 3,
                zIndex: 2,
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: statusMeta.color,
                border: "2.5px solid var(--bg-primary)",
                animation:
                  liveStatus === "online"
                    ? "ppPulse 2.5s ease infinite"
                    : "none",
              }}
            />
          </div>

          {/* Name & title */}
          <h2
            style={{
              fontSize: 17,
              fontWeight: 800,
              color: "var(--text-white)",
              marginTop: 10,
              animation: "ppFadeUp .35s ease .15s both",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {name}
            {isCurrentUser && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 400,
                  color: "var(--text-muted)",
                  background: "var(--bg-hover)",
                  padding: "1px 7px",
                  borderRadius: 20,
                }}
              >
                you
              </span>
            )}
          </h2>
          {title && (
            <p
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginTop: 3,
                animation: "ppFadeUp .35s ease .2s both",
              }}
            >
              {title}
            </p>
          )}

          {/* Status pill */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 10,
              padding: "5px 12px",
              borderRadius: 20,
              background: statusMeta.bg,
              border: `1px solid ${statusMeta.border}`,
              animation: "ppFadeUp .35s ease .25s both",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: statusMeta.color,
                display: "inline-block",
              }}
            />
            <span
              style={{ fontSize: 12, fontWeight: 600, color: statusMeta.text }}
            >
              {statusMeta.label}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        {!isCurrentUser && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "0 16px 20px",
              animation: "ppFadeUp .35s ease .3s both",
            }}
          >
            <button
              onClick={handleMessage}
              disabled={sendingDM}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "9px 18px",
                borderRadius: 10,
                border: "none",
                background: "linear-gradient(135deg,#7c3aed,#1264a3)",
                color: "var(--text-white)",
                fontSize: 13,
                fontWeight: 700,
                cursor: sendingDM ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                opacity: sendingDM ? 0.7 : 1,
                transition: "transform 150ms, box-shadow 150ms",
                boxShadow: "0 3px 14px rgba(124,58,237,0.38)",
              }}
              onMouseEnter={(e) => {
                if (!sendingDM) {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow =
                    "0 6px 20px rgba(124,58,237,0.5)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "none";
                e.currentTarget.style.boxShadow =
                  "0 3px 14px rgba(124,58,237,0.38)";
              }}
            >
              <MessageSquare size={14} />
              {sendingDM ? "Opening…" : "Message"}
            </button>

            <button
              disabled
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "9px 14px",
                borderRadius: 10,
                background: "var(--bg-card)",
                border: "1px solid var(--border-primary)",
                color: "var(--text-secondary)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "not-allowed",
                fontFamily: "inherit",
                opacity: 0.55,
              }}
              title="Huddle coming soon"
            >
              <Headphones size={14} />
              Huddle
            </button>

            {/* More dropdown */}
            <div style={{ position: "relative" }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMore((s) => !s);
                }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  cursor: "pointer",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-primary)",
                  color: "var(--text-secondary)",
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
                  e.currentTarget.style.background = "var(--bg-card)";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                <MoreHorizontal size={15} />
              </button>
              {showMore && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 6px)",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-secondary)",
                    borderRadius: 12,
                    boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
                    minWidth: 190,
                    zIndex: 50,
                    overflow: "hidden",
                    animation: "ppFadeUp 0.15s ease",
                  }}
                >
                  {email && (
                    <DropdownItem
                      icon={<Copy size={13} />}
                      onClick={handleCopyEmail}
                    >
                      Copy email address
                    </DropdownItem>
                  )}
                  {/* <DropdownItem
                    icon={<ExternalLink size={13} />}
                    onClick={() => setShowMore(false)}
                  >
                    View in FlowTask
                  </DropdownItem> */}
                </div>
              )}
            </div>
          </div>
        )}

        <div
          style={{
            height: 1,
            background: "var(--border-secondary)",
            margin: "0 16px",
          }}
        />

        {/* Contact section */}
        <InfoSection label="Contact">
          <InfoRow
            icon={<Mail size={14} />}
            iconBg="rgba(18,100,163,0.15)"
            iconColor="#60a5fa"
            label="Email"
            value={email}
            delay="0.1s"
          />
          <InfoRow
            icon={<Shield size={14} />}
            iconBg="rgba(124,58,237,0.15)"
            iconColor="#a78bfa"
            label="Role"
            delay="0.17s"
            value={
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {role.charAt(0).toUpperCase() + role.slice(1)}
                {/* <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "1px 7px",
                    borderRadius: 20,
                    background: "rgba(124,58,237,0.18)",
                    color: "var(--accent-purple)",
                  }}
                > */}
                  {/* {role} */}
                {/* </span> */}
              </span>
            }
          />
          {department && (
            <InfoRow
              icon={<Building2 size={14} />}
              iconBg="rgba(5,150,105,0.15)"
              iconColor="#34d399"
              label="Department"
              value={department}
              delay="0.24s"
            />
          )}
          {user.lastSeen && (
            <InfoRow
              icon={<Clock size={14} />}
              iconBg="rgba(234,179,8,0.12)"
              iconColor="#fbbf24"
              label="Last Active"
              value={formatLastSeen(user.lastSeen)}
              delay="0.31s"
            />
          )}
        </InfoSection>

        {/* Shared channels */}
        {sharedChannels.length > 0 && (
          <>
            <div
              style={{
                height: 1,
                background: "var(--border-secondary)",
                margin: "0 16px",
              }}
            />
            <InfoSection label="Shared Channels">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {sharedChannels.slice(0, 3).map((ch) => (
                  <span
                    key={ch}
                    style={{
                      fontSize: 12,
                      padding: "4px 10px",
                      borderRadius: 8,
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-primary)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    # {ch}
                  </span>
                ))}
                {sharedChannels.length > 3 && (
                  <span
                    style={{
                      fontSize: 12,
                      padding: "4px 10px",
                      borderRadius: 8,
                      background: "rgba(124,58,237,0.12)",
                      border: "1px solid rgba(124,58,237,0.25)",
                      color: "var(--accent-purple)",
                      fontWeight: 600,
                    }}
                  >
                    +{sharedChannels.length - 3} more
                  </span>
                )}
              </div>
            </InfoSection>
          </>
        )}

        {/* Footer */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--border-secondary)",
            marginTop: 8,
          }}
        >
          <p
            style={{
              textAlign: "center",
              fontSize: 11,
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "#22c55e",
                display: "inline-block",
                animation: "ppPulse 2s ease infinite",
              }}
            />
            Profile information is synced from FlowTask{" "}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes ppSlideIn  { from{opacity:0;transform:translateX(24px)} to{opacity:1;transform:translateX(0)} }
        @keyframes ppFadeUp   { from{opacity:0;transform:translateY(8px)}  to{opacity:1;transform:translateY(0)} }
        @keyframes ppAvatarIn { from{opacity:0;transform:scale(.88)}        to{opacity:1;transform:scale(1)}      }
        @keyframes ppSpinRing { from{transform:rotate(0deg)}                to{transform:rotate(360deg)}          }
        @keyframes ppPulse    { 0%,100%{opacity:1} 50%{opacity:.4}                                               }
        @keyframes ppGradShift{
          0%  {background-position:0% 50%}
          50% {background-position:100% 50%}
          100%{background-position:0% 50%}
        }
      `}</style>
    </div>
  );
}

function InfoSection({ label, children }) {
  return (
    <div style={{ padding: "16px 16px 8px" }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        {label}
        <span
          style={{
            flex: 1,
            height: 1,
            background: "var(--border-secondary)",
            display: "block",
          }}
        />
      </div>
      {children}
    </div>
  );
}

function InfoRow({ icon, iconBg, iconColor, label, value, delay = "0s" }) {
  if (!value) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 10px",
        borderRadius: 10,
        marginBottom: 4,
        transition: "background 120ms",
        cursor: "default",
        animation: `ppFadeUp 0.35s ease ${delay} both`,
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--bg-hover)")
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: iconBg,
          color: iconColor,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--text-muted)",
            margin: 0,
          }}
        >
          {label}
        </p>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-primary)",
            marginTop: 2,
            wordBreak: "break-all",
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function DropdownItem({ icon, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 14px",
        border: "none",
        background: "transparent",
        color: "var(--text-secondary)",
        fontSize: 13,
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
        transition: "background 120ms, color 120ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-hover)";
        e.currentTarget.style.color = "var(--text-white)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--text-secondary)";
      }}
    >
      {icon}
      {children}
    </button>
  );
}

function formatLastSeen(dateStr) {
  const d = new Date(dateStr),
    now = new Date(),
    diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}
