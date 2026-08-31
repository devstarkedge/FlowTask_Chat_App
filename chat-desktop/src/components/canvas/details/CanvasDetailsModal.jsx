import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Share2, History, Users, Eye, Lock, Globe } from "lucide-react";
import { useAuthStore } from "../../../stores/authStore";
import { useCanvasStore } from "../../../stores/canvasStore";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeTime(value) {
  if (!value) return "—";
  const now = Date.now();
  const diff = now - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

function extractUserId(field) {
  if (!field) return null;
  if (typeof field === "object" && field._id) return field._id.toString();
  return field.toString();
}

function getCanvasRole(canvas, currentUser) {
  if (!canvas || !currentUser) return null;
  const userId = currentUser._id?.toString();
  if (!userId) return null;

  const createdById = extractUserId(canvas.createdBy);
  if (createdById === userId) return "owner";

  const users = canvas.permissions?.users || [];
  const userPerm = users.find((u) => u.userId?.toString() === userId);
  if (userPerm && userPerm.role === "editor") return "editor";
  if (canvas.permissions?.accessLevel === "edit") return "editor";

  if (userPerm && userPerm.role === "viewer") return "viewer";
  const legacyIds = canvas.permissions?.allowedUserIds || [];
  if (legacyIds.some((id) => id.toString() === userId)) return "viewer";
  if (canvas.permissions?.accessLevel === "view") return "viewer";

  const visibility = canvas.permissions?.visibility || "channel";
  if (visibility === "channel" || visibility === "workspace") return "viewer";

  return null;
}

function getOwnerInfo(canvas, currentUser) {
  const createdBy = canvas?.createdBy;
  if (!createdBy) return { name: "Unknown", avatar: null };

  if (typeof createdBy === "object") {
    const name = createdBy.name || null;
    const avatar = createdBy.avatar || null;
    if (name) return { name, avatar };
    if (currentUser && createdBy._id?.toString() === currentUser._id?.toString()) {
      return { name: currentUser.name || "You", avatar: currentUser.avatar || null };
    }
    return { name: "Unknown", avatar: null };
  }

  const createdById = createdBy.toString();
  if (currentUser && createdById === currentUser._id?.toString()) {
    return { name: currentUser.name || "You", avatar: currentUser.avatar || null };
  }

  return { name: "Unknown", avatar: null };
}

function getAccessLevel(canvas) {
  const perm = canvas?.permissions;
  if (!perm) return "Channel access";
  if (perm.accessLevel === "invite_only") return "Invite only";
  if (perm.accessLevel === "edit") return "Channel can edit";
  if (perm.accessLevel === "view") return "Channel can view";
  const visibility = perm.visibility;
  if (visibility === "workspace") return "Workspace access";
  if (visibility === "channel") return "Channel access";
  return "Channel access";
}

function getVisibilityIcon(canvas) {
  const perm = canvas?.permissions;
  if (!perm || perm.accessLevel === "invite_only") return <Lock size={13} />;
  if (perm.visibility === "workspace") return <Globe size={13} />;
  return <Eye size={13} />;
}

// ── Styles ────────────────────────────────────────────────────────────────
const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 2000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.6)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    animation: "canvasFadeIn 0.15s ease-out",
  },
  modal: {
    background: "var(--bg-primary, #fff)",
    borderRadius: 12,
    width: 520,
    maxWidth: "95vw",
    maxHeight: "min(88vh, 720px)",
    overflow: "hidden",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
    display: "flex",
    flexDirection: "column",
    animation: "canvasSlideUp 0.15s ease-out",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: "20px 24px 10px",
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: 700,
    margin: 0,
    color: "var(--text-primary)",
    lineHeight: 1.3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  subtitle: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  closeBtn: {
    background: "none",
    border: "none",
    padding: 6,
    cursor: "pointer",
    color: "var(--text-muted)",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.1s",
    flexShrink: 0,
    marginLeft: 12,
  },
  body: {
    flex: 1,
    overflowY: "auto",
    padding: "0 24px 20px",
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    margin: "0 0 8px",
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "7px 0",
    borderBottom: "1px solid var(--border-primary, rgba(0,0,0,0.06))",
  },
  rowLabel: {
    fontSize: 13,
    color: "var(--text-muted)",
    fontWeight: 500,
  },
  rowValue: {
    fontSize: 13,
    color: "var(--text-primary)",
    fontWeight: 500,
    textAlign: "right",
    maxWidth: "60%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ownerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  ownerAvatar: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    objectFit: "cover",
    flexShrink: 0,
  },
  ownerInitials: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    background: "var(--accent-primary, #3b82f6)",
    color: "#fff",
    fontSize: 10,
    fontWeight: 700,
  },
  ownerName: {
    fontSize: 13,
    color: "var(--text-primary)",
    fontWeight: 500,
  },
  youBadge: {
    fontSize: 11,
    color: "var(--accent-primary, #3b82f6)",
    fontWeight: 600,
    marginLeft: 4,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 10px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 500,
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
  },
  versionCount: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 10px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 500,
    background: "rgba(59,130,246,0.08)",
    color: "var(--accent-primary, #3b82f6)",
  },
  collaboratorCount: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 10px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 500,
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
  },
  shareBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 20px",
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
    background: "var(--accent-primary, #3b82f6)",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "background 0.15s",
    marginTop: 4,
  },
  canvasId: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontFamily: "monospace",
    background: "var(--bg-secondary)",
    padding: "2px 8px",
    borderRadius: 4,
    border: "1px solid var(--border-primary)",
  },
};

function getInitials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function CanvasDetailsModal({ canvas, onClose, onOpenShareModal, historyCount }) {
  const user = useAuthStore((s) => s.user);
  const fetchHistory = useCanvasStore((s) => s.fetchHistory);

  const role = getCanvasRole(canvas, user);
  const ownerInfo = getOwnerInfo(canvas, user);
  const isOwner = role === "owner";
  const accessLevelLabel = getAccessLevel(canvas);
  const collaborators = canvas?.permissions?.users || [];
  const collaboratorCount = collaborators.length;
  const viewCount = canvas?.viewCount || 0;

  // Fetch history count if not provided
  const [resolvedHistoryCount, setResolvedHistoryCount] = useState(historyCount ?? null);
  useEffect(() => {
    if (historyCount !== undefined) {
      setResolvedHistoryCount(historyCount);
      return;
    }
    if (!canvas?._id) return;
    let cancelled = false;
    fetchHistory(canvas._id).then((h) => {
      if (!cancelled) setResolvedHistoryCount(h?.length ?? 0);
    }).catch(() => {
      if (!cancelled) setResolvedHistoryCount(0);
    });
    return () => { cancelled = true; };
  }, [canvas?._id, historyCount, fetchHistory]);

  const versionLabel = useMemo(() => {
    const count = resolvedHistoryCount ?? 0;
    return `${count} version${count === 1 ? "" : "s"}`;
  }, [resolvedHistoryCount]);

  // Close on Escape
  useEffect(() => {
    if (!canvas) return;
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, canvas]);

  if (!canvas) return null;

  return createPortal(
    <div
      style={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <h2 style={styles.title}>{canvas.title || "Untitled canvas"}</h2>
            <p style={styles.subtitle}>
              {canvas.type === "notes" ? "Notes" : canvas.type || "Canvas"}
            </p>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {/* Owner */}
          <div style={styles.section}>
            <div style={styles.row}>
              <span style={styles.rowLabel}>Owned by</span>
              <div style={styles.ownerRow}>
                {ownerInfo.avatar ? (
                  <img src={ownerInfo.avatar} alt={ownerInfo.name} style={styles.ownerAvatar} />
                ) : (
                  <span style={styles.ownerInitials}>{getInitials(ownerInfo.name)}</span>
                )}
                <span style={styles.ownerName}>
                  {ownerInfo.name}
                  {isOwner && <span style={styles.youBadge}>(you)</span>}
                </span>
              </div>
            </div>
          </div>

          {/* Dates */}
          <div style={styles.section}>
            <div style={styles.row}>
              <span style={styles.rowLabel}>Created</span>
              <span style={styles.rowValue}>{formatDate(canvas.createdAt)}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.rowLabel}>Last updated</span>
              <span style={styles.rowValue}>{formatRelativeTime(canvas.updatedAt)}</span>
            </div>
          </div>

          {/* Meta badges */}
          <div style={styles.section}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
              <span style={styles.versionCount}>
                <History size={13} />
                {versionLabel}
              </span>
              <span style={styles.collaboratorCount}>
                <Users size={13} />
                {collaboratorCount > 0
                  ? `${collaboratorCount} ${collaboratorCount === 1 ? "person" : "people"}`
                  : "No collaborators"}
              </span>
              <span style={styles.badge}>
                {getVisibilityIcon(canvas)}
                {accessLevelLabel}
              </span>
              {viewCount > 0 && (
                <span style={styles.badge}>
                  <Eye size={13} />
                  Viewed by {viewCount}
                </span>
              )}
            </div>
          </div>

          {/* Share button */}
          <div style={{ marginTop: 8 }}>
            <button style={styles.shareBtn} onClick={onOpenShareModal}>
              <Share2 size={14} />
              Share canvas
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}