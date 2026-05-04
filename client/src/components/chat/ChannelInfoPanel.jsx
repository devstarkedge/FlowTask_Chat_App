import { useState } from "react";
import {
  X,
  Users,
  Hash,
  Lock,
  Settings,
  UserPlus,
  LogOut,
  Info,
  Globe,
  AlertTriangle,
} from "lucide-react";
import toast from "react-hot-toast";
import SectionHeader from "./SectionHeader";
import MemberItem from "./MemberItem";
import { useChannelStore } from "../../stores/channelStore";
import { useAuthStore } from "../../stores/authStore";
import EditChannelModal from "./EditChannelModal";
import AddMemberModal from "./AddMemberModal";
import "./custom-css/channelInfoPanel.css";

/* ─────────────────────────────────────────────
   Inline confirmation dialog (no extra library)
───────────────────────────────────────────── */
function ConfirmDialog({ title, message, confirmLabel = "Confirm", confirmClassName = "btn-danger", onConfirm, onCancel }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(3px)",
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-secondary, #1e1f22)",
          border: "1px solid var(--border-primary, #3a3b3d)",
          borderRadius: "var(--radius-lg, 12px)",
          padding: "24px",
          minWidth: 320,
          maxWidth: 400,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Icon + title */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "rgba(237,66,69,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={18} style={{ color: "var(--status-error, #ed4245)" }} />
          </div>
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "var(--text-white, #fff)",
            }}
          >
            {title}
          </span>
        </div>

        {/* Message */}
        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary, #b5bac1)",
            lineHeight: 1.55,
            marginBottom: 20,
          }}
        >
          {message}
        </p>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            className="btn-ghost"
            style={{ fontSize: 13, padding: "7px 16px" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={confirmClassName}
            style={{ fontSize: 13, padding: "7px 16px" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main component
───────────────────────────────────────────── */
export default function ChannelInfoPanel({ channel, onOpenProfile }) {
  const {
    membersByChannel,
    isMembersLoading,
    setShowInfoPanel,
    removeMember,
    leaveChannel,
  } = useChannelStore();
  const { user } = useAuthStore();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [confirm, setConfirm] = useState(null);

  if (!channel) return null;

  const members        = membersByChannel[channel._id] || []
  const memberCount    = channel.memberCount ?? members.length
  const activeMembers  = members.filter((m) => m.registrationStatus !== 'faded')
  const fadedMembers   = members.filter((m) => m.registrationStatus === 'faded')
  const onlineMembers  = activeMembers.filter((m) => m.onlineStatus === 'online')
  const offlineMembers = activeMembers.filter((m) => m.onlineStatus !== 'online')
  const isResolvingMembers = memberCount > 0 && members.length === 0

  const myMembership = members.find((m) => m._id === user?._id);
  const isOwner =
    myMembership?.channelRole === "owner" || channel.createdBy === user?._id;
  const isAdmin =
    isOwner || myMembership?.channelRole === "admin" || user?.role === "admin";
  const isDM = channel.type === "dm";
  const isSystem = channel.type === "system";
  const isSystemManagedProject =
    channel.type === "project" && channel.systemManaged;
  const isPrivate =
    channel.visibility === "private" || channel.type === "private";
  const canManageMembership =
    isAdmin && !isDM && !isSystem && !isSystemManagedProject;
  const canLeaveChannel = !isSystem && !isSystemManagedProject;
  const canEditChannel = !isDM && isAdmin && !isSystemManagedProject;

  /* ── ask for confirmation ── */
  const askRemove = (memberId, memberName) =>
    setConfirm({ type: "remove", memberId, memberName });

  const askLeave = () =>
    setConfirm({ type: "leave" });

  /* ── confirmed: actually do it ── */
  const handleConfirm = async () => {
    const action = confirm;
    setConfirm(null); // close dialog first

    if (!action) return;

    if (action.type === "remove") {
      try {
        await toast.promise(removeMember(channel._id, action.memberId), {
          loading: "Removing member…",
          success: `${action.memberName || "Member"} removed`,
          error: "Failed to remove member",
        });
      } catch (err) {
        console.error(err);
      }
    }

    if (action.type === "leave") {
      try {
        await toast.promise(leaveChannel(channel._id), {
          loading: "Leaving channel…",
          success: "You left the channel",
          error: "Failed to leave channel",
        });
        setShowInfoPanel(false);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleCancel = () => setConfirm(null);

  /* ── confirm dialog props ── */
  const confirmProps = confirm
    ? confirm.type === "remove"
      ? {
          title: "Remove Member",
          message: `Are you sure you want to remove ${confirm.memberName || "this member"} from #${channel.name}? They will lose access to this channel.`,
          confirmLabel: "Remove",
          confirmClassName: "btn-danger",
        }
      : {
          title: "Leave Channel",
          message: `Are you sure you want to leave #${channel.name}? You will need to be re-added to rejoin.`,
          confirmLabel: "Leave",
          confirmClassName: "btn-danger",
        }
    : null;

  return (
    <>
      {/* ── Confirmation dialog ── */}
      {confirm && confirmProps && (
        <ConfirmDialog
          {...confirmProps}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}

      {/* ── Root panel ── */}
      <div className="profile-panel cip-root" style={{ position: "relative" }}>

        {/* ══ HERO HEADER ══ */}
        <div className="cip-hero">
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div className="cip-channel-icon">
                {isPrivate ? (
                  <Lock size={22} style={{ color: "var(--accent-yellow)" }} />
                ) : (
                  <Hash size={22} style={{ color: "var(--accent-primary)" }} />
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: "var(--text-white)",
                    letterSpacing: "-0.02em",
                    lineHeight: 1.25,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    marginBottom: 3,
                  }}
                >
                  {channel.name}
                </h2>
                {channel.type && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      textTransform: "capitalize",
                    }}
                  >
                    {channel.type} channel
                  </span>
                )}
              </div>

              <button
                onClick={() => setShowInfoPanel(false)}
                className="app-topbar__icon"
                aria-label="Close panel"
              >
                <X size={15} />
              </button>
            </div>

            <div className="cip-stats">
              <span className="cip-stat-pill">
                <Users size={11} />
                {memberCount} member{memberCount !== 1 ? "s" : ""}
              </span>
              {onlineMembers.length > 0 && (
                <span className="cip-stat-pill online">
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--status-online)",
                    }}
                  />
                  {onlineMembers.length} online
                </span>
              )}
              {isPrivate ? (
                <span className="cip-stat-pill private">
                  <Lock size={10} /> Private
                </span>
              ) : (
                <span className="cip-stat-pill public">
                  <Globe size={10} /> Public
                </span>
              )}
              {isMembersLoading && <div className="cip-spinner" />}
            </div>
          </div>
        </div>

        {/* ══ ACTION BAR ══ */}
        {(!isDM || isAdmin) && (
          <div className="cip-actions">
            {/* Add member  */}
            {canManageMembership && (
              <button
                onClick={() => setShowAddMember(true)}
                className="btn-ghost"
                style={{ fontSize: 12, padding: "6px 12px", gap: 6, flex: 1, justifyContent: "center" }}
              >
                <UserPlus size={13} />
                Add Member
              </button>
            )}

            {/* Edit  */}
            {canEditChannel && (
              <button
                onClick={() => setShowEditModal(true)}
                className="btn-ghost"
                style={{ fontSize: 12, padding: "6px 12px", gap: 6, flex: 1, justifyContent: "center" }}
              >
                <Settings size={13} />
                Edit Channel
              </button>
            )}

            {/* Leave  */}
            {canLeaveChannel && (
              <button
                onClick={askLeave}
                className="btn-danger"
                style={{ fontSize: 12, padding: "6px 12px", gap: 6 }}
                title="Leave channel"
              >
                <LogOut size={13} />
              </button>
            )}
          </div>
        )}

        {/* ══ SCROLLABLE CONTENT ══ */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 20px" }}>

          {channel.description && (
            <div className="cip-info-block">
              <div className="cip-info-label">
                <Info size={10} />
                Description
              </div>
              <p className="cip-info-text">{channel.description}</p>
            </div>
          )}

          {/* ── Members section ── */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    color: "var(--text-muted)",
                  }}
                >
                  Members
                </span>
                <span className="cip-count-badge">{memberCount}</span>
              </div>
            </div>

            {/* Online */}
            {onlineMembers.length > 0 && (
              <div style={{ marginBottom: 4 }}>
                <div className="cip-members-section-label online-label">
                  <span className="dot" />
                  Online — {onlineMembers.length}
                </div>
                <div className="panel-list">
                  {onlineMembers.map((member) => (
                    <div
                      key={member._id || member.flowTaskUserId}
                      className="panel-item"
                      style={{ padding: "6px 8px", borderRadius: "var(--radius-md)" }}
                    >
                      <MemberItem
                        member={member}
                        onOpenProfile={onOpenProfile}
                        canRemove={
                          canManageMembership &&
                          member._id !== user?._id &&
                          !isDM &&
                          !isSystem
                        }
                        onRemove={() => handleRemoveMember(member._id)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Offline */}
            {offlineMembers.length > 0 && (
              <div>
                <div
                  className="cip-members-section-label offline-label"
                  style={{ marginTop: onlineMembers.length > 0 ? 12 : 0 }}
                >
                  <span className="dot" />
                  Offline — {offlineMembers.length}
                </div>
                <div className="panel-list">
                  {offlineMembers.map((member) => (
                    <div
                      key={member._id || member.flowTaskUserId}
                      className="panel-item"
                      style={{ padding: "6px 8px", borderRadius: "var(--radius-md)", opacity: 0.75 }}
                    >
                      <MemberItem
                        member={member}
                        onOpenProfile={onOpenProfile}
                        canRemove={
                          canManageMembership &&
                          member._id !== user?._id &&
                          !isDM &&
                          !isSystem
                        }
                        onRemove={() => handleRemoveMember(member._id)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Faded / Unregistered */}
            {fadedMembers.length > 0 && (
              <div>
                <div
                  className="cip-members-section-label"
                  style={{
                    marginTop: (onlineMembers.length > 0 || offlineMembers.length > 0) ? 12 : 0,
                    color: "var(--text-muted)",
                  }}
                >
                  <span className="dot" style={{ background: "var(--border-secondary)" }} />
                  Unregistered (FlowTask) — {fadedMembers.length}
                </div>
                <div className="panel-list">
                  {fadedMembers.map((member) => (
                    <div
                      key={member.flowTaskUserId}
                      className="panel-item"
                      style={{ padding: "6px 8px", borderRadius: "var(--radius-md)" }}
                    >
                      <MemberItem
                        member={member}
                        onOpenProfile={onOpenProfile}
                        canRemove={false}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {isResolvingMembers && (
              <div className="cip-empty">
                <div className="cip-empty-icon">
                  {isMembersLoading ? (
                    <div className="cip-spinner" />
                  ) : (
                    <Users size={22} style={{ color: "var(--text-muted)" }} />
                  )}
                </div>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    margin: 0,
                  }}
                >
                  Loading members...
                </p>
                <span className="cip-empty-subtext">
                  Fetching the latest channel roster
                </span>
              </div>
            )}

            {memberCount === 0 && !isMembersLoading && (
              <div className="cip-empty">
                <div className="cip-empty-icon">
                  <Users size={22} style={{ color: "var(--text-muted)" }} />
                </div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
                  No members yet
                </p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                  Add someone to get started
                </p>
                {isAdmin && !isDM && (
                  <button
                    onClick={() => setShowAddMember(true)}
                    className="btn-primary"
                    style={{ marginTop: 12, fontSize: 12, padding: "7px 16px" }}
                  >
                    <UserPlus size={13} />
                    Add Member
                  </button>
                )}
              </div>
            )}

            {/* Loading skeleton */}
            {!isMembersLoading && !isResolvingMembers && (memberCount === 0 || memberCount == null) && members.length === 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginTop: 8,
                }}
              >
                {[1, 2, 3].map((i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px" }}>
                    <div className="skeleton" style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                      <div className="skeleton" style={{ height: 11, width: "55%", borderRadius: 4 }} />
                      <div className="skeleton" style={{ height: 9, width: "35%", borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ══ MODALS ══ */}
        {showEditModal && (
          <EditChannelModal channel={channel} onClose={() => setShowEditModal(false)} />
        )}
        {showAddMember && (
          <AddMemberModal channel={channel} onClose={() => setShowAddMember(false)} />
        )}
      </div>
    </>
  );
}