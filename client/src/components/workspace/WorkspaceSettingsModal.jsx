import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useAuthStore } from "../../stores/authStore";
import { X, Settings, Users, Link2, Copy, RefreshCw, Crown, Shield, UserMinus, ChevronDown, Trash2, Zap, Lock, Bell, Check, Sparkles, AlertTriangle, UserPlus, Globe, Eye, Plus } from 'lucide-react';
import Loader from '../shared/Loader';
import { Avatar } from "../chat/MemberAvatarGroup";
import toast from "react-hot-toast";
import api, { workspaceAPI } from "../../services/api";
import { useDeleteConfirm } from "../../hooks/useDeleteConfirm";
import InviteMembersModal from "./InviteMembersModal";
import PendingInvitesList from "./PendingInvitesList";
import MembersTab from "./MembersTab";
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

export const ROLE_CFG = {
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
    members = [],
    fetchMembers,
    fetchWorkspace,
    updateWorkspace,
    removeMember,
    updateMemberRole,
    regenerateInviteCode,
    deleteWorkspace,
  } = useWorkspaceStore();
  const { user } = useAuthStore();
  const { confirm } = useDeleteConfirm();

  const [activeTab, setActiveTab] = useState("general");
  const [name, setName] = useState(activeWorkspace?.name || "");
  const [description, setDescription] = useState(
    activeWorkspace?.description || "",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [tabKey, setTabKey] = useState(0);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteRefreshKey, setInviteRefreshKey] = useState(0);

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
    const ok = await confirm({
      title: `Delete "${activeWorkspace?.name}"?`,
      message: 'This action will permanently delete this workspace and all its data for every member. This action cannot be undone.',
      confirmLabel: 'Delete workspace',
    })
    if (!ok) return
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
          members={members}
              />
            )}
            {activeTab === "members" && (
              <MembersTab
                members={members}
                loading={false}
                currentUserId={user?._id}
                canManage={canManage}
                onRemove={removeMember}
                onUpdateRole={updateMemberRole}
                confirm={confirm}
              />
            )}
            {activeTab === "invite" && (
              <InviteTab
                inviteCode={activeWorkspace?.inviteCode}
                canManage={canManage}
                isRegenerating={isRegenerating}
                onCopy={handleCopyInviteCode}
                onRegenerate={handleRegenerate}
                workspaceId={activeWorkspaceId}
                currentUserRole={currentUserRole}
                plan={activeWorkspace?.plan || 'free'}
                workspace={activeWorkspace}
                showInviteModal={showInviteModal}
                setShowInviteModal={setShowInviteModal}
                inviteRefreshKey={inviteRefreshKey}
                setInviteRefreshKey={setInviteRefreshKey}
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
  members,
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
            val: members.length,
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
              <Loader size={14} className="wsm-spin" />
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
          <p className="wsm-label" style={{ color: "var(--danger-primary, #f87171)", margin: 0 }}>
            Danger Zone
          </p>
        </div>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--text-secondary)",
            marginBottom: 14,
            lineHeight: 1.6,
          }}
        >
          Once you delete a workspace, there is no going back. This action will permanently delete this workspace and all its data for every member.
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
   INVITE TAB
───────────────────────────────────────────────────────────────────────── */
const GUEST_ACCESS_PLANS = { free: false, pro: true, enterprise: true };

function InviteTab({
  inviteCode,
  canManage,
  isRegenerating,
  onCopy,
  onRegenerate,
  workspaceId,
  currentUserRole,
  plan,
  workspace,
  showInviteModal,
  setShowInviteModal,
  inviteRefreshKey,
  setInviteRefreshKey,
}) {
  const [copied, setCopied] = useState(false);
  const isOwner = currentUserRole === "owner";
  const guestAccess = GUEST_ACCESS_PLANS[plan] ?? false;

  /* ── Domain Restrictions state ── */
  const domainRestrictions = workspace?.settings?.domainRestrictions || { enabled: false, allowedDomains: [] };
  const [domainEnabled, setDomainEnabled]       = useState(domainRestrictions.enabled);
  const [domainList, setDomainList]             = useState(domainRestrictions.allowedDomains || []);
  const [newDomain, setNewDomain]               = useState("");
  const [savingDomain, setSavingDomain]         = useState(false);

  /* ── Guest Settings state ── */
  const guestSettings = workspace?.settings?.guestSettings || { maxGuests: -1, guestChannelRestriction: true };
  const [maxGuests, setMaxGuests]               = useState(guestSettings.maxGuests);
  const [guestChannelRestriction, setGuestChannelRestriction] = useState(guestSettings.guestChannelRestriction);
  const [savingGuest, setSavingGuest]           = useState(false);

  useEffect(() => {
    const dr = workspace?.settings?.domainRestrictions || { enabled: false, allowedDomains: [] };
    setDomainEnabled(dr.enabled);
    setDomainList(dr.allowedDomains || []);
    const gs = workspace?.settings?.guestSettings || { maxGuests: -1, guestChannelRestriction: true };
    setMaxGuests(gs.maxGuests);
    setGuestChannelRestriction(gs.guestChannelRestriction);
  }, [workspace?.settings]);

  /* ── Domain Restrictions handlers ── */
  const addDomain = () => {
    const d = newDomain.trim().toLowerCase().replace(/^@/, "");
    if (!d || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) {
      toast.error("Enter a valid domain (e.g. company.com)");
      return;
    }
    if (domainList.includes(d)) { toast.error("Domain already added"); return; }
    setDomainList((p) => [...p, d]);
    setNewDomain("");
  };

  const removeDomain = (d) => setDomainList((p) => p.filter((x) => x !== d));

  const saveDomainRestrictions = async () => {
    setSavingDomain(true);
    try {
      await workspaceAPI.updateDomainRestrictions(workspaceId, {
        enabled: domainEnabled,
        allowedDomains: domainList,
      });
      toast.success("Domain restrictions saved");
    } catch (err) {
      toast.error(err.response?.data?.error?.message || "Failed to save domain restrictions");
    } finally { setSavingDomain(false); }
  };

  /* ── Guest Settings handlers ── */
  const saveGuestSettings = async () => {
    setSavingGuest(true);
    try {
      await workspaceAPI.updateGuestSettings(workspaceId, {
        maxGuests: Number(maxGuests),
        guestChannelRestriction,
      });
      toast.success("Guest settings saved");
    } catch (err) {
      toast.error(err.response?.data?.error?.message || "Failed to save guest settings");
    } finally { setSavingGuest(false); }
  };

  /* ── Invite modal trigger ── */
  const handleOpenInviteModal = () => setShowInviteModal(true);
  const handleCloseInviteModal = () => {
    setShowInviteModal(false);
    // Refresh pending list after modal closes
    setInviteRefreshKey((k) => k + 1);
  };

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* ── Invite Members Button ── */}
      {canManage && (
        <div>
          <SectionLabel>Invite People</SectionLabel>
          <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.6 }}>
            Send email invitations to new members or external guests. Guests are restricted to assigned channels only.
          </p>
          <button className="wsm-btn-primary" onClick={handleOpenInviteModal}>
            <UserPlus size={14} />
            Open Invite Panel
          </button>
        </div>
      )}

      {/* ── Invite Code ── */}
      <div>
        <SectionLabel>Invite Code</SectionLabel>
        <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.6 }}>
          Share this code with anyone you'd like to add. They can use it to join this workspace directly.
        </p>
        {inviteCode ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="wsm-invite-code wsm-mono">{inviteCode}</div>
            <button
              className="wsm-copy-btn"
              onClick={handleCopy}
              title={copied ? "Copied!" : "Copy code"}
              style={{
                border: `1.5px solid ${copied ? "var(--border-focus, #c7d2fe)" : "var(--border-primary, #e2e8f0)"}`,
                background: copied ? "var(--bg-active, #eef2ff)" : "var(--bg-primary, #fff)",
                color: copied ? "var(--accent-primary, #6366f1)" : "var(--text-secondary)",
              }}
            >
              {copied ? <span className="wsm-check"><Check size={18} /></span> : <Copy size={10} />}
            </button>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", fontStyle: "italic" }}>
            No invite code generated yet.
          </p>
        )}
      </div>
      {canManage && (
        <div>
          <button className="wsm-btn-ghost" onClick={onRegenerate} disabled={isRegenerating}>
            {isRegenerating ? <Loader size={14} className="wsm-spin" /> : <RefreshCw size={14} />}
            {inviteCode ? "Regenerate Code" : "Generate Invite Code"}
          </button>
        </div>
      )}

      {/* ── Pending Invites List ── */}
      {canManage && (
        <div>
          <SectionLabel>Pending & Recent Invites</SectionLabel>
          <PendingInvitesList workspaceId={workspaceId} refreshKey={inviteRefreshKey} />
        </div>
      )}

      {/* ── Domain Restrictions (owner/admin) ── */}
      {canManage && (
        <div>
          <SectionLabel>Domain Restrictions</SectionLabel>
          <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.6 }}>
            Restrict email invites to specific domains. When enabled, only emails from allowed domains can be invited.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              <input
                type="checkbox"
                checked={domainEnabled}
                onChange={(e) => setDomainEnabled(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "var(--accent-primary)" }}
              />
              Enable domain restrictions
            </label>
          </div>
          {domainEnabled && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="wsm-field"
                  type="text"
                  placeholder="company.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addDomain()}
                  style={{ flex: 1 }}
                />
                <button className="wsm-btn-ghost" onClick={addDomain} style={{ flexShrink: 0 }}>
                  <Plus size={13} /> Add
                </button>
              </div>
              {domainList.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {domainList.map((d) => (
                    <span
                      key={d}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                        background: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent)",
                        color: "var(--accent-primary)",
                      }}
                    >
                      <Globe size={11} />{d}
                      <button
                        type="button"
                        onClick={() => removeDomain(d)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "inherit", display: "flex" }}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <button
                className="wsm-btn-primary"
                onClick={saveDomainRestrictions}
                disabled={savingDomain}
                style={{ alignSelf: "flex-start" }}
              >
                {savingDomain ? <Loader size={13} className="wsm-spin" /> : <Check size={13} />}
                Save Domain Settings
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Guest Settings (owner only, pro/enterprise) ── */}
      {isOwner && guestAccess && (
        <div>
          <SectionLabel>Guest Settings</SectionLabel>
          <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.6 }}>
            Configure guest access limits and channel visibility for guest users.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Max guests (-1 = unlimited):
              <input
                type="number"
                className="wsm-field"
                value={maxGuests}
                onChange={(e) => setMaxGuests(e.target.value)}
                min={-1}
                style={{ width: 80, textAlign: "center" }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              <input
                type="checkbox"
                checked={guestChannelRestriction}
                onChange={(e) => setGuestChannelRestriction(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "var(--accent-primary)" }}
              />
              Restrict guests to assigned channels only
            </label>
            <button
              className="wsm-btn-primary"
              onClick={saveGuestSettings}
              disabled={savingGuest}
              style={{ alignSelf: "flex-start" }}
            >
              {savingGuest ? <Loader size={13} className="wsm-spin" /> : <Check size={13} />}
              Save Guest Settings
            </button>
          </div>
        </div>
      )}

      {/* ── Invite Members Modal ── */}
      <InviteMembersModal
        isOpen={showInviteModal}
        onClose={handleCloseInviteModal}
        workspaceId={workspaceId}
      />
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
                background: connected ? "var(--bg-success, #f0fdf4)" : "var(--bg-danger, #fef2f2)",
                border: `1.5px solid ${connected ? "var(--border-success, #bbf7d0)" : "var(--border-danger, #fecaca)"}`,
              }}
            >
              <Zap size={18} color={connected ? "var(--success-primary, #16a34a)" : "var(--danger-primary, #dc2626)"} />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                FlowTask
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: connected ? "var(--success-primary, #16a34a)" : "var(--danger-primary, #dc2626)",
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
            <Shield size={16} color="var(--text-inverse, #fff)" />
          </div>
          <div>
            <p
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                color: "var(--text-on-accent, #3730a3)",
                marginBottom: 4,
              }}
            >
              2FA Enforcement
            </p>
            <p style={{ fontSize: 12.5, color: "var(--accent-primary, #6366f1)", lineHeight: 1.6 }}>
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
