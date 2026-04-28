import { useState, useEffect, useMemo } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useAuthStore } from "../../stores/authStore";
import {
  X,
  Settings,
  Users,
  Link2,
  Copy,
  RefreshCw,
  Loader2,
  Crown,
  Shield,
  UserMinus,
  ChevronDown,
  Trash2,
  Zap,
  Lock,
  Bell,
  Check,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { Avatar } from "../chat/MemberAvatarGroup";
import toast from "react-hot-toast";
import api from "../../services/api";
import "./custom-css/WorkspaceSettingsModal.css";

/* ─────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────── */
const TABS = [
  { id: "general", label: "General", icon: Settings },
  { id: "members", label: "Members", icon: Users },
  { id: "invite", label: "Invite", icon: Link2 },
  { id: "integrations", label: "Integrations", icon: Zap },
  { id: "security", label: "Security", icon: Lock },
  { id: "notifications", label: "Notifications", icon: Bell },
];

const ROLE_CFG = {
  owner: {
    label: "Owner",
    color: "#92400e",
    bg: "#fffbeb",
    border: "#fde68a",
    dot: "#f59e0b",
    icon: Crown,
  },
  admin: {
    label: "Admin",
    color: "#5b21b6",
    bg: "#f5f3ff",
    border: "#ddd6fe",
    dot: "#8b5cf6",
    icon: Shield,
  },
  member: {
    label: "Member",
    color: "#075985",
    bg: "#f0f9ff",
    border: "#bae6fd",
    dot: "#38bdf8",
    icon: null,
  },
  guest: {
    label: "Guest",
    color: "#374151",
    bg: "#f9fafb",
    border: "#e5e7eb",
    dot: "#9ca3af",
    icon: null,
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────── */
const SectionLabel = ({ children }) => <p className="wsm-label">{children}</p>;

/* ─────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────── */
export default function WorkspaceSettingsModal({ onClose }) {
  const {
    activeWorkspace,
    activeWorkspaceId,
    members,
    fetchMembers,
    fetchWorkspace,
    updateWorkspace,
    removeMember,
    updateMemberRole,
    regenerateInviteCode,
    deleteWorkspace,
  } = useWorkspaceStore();
  const { user } = useAuthStore();

  const [activeTab, setActiveTab] = useState("general");
  const [name, setName] = useState(activeWorkspace?.name || "");
  const [description, setDescription] = useState(
    activeWorkspace?.description || "",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [tabKey, setTabKey] = useState(0);

  useEffect(() => {
    if (activeWorkspaceId) fetchMembers();
  }, [activeWorkspaceId, fetchMembers]);

  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const currentUserRole = useMemo(() => {
    const m = members.find((m) => (m.userId?._id || m.userId) === user?._id);
    return m?.role || "member";
  }, [members, user]);

  const canManage = currentUserRole === "owner" || currentUserRole === "admin";

  const handleSaveGeneral = async () => {
    if (!name.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await updateWorkspace(activeWorkspaceId, {
        name: name.trim(),
        description: description.trim(),
      });
    } catch {}
    setIsSaving(false);
  };

  const handleRegenerate = async () => {
    if (isRegenerating) return;
    setIsRegenerating(true);
    try {
      await regenerateInviteCode();
    } catch {}
    setIsRegenerating(false);
  };

  const handleCopyInviteCode = () => {
    if (activeWorkspace?.inviteCode) {
      navigator.clipboard.writeText(activeWorkspace.inviteCode);
      toast.success("Invite code copied!");
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!confirm(`Delete "${activeWorkspace?.name}"? This cannot be undone.`))
      return;
    try {
      await deleteWorkspace(activeWorkspaceId);
      onClose();
    } catch {}
  };

  const switchTab = (id) => {
    setActiveTab(id);
    setTabKey((k) => k + 1);
  };

  useEffect(() => {
    // When opening the Invite tab, ensure owners/admins have the latest inviteCode
    if (activeTab === 'invite' && canManage && activeWorkspaceId) {
      if (!activeWorkspace?.inviteCode) {
        fetchWorkspace(activeWorkspaceId).catch(() => {})
      }
    }
  }, [activeTab, canManage, activeWorkspaceId, activeWorkspace?.inviteCode, fetchWorkspace]);

  return (
    <div className="wsm">
      {/* ── Backdrop ── */}
      <div
        className="wsm-overlay wsm-overlay-bg"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        {/* ── Modal ── */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="wsm-title"
          className="wsm-modal wsm-shell"
        >
          {/* ══ HEADER ══ */}
          <div className="wsm-header">
            <div className="wsm-header-left">
              <div className="wsm-header-icon">
                <Sparkles size={18} color="#fff" />
              </div>
              <div>
                <p id="wsm-title" className="wsm-header-title">
                  Workspace Settings
                </p>
                <p className="wsm-header-sub">
                  {activeWorkspace?.name || "Manage your workspace"}
                </p>
              </div>
            </div>
            <button
              className="wsm-close-btn"
              onClick={onClose}
              aria-label="Close settings"
            >
              <X size={15} />
            </button>
          </div>

          {/* ══ TABS ══ */}
          <div
            className="wsm-tabs"
            role="tablist"
            aria-label="Settings sections"
          >
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={activeTab === id}
                className={`wsm-tab${activeTab === id ? " active" : ""}`}
                onClick={() => switchTab(id)}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>

          {/* ══ TAB CONTENT ══ */}
          <div
            key={tabKey}
            className="wsm-content wsm-tab-body"
            role="tabpanel"
          >
            {activeTab === "general" && (
              <GeneralTab
                name={name}
                setName={setName}
                description={description}
                setDescription={setDescription}
                canManage={canManage}
                isSaving={isSaving}
                onSave={handleSaveGeneral}
                onDelete={handleDeleteWorkspace}
                isOwner={currentUserRole === "owner"}
                workspace={activeWorkspace}
              />
            )}
            {activeTab === "members" && (
              <MembersTab
                members={members}
                currentUserId={user?._id}
                currentUserRole={currentUserRole}
                canManage={canManage}
                onRemove={removeMember}
                onUpdateRole={updateMemberRole}
              />
            )}
            {activeTab === "invite" && (
              <InviteTab
                inviteCode={activeWorkspace?.inviteCode}
                canManage={canManage}
                isRegenerating={isRegenerating}
                onCopy={handleCopyInviteCode}
                onRegenerate={handleRegenerate}
              />
            )}
            {activeTab === "integrations" && (
              <IntegrationsTab canManage={canManage} />
            )}
            {activeTab === "security" && <SecurityTab canManage={canManage} />}
            {activeTab === "notifications" && <NotificationsTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   GENERAL TAB
───────────────────────────────────────────────────────────────────────── */
function GeneralTab({
  name,
  setName,
  description,
  setDescription,
  canManage,
  isSaving,
  onSave,
  onDelete,
  isOwner,
  workspace,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      <div>
        <SectionLabel>Workspace Name</SectionLabel>
        <input
          className="wsm-field"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canManage}
          placeholder="e.g. Design Team"
        />
      </div>

      <div>
        <SectionLabel>Description</SectionLabel>
        <textarea
          className="wsm-field"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!canManage}
          rows={3}
          placeholder="What is this workspace for?"
          style={{ resize: "none", lineHeight: 1.6 }}
        />
      </div>

      {/* Meta chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {[
          { label: "Slug", val: workspace?.slug || "—", dot: "#6366f1" },
          { label: "Plan", val: workspace?.plan || "free", dot: "#8b5cf6" },
          {
            label: "Members",
            val: workspace?.memberCount ?? 0,
            dot: "#06b6d4",
          },
        ].map(({ label, val, dot }) => (
          <span key={label} className="wsm-chip">
            <span className="wsm-chip-dot" style={{ background: dot }} />
            {label}:&nbsp;
            <span className="wsm-chip-val wsm-mono">{String(val)}</span>
          </span>
        ))}
      </div>

      {canManage && (
        <div>
          <button
            className="wsm-btn-primary"
            onClick={onSave}
            disabled={!name.trim() || isSaving}
          >
            {isSaving ? (
              <Loader2 size={14} className="wsm-spin" />
            ) : (
              <span className="wsm-check">
                <Check size={14} />
              </span>
            )}
            {isSaving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      )}

      {/* Danger Zone */}
      <div className="wsm-danger-zone">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 14,
          }}
        >
          <AlertTriangle size={14} color="#f87171" />
          <p className="wsm-label" style={{ color: "#f87171", margin: 0 }}>
            Danger Zone
          </p>
        </div>
        <p
          style={{
            fontSize: 12.5,
            color: "#94a3b8",
            marginBottom: 14,
            lineHeight: 1.6,
          }}
        >
          Once you delete a workspace, there is no going back. All channels,
          messages and files will be permanently erased.
        </p>
        <button className="wsm-btn-danger" onClick={onDelete}>
          <Trash2 size={14} />
          Delete Workspace
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   MEMBERS TAB
───────────────────────────────────────────────────────────────────────── */
function MembersTab({
  members,
  currentUserId,
  currentUserRole,
  canManage,
  onRemove,
  onUpdateRole,
}) {
  const [roleMenuId, setRoleMenuId] = useState(null);

  return (
    <div>
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
        }}
      >
        <SectionLabel>Team Members</SectionLabel>
        <span
          className="wsm-badge-in"
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: "#4f46e5",
            background: "#eef2ff",
            padding: "4px 12px",
            borderRadius: 20,
            border: "1.5px solid #c7d2fe",
            letterSpacing: ".01em",
          }}
        >
          {members.length} {members.length === 1 ? "member" : "members"}
        </span>
      </div>

      <div className="wsm-card" style={{ padding: 8 }}>
        {members.map((m, idx) => {
          const memberUser =
            m.userId && typeof m.userId === "object"
              ? m.userId
              : { _id: m.userId };
          const memberId = memberUser._id || m.userId;
          const isCurrentUser = memberId === currentUserId;
          const role = ROLE_CFG[m.role] || ROLE_CFG.member;
          const RoleIcon = role.icon;

          return (
            <div key={m._id || memberId}>
              {idx > 0 && (
                <div
                  style={{ height: 1, background: "#f8fafc", margin: "3px 0" }}
                />
              )}
              <div className="wsm-row-item wsm-member-row">
                {/* Avatar */}
                <Avatar member={memberUser} size={38} />

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: "#0f172a",
                      display: "flex",
                      alignItems: "center",
                      overflow: "hidden",
                    }}
                  >
                    <span
                      style={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {memberUser.name || m.displayName || "Unknown"}
                    </span>
                    {isCurrentUser && (
                      <span className="wsm-you-badge">you</span>
                    )}
                  </p>
                  <p
                    style={{
                      fontSize: 11.5,
                      color: "#94a3b8",
                      marginTop: 2,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {memberUser.email || ""}
                  </p>
                </div>

                {/* Role + actions */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    className="wsm-role-badge"
                    style={{
                      background: role.bg,
                      color: role.color,
                      border: `1.5px solid ${role.border}`,
                    }}
                  >
                    <span
                      className="wsm-role-dot"
                      style={{ background: role.dot }}
                    />
                    {RoleIcon && <RoleIcon size={10} />}
                    {role.label}
                  </span>

                  {canManage && !isCurrentUser && m.role !== "owner" && (
                    <div style={{ position: "relative" }}>
                      <button
                        className="wsm-role-btn"
                        onClick={() =>
                          setRoleMenuId(
                            roleMenuId === memberId ? null : memberId,
                          )
                        }
                        aria-label="Change role"
                      >
                        <ChevronDown
                          size={13}
                          style={{
                            transition: "transform .18s",
                            transform:
                              roleMenuId === memberId
                                ? "rotate(180deg)"
                                : "none",
                          }}
                        />
                      </button>

                      {roleMenuId === memberId && (
                        <div className="wsm-dropdown wsm-slide-down">
                          {["admin", "member", "guest"]
                            .filter((r) => r !== m.role)
                            .map((role) => (
                              <button
                                key={role}
                                className="wsm-dropdown-item"
                                onClick={() => {
                                  onUpdateRole(memberId, role);
                                  setRoleMenuId(null);
                                }}
                              >
                                Make{" "}
                                {role.charAt(0).toUpperCase() + role.slice(1)}
                              </button>
                            ))}
                          <div className="wsm-dropdown-sep" />
                          <button
                            className="wsm-dropdown-item danger"
                            onClick={() => {
                              onRemove(memberId);
                              setRoleMenuId(null);
                            }}
                          >
                            <UserMinus size={12} />
                            Remove member
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   INVITE TAB
───────────────────────────────────────────────────────────────────────── */
function InviteTab({
  inviteCode,
  canManage,
  isRegenerating,
  onCopy,
  onRegenerate,
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  const { activeWorkspaceId } = useWorkspaceStore();

  const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleSend = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    if (!isValidEmail(email)) {
      toast.error("Please enter a valid email address");
      return;
    }
    setIsSendingInvite(true);
    try {
      await api.post(`/workspaces/${activeWorkspaceId}/invite-email`, {
        email,
        role: inviteRole,
      });
      toast.success(`Invite sent to ${email}`);
      setInviteEmail("");
    } catch (err) {
      toast.error(
        err.response?.data?.error?.message || "Failed to send invite",
      );
    }
    setIsSendingInvite(false);
  };

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Email invite */}
      {canManage && (
        <div>
          <SectionLabel>Invite by Email</SectionLabel>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              className="wsm-field"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="name@company.com"
              style={{ flex: "1 1 180px", minWidth: 0 }}
            />
            <select
              className="wsm-field"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              style={{ width: 110 }}
            >
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="guest">Guest</option>
            </select>
            <button
              className="wsm-btn-primary"
              onClick={handleSend}
              disabled={!inviteEmail.trim() || isSendingInvite}
              style={{ flexShrink: 0 }}
            >
              {isSendingInvite ? (
                <Loader2 size={14} className="wsm-spin" />
              ) : (
                "Send Invite"
              )}
            </button>
          </div>
        </div>
      )}

      {/* Invite code */}
      <div>
        <SectionLabel>Invite Code</SectionLabel>
        <p
          style={{
            fontSize: 12.5,
            color: "#94a3b8",
            marginBottom: 16,
            lineHeight: 1.6,
          }}
        >
          Share this code with anyone you'd like to add. They can use it to join
          this workspace directly.
        </p>

        {inviteCode ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12,  }}>
            <div className="wsm-invite-code wsm-mono">{inviteCode}</div>
            <button
              className="wsm-copy-btn"
              onClick={handleCopy}
              title={copied ? "Copied!" : "Copy code"}
              style={{
                border: `1.5px solid ${copied ? "#c7d2fe" : "#e2e8f0"}`,
                background: copied ? "#eef2ff" : "#fff",
                color: copied ? "#6366f1" : "#94a3b8",
              }}
            >
              {copied ? (
                <span className="wsm-check">
                  <Check size={18} />
                </span>
              ) : (
                <Copy size={10} />
              )}
            </button>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>
            No invite code generated yet.
          </p>
        )}
      </div>

      {canManage && (
        <div>
          <button
            className="wsm-btn-ghost"
            onClick={onRegenerate}
            disabled={isRegenerating}
          >
            {isRegenerating ? (
              <Loader2 size={14} className="wsm-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            {inviteCode ? "Regenerate Code" : "Generate Invite Code"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   INTEGRATIONS TAB
───────────────────────────────────────────────────────────────────────── */
function IntegrationsTab({ canManage }) {
  const [flowTaskConnected] = useState(!!import.meta.env.VITE_FLOWTASK_ENABLED);
  const [autoChannels, setAutoChannels] = useState(true);
  const [syncMembers, setSyncMembers] = useState(true);

  const connected = flowTaskConnected;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <SectionLabel>Connected Apps</SectionLabel>
        <div className="wsm-integration-card">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: connected ? "#f0fdf4" : "#fef2f2",
                border: `1.5px solid ${connected ? "#bbf7d0" : "#fecaca"}`,
              }}
            >
              <Zap size={18} color={connected ? "#16a34a" : "#dc2626"} />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                FlowTask
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: connected ? "#16a34a" : "#dc2626",
                  marginTop: 3,
                  fontWeight: 500,
                }}
              >
                {connected ? "✓ Connected & syncing" : "Not connected"}
              </p>
            </div>
          </div>
          <span
            className="wsm-status-pill"
            style={{
              background: connected ? "#f0fdf4" : "#fef2f2",
              color: connected ? "#16a34a" : "#dc2626",
              border: `1.5px solid ${connected ? "#bbf7d0" : "#fecaca"}`,
            }}
          >
            {connected ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      {connected && (
        <div>
          <SectionLabel>Sync Options</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SettingsToggle
              label="Auto-create project channels"
              description="Automatically create channels for new FlowTask projects"
              checked={autoChannels}
              onChange={setAutoChannels}
              disabled={!canManage}
            />
            <SettingsToggle
              label="Sync team members"
              description="Automatically add FlowTask project members to channels"
              checked={syncMembers}
              onChange={setSyncMembers}
              disabled={!canManage}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SECURITY TAB
───────────────────────────────────────────────────────────────────────── */
function SecurityTab({ canManage }) {
  const [requireVerification, setRequireVerification] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState("7d");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <SectionLabel>Access Controls</SectionLabel>
        <SettingsToggle
          label="Require email verification"
          description="New members must verify their email before accessing the workspace"
          checked={requireVerification}
          onChange={setRequireVerification}
          disabled={!canManage}
        />
      </div>

      <div>
        <SectionLabel>Session Timeout</SectionLabel>
        <select
          className="wsm-field"
          value={sessionTimeout}
          onChange={(e) => setSessionTimeout(e.target.value)}
          disabled={!canManage}
          style={{ maxWidth: 300 }}
        >
          <option value="1d">1 day</option>
          <option value="7d">7 days</option>
          <option value="30d">30 days</option>
          <option value="never">Never expire</option>
        </select>
      </div>

      <div>
        <SectionLabel>Two-Factor Authentication</SectionLabel>
        <div className="wsm-banner">
          <div className="wsm-banner-icon">
            <Shield size={16} color="#fff" />
          </div>
          <div>
            <p
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                color: "#3730a3",
                marginBottom: 4,
              }}
            >
              2FA Enforcement
            </p>
            <p style={{ fontSize: 12.5, color: "#6366f1", lineHeight: 1.6 }}>
              Coming soon — enforce two-factor authentication for all workspace
              members to improve account security.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   NOTIFICATIONS TAB
───────────────────────────────────────────────────────────────────────── */
function NotificationsTab() {
  const [notifyMentions, setNotifyMentions] = useState(true);
  const [notifyDMs, setNotifyDMs] = useState(true);
  const [notifyThreads, setNotifyThreads] = useState(true);
  const [notifyTasks, setNotifyTasks] = useState(true);

  const items = [
    {
      label: "@Mentions",
      desc: "Notify when someone mentions you",
      val: notifyMentions,
      set: setNotifyMentions,
    },
    {
      label: "Direct messages",
      desc: "Notify for new direct messages",
      val: notifyDMs,
      set: setNotifyDMs,
    },
    {
      label: "Thread replies",
      desc: "Notify when someone replies to your thread",
      val: notifyThreads,
      set: setNotifyThreads,
    },
    {
      label: "Task updates",
      desc: "Notify for FlowTask task assignments and updates",
      val: notifyTasks,
      set: setNotifyTasks,
    },
  ];

  return (
    <div>
      <SectionLabel>Notification Preferences</SectionLabel>
      <p
        style={{
          fontSize: 12.5,
          color: "#94a3b8",
          marginBottom: 18,
          lineHeight: 1.6,
        }}
      >
        Configure default notification settings for all members in this
        workspace.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map(({ label, desc, val, set }) => (
          <SettingsToggle
            key={label}
            label={label}
            description={desc}
            checked={val}
            onChange={set}
          />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SETTINGS TOGGLE (shared)
───────────────────────────────────────────────────────────────────────── */
function SettingsToggle({ label, description, checked, onChange, disabled }) {
  return (
    <div className="wsm-toggle-wrap" style={{ opacity: disabled ? 0.5 : 1 }}>
      <div style={{ flex: 1, minWidth: 0, marginRight: 18 }}>
        <p
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: "#0f172a",
            letterSpacing: "-.01em",
          }}
        >
          {label}
        </p>
        {description && (
          <p
            style={{
              fontSize: 12,
              color: "#94a3b8",
              marginTop: 3,
              lineHeight: 1.5,
            }}
          >
            {description}
          </p>
        )}
      </div>
      <button
        className="wsm-toggle-track"
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        aria-checked={checked}
        role="switch"
        style={{
          background: checked
            ? "linear-gradient(135deg,#6366f1,#4f46e5)"
            : "#e2e8f0",
          boxShadow: checked ? "0 2px 10px rgba(99,102,241,.4)" : "none",
        }}
      >
        <div className="wsm-toggle-thumb" style={{ left: checked ? 24 : 4 }} />
      </button>
    </div>
  );
}
