import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Link2, Lock, ChevronDown, Check, Eye, Pencil, UserPlus } from "lucide-react";
import toast from "react-hot-toast";
import { useChannelStore } from "../../stores/channelStore";
import { useCanvasStore } from "../../stores/canvasStore";
import { getSocket } from "../../services/socket";

const EMPTY_MEMBERS = [];

const ACCESS_LEVELS = [
  {
    value: "invite_only",
    label: "Invite only",
    desc: "Only people you add can view or edit",
    icon: Lock,
    color: "#ef4444",
  },
  {
    value: "view",
    label: "Can view",
    desc: "Everyone in this channel can view, but not edit",
    icon: Eye,
    color: "#f59e0b",
  },
  {
    value: "edit",
    label: "Can edit",
    desc: "Everyone in this channel can view and edit",
    icon: Pencil,
    color: "#10b981",
  },
];

const ROLE_OPTIONS = [
  { value: "viewer", label: "Can view" },
  { value: "editor", label: "Can edit" },
];

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
    width: 480,
    maxWidth: "95vw",
    maxHeight: "min(85vh, 660px)",
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
  },
  title: {
    fontSize: 17,
    fontWeight: 700,
    margin: 0,
    color: "var(--text-primary)",
    lineHeight: 1.3,
  },
  subtitle: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: 380,
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
  },
  closeBtnHover: {
    background: "var(--bg-hover)",
    color: "var(--text-primary)",
  },
  // Access level pills
  accessRow: {
    display: "flex",
    gap: 8,
    padding: "8px 24px 16px",
    flexShrink: 0,
  },
  accessBtn: (isActive) => ({
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    background: isActive ? "rgba(59,130,246,0.06)" : "var(--bg-secondary)",
    border: `2px solid ${isActive ? "var(--accent-primary, #3b82f6)" : "transparent"}`,
    borderRadius: 10,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
    fontSize: 12,
    color: "var(--text-primary)",
    transition: "all 0.12s ease",
    position: "relative",
  }),
  accessBtnIcon: (isActive, color) => ({
    flexShrink: 0,
    color: isActive ? "var(--accent-primary, #3b82f6)" : "var(--text-muted)",
  }),
  accessBtnText: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
  },
  accessBtnLabel: {
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.3,
  },
  accessBtnDesc: {
    fontSize: 10,
    color: "var(--text-muted)",
    lineHeight: 1.3,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  accessCheck: {
    color: "var(--accent-primary, #3b82f6)",
    flexShrink: 0,
    marginLeft: "auto",
  },
  searchWrap: {
    padding: "0 24px 12px",
    flexShrink: 0,
  },
  searchInput: {
    width: "100%",
    padding: "10px 14px",
    fontSize: 14,
    border: "1px solid var(--border-primary)",
    borderRadius: 10,
    background: "var(--bg-secondary)",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
    transition: "border-color 0.12s, box-shadow 0.12s",
    color: "var(--text-primary)",
  },
  section: {
    padding: "0 24px",
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    margin: "0 0 8px",
    flexShrink: 0,
  },
  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "20px 0",
    textAlign: "center",
  },
  peopleList: {
    flex: 1,
    overflowY: "auto",
    margin: "0 -24px",
    padding: "0 24px",
  },
  personRow: (isSelected) => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: isSelected ? "6px 8px" : "6px 0",
    margin: isSelected ? "0 -8px" : 0,
    borderRadius: 8,
    background: isSelected ? "rgba(59,130,246,0.06)" : "transparent",
    transition: "background 0.1s",
  }),
  personItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
    padding: "4px 8px",
    background: "none",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    textAlign: "left",
    fontFamily: "inherit",
    transition: "background 0.1s",
  },
  avatar: (name) => ({
    width: 28,
    height: 28,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    background: "var(--accent-primary, #3b82f6)",
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
    overflow: "hidden",
  }),
  avatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  personName: {
    flex: 1,
    color: "var(--text-primary)",
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  personCheck: {
    color: "var(--accent-primary, #3b82f6)",
    flexShrink: 0,
  },
  roleSelect: {
    fontSize: 12,
    padding: "4px 8px",
    border: "1px solid var(--border-primary)",
    borderRadius: 6,
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    cursor: "pointer",
    fontFamily: "inherit",
    outline: "none",
    flexShrink: 0,
    minWidth: 90,
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 24px",
    borderTop: "1px solid var(--border-primary)",
    flexShrink: 0,
    background: "var(--bg-primary)",
  },
  copyLink: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "none",
    border: "none",
    color: "var(--accent-primary, #3b82f6)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    padding: "6px 12px",
    borderRadius: 8,
    fontFamily: "inherit",
    transition: "all 0.1s",
  },
  doneBtn: {
    padding: "8px 24px",
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
    background: "var(--accent-primary, #3b82f6)",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "background 0.15s",
  },
  doneBtnDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
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

export default function CanvasShareModal({
  canvas,
  isOpen,
  onClose,
  channelId,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [userRoles, setUserRoles] = useState(new Map());
  const [currentAccessLevel, setCurrentAccessLevel] = useState("view");
  const [isSaving, setIsSaving] = useState(false);
  const searchRef = useRef(null);

  const members =
    useChannelStore((s) => s.membersByChannel[channelId]) ?? EMPTY_MEMBERS;
  const fetchMembers = useChannelStore((s) => s.fetchMembers);
  const updateCanvasMetadata = useCanvasStore((s) => s.updateCanvasMetadata);

  useEffect(() => {
    if (isOpen && channelId) {
      fetchMembers(channelId);
      // Focus search input when modal opens
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [isOpen, channelId, fetchMembers]);

  // Sync modal state when opening
  useEffect(() => {
    if (isOpen) {
      setCurrentAccessLevel(canvas?.permissions?.accessLevel || "view");
      const map = new Map();
      const permUsers = canvas?.permissions?.users || [];
      permUsers.forEach((entry) => {
        const uid = String(entry.userId?._id || entry.userId);
        if (uid) map.set(uid, entry.role || "viewer");
      });
      const legacyIds = canvas?.permissions?.allowedUserIds || [];
      legacyIds.forEach((id) => {
        const uid = String(id._id || id);
        if (uid && !map.has(uid)) map.set(uid, "viewer");
      });
      setUserRoles(map);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter((m) => m.name?.toLowerCase().includes(q));
  }, [members, searchQuery]);

  const toggleMember = useCallback((memberId) => {
    const uid = String(memberId);
    setUserRoles((prev) => {
      const next = new Map(prev);
      if (next.has(uid)) next.delete(uid);
      else next.set(uid, "viewer");
      return next;
    });
  }, []);

  const setMemberRole = useCallback((memberId, role) => {
    const uid = String(memberId);
    setUserRoles((prev) => {
      const next = new Map(prev);
      if (next.has(uid)) next.set(uid, role);
      return next;
    });
  }, []);

  const handleCopyLink = useCallback(() => {
    const canvasId = canvas?._id;
    const url = canvasId
      ? `${window.location.origin}/canvas/${canvasId}`
      : window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      toast.success("Link copied to clipboard");
    });
  }, [canvas]);

  const canvasId = canvas?._id;

  const handleAccessLevelChange = useCallback(
    async (newLevel) => {
      setCurrentAccessLevel(newLevel);
      if (canvasId) {
        try {
          await updateCanvasMetadata(canvasId, {
            permissions: { accessLevel: newLevel },
          });
          toast.success(
            `Permission updated to ${
              ACCESS_LEVELS.find((p) => p.value === newLevel)?.label
            }`
          );
        } catch {
          toast.error("Failed to update permissions");
        }
      }
    },
    [canvasId, updateCanvasMetadata]
  );

  const handleDone = useCallback(async () => {
    if (!canvasId) {
      onClose();
      return;
    }
    setIsSaving(true);
    try {
      const users = [];
      const targetUserIds = [];
      userRoles.forEach((role, userId) => {
        users.push({ userId, role });
        targetUserIds.push(userId);
      });

      const permissions = {
        accessLevel: currentAccessLevel,
        users,
        allowedUserIds: [...userRoles.keys()],
      };

      await updateCanvasMetadata(canvasId, { permissions });

      // Notify shared users via socket
      if (targetUserIds.length > 0) {
        const socket = getSocket();
        if (socket) {
          socket.emit("canvas:share:request", {
            canvasId,
            targetUserIds,
            roles: Object.fromEntries(userRoles),
          });
        }
      }

      toast.success("Sharing settings saved");
      onClose();
    } catch {
      toast.error("Failed to save sharing settings");
    } finally {
      setIsSaving(false);
    }
  }, [canvasId, currentAccessLevel, userRoles, updateCanvasMetadata, onClose]);

  if (!isOpen) return null;

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
            <h2 style={styles.title}>Share this canvas</h2>
            <p style={styles.subtitle}>{canvas?.title || "Untitled canvas"}</p>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Access Level Pills */}
        <div style={styles.accessRow}>
          {ACCESS_LEVELS.map((level) => {
            const Icon = level.icon;
            const isActive = currentAccessLevel === level.value;
            return (
              <button
                key={level.value}
                style={styles.accessBtn(isActive)}
                onClick={() => handleAccessLevelChange(level.value)}
                title={level.desc}
              >
                <Icon size={16} style={styles.accessBtnIcon(isActive)} />
                <div style={styles.accessBtnText}>
                  <span style={styles.accessBtnLabel}>{level.label}</span>
                </div>
                {isActive && <Check size={14} style={styles.accessCheck} />}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div style={styles.searchWrap}>
          <input
            ref={searchRef}
            type="text"
            placeholder="Add people..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
            onFocus={(e) => {
              e.target.style.borderColor = "var(--accent-primary, #3b82f6)";
              e.target.style.boxShadow =
                "0 0 0 3px rgba(59, 130, 246, 0.15)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "var(--border-primary)";
              e.target.style.boxShadow = "none";
            }}
          />
        </div>

        {/* People List */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>
            People with access{" "}
            {userRoles.size > 0 && (
              <span
                style={{
                  color: "var(--text-muted)",
                  fontWeight: 400,
                  textTransform: "none",
                  letterSpacing: 0,
                  marginLeft: 4,
                }}
              >
                ({userRoles.size})
              </span>
            )}
          </h3>
          <div style={styles.peopleList}>
            {filteredMembers.length === 0 ? (
              <div style={styles.empty}>
                {currentAccessLevel === "invite_only"
                  ? "Add people to share this canvas"
                  : "No members found"}
              </div>
            ) : (
              filteredMembers.map((member) => {
                const uid = String(member._id || member.userId);
                const isSelected = userRoles.has(uid);
                const currentRole = userRoles.get(uid) || "viewer";
                const avatarSrc = member.avatar;

                return (
                  <div key={uid} style={styles.personRow(isSelected)}>
                    <button
                      style={styles.personItem}
                      onClick={() => toggleMember(member._id || member.userId)}
                    >
                      <div style={styles.avatar(member.name)}>
                        {avatarSrc ? (
                          <img
                            src={avatarSrc}
                            alt=""
                            style={styles.avatarImg}
                          />
                        ) : (
                          getInitials(member.name)
                        )}
                      </div>
                      <span style={styles.personName}>{member.name}</span>
                      {isSelected && (
                        <Check size={16} style={styles.personCheck} />
                      )}
                    </button>
                    {isSelected && (
                      <select
                        style={styles.roleSelect}
                        value={currentRole}
                        onChange={(e) => setMemberRole(uid, e.target.value)}
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button style={styles.copyLink} onClick={handleCopyLink}>
            <Link2 size={14} />
            Copy link
          </button>
          <button
            style={
              isSaving
                ? { ...styles.doneBtn, ...styles.doneBtnDisabled }
                : styles.doneBtn
            }
            onClick={handleDone}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Done"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}