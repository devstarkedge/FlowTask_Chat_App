import { useState } from "react";
import {
  X,
  Users,
  Hash,
  Lock,
  Settings,
  UserPlus,
  LogOut,
  ChevronDown,
  Info,
  Globe,
} from "lucide-react";
import SectionHeader from "./SectionHeader";
import MemberItem from "./MemberItem";
import { useChannelStore } from "../../stores/channelStore";
import { useChatStore } from "../../stores/chatStore";
import { useAuthStore } from "../../stores/authStore";
import EditChannelModal from "./EditChannelModal";
import AddMemberModal from "./AddMemberModal";
import "./custom-css/channelInfoPanel.css";

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
  const [confirmLeave, setConfirmLeave] = useState(false);

  if (!channel) return null;

  const members = membersByChannel[channel._id] || [];
  const onlineMembers = members.filter((m) => m.onlineStatus === "online");
  const offlineMembers = members.filter((m) => m.onlineStatus !== "online");

  const myMembership = members.find((m) => m._id === user?._id);
  const isOwner =
    myMembership?.channelRole === "owner" || channel.createdBy === user?._id;
  const isAdmin =
    isOwner || myMembership?.channelRole === "admin" || user?.role === "admin";
  const isDM = channel.type === "dm";
  const isSystem = channel.type === "system";
  const isPrivate =
    channel.visibility === "private" || channel.type === "private";

  const handleRemoveMember = async (memberId) => {
    const confirmRemove = window.confirm(
      "Remove this member from the channel?",
    );

    if (!confirmRemove) return;

    try {
      await toast.promise(removeMember(channel._id, memberId), {
        loading: "Removing member...",
        success: "Member removed",
        error: "Failed to remove member",
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleLeave = async () => {
    const confirmLeave = window.confirm(
      "Are you sure you want to leave this channel?",
    );

    if (!confirmLeave) return;

    try {
      await toast.promise(leaveChannel(channel._id), {
        loading: "Leaving channel...",
        success: "You left the channel",
        error: "Failed to leave channel",
      });

      setShowInfoPanel(false);
    } catch (err) {
      console.error(err);
    }
  };
  return (
    <>
      {/* ── Root panel── */}
      <div className="profile-panel cip-root" style={{ position: "relative" }}>
        {/* ══ HERO HEADER ══ */}
        <div className="cip-hero">
          <div style={{ position: "relative", zIndex: 1 }}>
            {/* Top row: icon + name + close */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              {/* Channel icon */}
              <div className="cip-channel-icon">
                {isPrivate ? (
                  <Lock size={22} style={{ color: "var(--accent-yellow)" }} />
                ) : (
                  <Hash size={22} style={{ color: "var(--accent-primary)" }} />
                )}
              </div>

              {/* Name + type */}
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

              {/* Close button */}
              <button
                onClick={() => setShowInfoPanel(false)}
                className="app-topbar__icon"
                aria-label="Close panel"
              >
                <X size={15} />
              </button>
            </div>

            {/* Stat pills */}
            <div className="cip-stats">
              <span className="cip-stat-pill">
                <Users size={11} />
                {members.length} member{members.length !== 1 ? "s" : ""}
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
            {isAdmin && !isDM && (
              <button
                onClick={() => setShowAddMember(true)}
                className="btn-ghost"
                style={{
                  fontSize: 12,
                  padding: "6px 12px",
                  gap: 6,
                  flex: 1,
                  justifyContent: "center",
                }}
              >
                <UserPlus size={13} />
                Add Member
              </button>
            )}

            {/* Edit  */}
            {!isDM && isAdmin && (
              <button
                onClick={() => setShowEditModal(true)}
                className="btn-ghost"
                style={{
                  fontSize: 12,
                  padding: "6px 12px",
                  gap: 6,
                  flex: 1,
                  justifyContent: "center",
                }}
              >
                <Settings size={13} />
                Edit Channel
              </button>
            )}

            {/* Leave  */}
            {!isSystem && (
              <button
                onClick={() => setConfirmLeave(true)}
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
          {/* Description block */}
          {channel.description && (
            <div className="cip-info-block">
              <div className="cip-info-label">
                <Info size={10} />
                Description
              </div>
              <p className="cip-info-text">{channel.description}</p>
            </div>
          )}

          {/* Topic block */}
          {channel.topic && (
            <div className="cip-info-block">
              <div className="cip-info-label">
                <Hash size={10} />
                Topic
              </div>
              <p className="cip-info-text">{channel.topic}</p>
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
                <span className="cip-count-badge">{members.length}</span>
              </div>

              {isAdmin && !isDM && (
                <button
                  onClick={() => setShowAddMember(true)}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--accent-primary)",
                    fontSize: 12,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 6px",
                    borderRadius: "var(--radius-sm)",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--bg-active)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <UserPlus size={12} />
                  Add
                </button>
              )}
            </div>

            {/* Online members */}
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
                      style={{
                        padding: "6px 8px",
                        borderRadius: "var(--radius-md)",
                      }}
                    >
                      <MemberItem
                        member={member}
                        onOpenProfile={onOpenProfile}
                        canRemove={
                          isAdmin &&
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

            {/* Offline members */}
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
                      style={{
                        padding: "6px 8px",
                        borderRadius: "var(--radius-md)",
                        opacity: 0.75,
                      }}
                    >
                      <MemberItem
                        member={member}
                        onOpenProfile={onOpenProfile}
                        canRemove={
                          isAdmin &&
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

            {/* Empty state */}
            {members.length === 0 && !isMembersLoading && (
              <div className="cip-empty">
                <div className="cip-empty-icon">
                  <Users size={22} style={{ color: "var(--text-muted)" }} />
                </div>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    margin: 0,
                  }}
                >
                  No members yet
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    margin: 0,
                  }}
                >
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
            {isMembersLoading && members.length === 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginTop: 8,
                }}
              >
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "6px 8px",
                    }}
                  >
                    <div
                      className="skeleton"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        flexShrink: 0,
                      }}
                    />
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        gap: 5,
                      }}
                    >
                      <div
                        className="skeleton"
                        style={{ height: 11, width: "55%", borderRadius: 4 }}
                      />
                      <div
                        className="skeleton"
                        style={{ height: 9, width: "35%", borderRadius: 4 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ══ CONFIRM LEAVE OVERLAY ══ */}
        {confirmLeave && (
          <div className="cip-confirm-overlay">
            <div className="cip-confirm-card">
              <div className="cip-confirm-icon">
                <LogOut size={20} style={{ color: "var(--accent-red)" }} />
              </div>
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: "var(--text-white)",
                  marginBottom: 6,
                }}
              >
                Leave channel?
              </p>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  lineHeight: 1.55,
                  marginBottom: 18,
                }}
              >
                You'll need to be invited back to rejoin{" "}
                <strong style={{ color: "var(--text-secondary)" }}>
                  #{channel.name}
                </strong>
                .
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setConfirmLeave(false)}
                  className="btn-ghost"
                  style={{ flex: 1, justifyContent: "center", fontSize: 13 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleLeave}
                  className="btn-danger"
                  style={{ flex: 1, justifyContent: "center", fontSize: 13 }}
                >
                  Leave
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ MODALS ══ */}
        {showEditModal && (
          <EditChannelModal
            channel={channel}
            onClose={() => setShowEditModal(false)}
          />
        )}
        {showAddMember && (
          <AddMemberModal
            channel={channel}
            onClose={() => setShowAddMember(false)}
          />
        )}
      </div>
    </>
  );
}
