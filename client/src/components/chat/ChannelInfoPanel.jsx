import { useState, useMemo, useEffect } from "react";
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
  Star,
  FolderInput,
} from "lucide-react";
import api from "../../services/api";
import toast from "react-hot-toast";
import MemberItem from "./MemberItem";
import { useChannelStore } from "../../stores/channelStore";
import { useAuthStore } from "../../stores/authStore";
import { useFavoritesStore } from "../../stores/favoritesStore";
import { usePresenceStore } from "../../stores/presenceStore";
import EditChannelModal from "./EditChannelModal";
import AddMemberModal from "./AddMemberModal";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useDeleteConfirm } from "../../hooks/useDeleteConfirm";
import "./custom-css/channelInfoPanel.css";



/* ─────────────────────────────────────────────
   Main component
───────────────────────────────────────────── */
export default function ChannelInfoPanel({ channel: channelProp, onOpenProfile }) {
  const {
    membersByChannel,
    isMembersLoading,
    setShowInfoPanel,
    removeMember,
    leaveChannel,
    fetchChannels,
    fetchCategories,
    categories,
  } = useChannelStore();
  // Always read the latest channel data from the store so privacy/name/topic
  // changes reflect immediately, even if the parent's re-render is delayed.
  const channel = useChannelStore((s) =>
    s.channels.find((c) => c._id === channelProp?._id) || channelProp
  );
  const { user } = useAuthStore();
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const isEnterpriseOrPro = activeWorkspace?.plan === 'enterprise' || activeWorkspace?.plan === 'pro';
  const { confirm } = useDeleteConfirm();
  const { isFavorited, toggleFavorite, favorites } = useFavoritesStore();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    if (showCategoryDropdown && departments.length === 0) {
      api.get('/categories/departments').then(({ data }) => {
        if (data.success) setDepartments(data.data);
      }).catch(err => console.error("Failed to fetch departments", err));
    }
  }, [showCategoryDropdown]);

  const channelId = channel?._id?.toString?.();
  const isStarred = channelId
    ? isFavorited("channel", channelId) || isFavorited("private_channel", channelId) || isFavorited("project", channelId)
    : false;
  const favoriteId = channelId
    ? favorites.find((f) => f.targetId === channelId)?._id
    : null;

  if (!channel) return null;

  const members        = membersByChannel[channel._id] || []
  const memberCount    = channel.memberCount ?? members.length
  const activeMembers  = members.filter((m) => m.registrationStatus !== 'faded')
  const fadedMembers   = members.filter((m) => m.registrationStatus === 'faded')
  
  const presenceMap = usePresenceStore((state) => state.presence);
  const onlineMembers  = activeMembers.filter((m) => {
    const id = m._id || m.userId;
    const status = presenceMap[id] || presenceMap[m.flowTaskUserId] || presenceMap[m.chatUserId] || m.onlineStatus || 'offline';
    return status === 'online';
  })
  const offlineMembers = activeMembers.filter((m) => {
    const id = m._id || m.userId;
    const status = presenceMap[id] || presenceMap[m.flowTaskUserId] || presenceMap[m.chatUserId] || m.onlineStatus || 'offline';
    return status !== 'online';
  })
  const ownerCount = members.filter(
    (m) => m.channelRole === "owner" || m.role === "owner",
  ).length
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
    channel.visibility === "private" ||
    (channel.visibility == null && channel.type === "private");
  const canManageMembership =
    isAdmin && !isDM && (!isSystem || channel?.slug === 'flowtask-managers') && !isSystemManagedProject && channel?.slug !== 'flowtask-admin';
  const isLastOwner = isOwner && (isResolvingMembers || ownerCount <= 1)
  const canLeaveChannel = !isSystem && !isSystemManagedProject && !isLastOwner;
  const canEditChannel = !isDM && isAdmin && !isSystemManagedProject;

  // Filter out current user's name from DM channel names
  const displayChannelName = useMemo(() => {
    if (!isDM) return channel.name
    
    let name = channel.name
    if (channel.dmParticipantNames && Array.isArray(channel.dmParticipantNames)) {
      const otherNames = channel.dmParticipantNames.filter(n => n !== user?.name)
      if (otherNames.length > 0) {
        name = otherNames.join(', ')
      }
    } else if (name && name.includes(',')) {
      const names = name.split(',').map(n => n.trim())
      const otherNames = names.filter(n => n !== user?.name)
      if (otherNames.length > 0) {
        name = otherNames.join(', ')
      }
    }
    return name
  }, [channel, isDM, user])

  /* ── ask for confirmation then act ── */
  const askRemove = async (memberId, memberName) => {
    const ok = await confirm({
      title: 'Remove member',
      message: `${memberName || 'This member'} will lose access to #${channel.name}.`,
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    try {
      await toast.promise(removeMember(channel._id, memberId), {
        loading: 'Removing member…',
        success: `${memberName || 'Member'} removed`,
        error: 'Failed to remove member',
      });
    } catch (err) {
      console.error(err);
    }
  };

  const askLeave = async () => {
    const ok = await confirm({
      title: 'Leave channel',
      message: `You will need to be re-added to rejoin #${channel.name}.`,
      confirmLabel: 'Leave',
    });
    if (!ok) return;
    try {
      await toast.promise(leaveChannel(channel._id), {
        loading: 'Leaving channel…',
        success: 'You left the channel',
        error: 'Failed to leave channel',
      });
      setShowInfoPanel(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAssignCategory = async (categoryId) => {
    const currentCat = categories.find(c => c.channelIds?.includes(channelId));
    const currentCatId = currentCat?._id?.toString?.();
    if (String(categoryId) === String(currentCatId || 'null')) {
      toast.error("You are already in this category.");
      return;
    }

    try {
      if (categoryId === null) {
        // Find which custom category currently has this channel and remove it
        if (currentCat && currentCat.type === "custom") {
          await api.removeChannelFromCategory(currentCat._id, channelId);
        }
      } else {
        await api.addBulkChannelsToCategory(categoryId, [channelId]);
      }
      toast.success("Channel category updated");
      await fetchCategories();
      setShowCategoryDropdown(false);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Failed to update category");
    }
  };

  return (
    <>

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
                  {displayChannelName}
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
                    {channel.visibility || channel.type} channel
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

            {/* Star / Unstar  */}
            {channelId && (
              <button
                onClick={() => {
                  const targetType =
                    channel.visibility === "private" || channel.type === "private"
                      ? "private_channel"
                      : channel.type === "project"
                        ? "project"
                        : "channel";
                  toggleFavorite(targetType, channelId);
                }}
                className="btn-ghost"
                style={{ fontSize: 12, padding: "6px 12px", gap: 6, flex: 1, justifyContent: "center" }}
              >
                <Star size={13} fill={isStarred ? "currentColor" : "none"} />
                {isStarred ? "Unstar" : "Star Channel"}
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
                Edit
              </button>
            )}

            {/* Move to Category */}
            {canEditChannel && (
              <div style={{ position: "relative", flex: 1, display: "flex" }}>
                <button
                  onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                  className="btn-ghost"
                  style={{ fontSize: 12, padding: "6px 12px", gap: 6, flex: 1, justifyContent: "center" }}
                >
                  <FolderInput size={13} />
                  Move To
                </button>
                {showCategoryDropdown && (
                  <div
                    className="absolute z-50 rounded-md shadow-lg py-1 text-sm"
                    style={{ 
                      top: "100%", 
                      right: 0, 
                      minWidth: "160px", 
                      marginTop: 4, 
                      maxHeight: "250px", 
                      overflowY: "auto",
                      background: "var(--bg-modal, var(--bg-secondary))",
                      border: "1px solid var(--border-primary)",
                      color: "var(--text-primary)"
                    }}
                  >
                    <button
                       className="w-full text-left transition-colors"
                       style={{ padding: "8px 16px", color: "var(--text-primary)" }}
                       onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-hover, var(--bg-hover))"; }}
                       onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                       onClick={() => handleAssignCategory(null, "category")}
                    >
                      (No Category)
                    </button>
                    
                    {categories?.filter(c => c.type === "custom").length > 0 && (
                      <>
                        <div style={{ padding: "6px 12px", fontSize: "11px", fontWeight: "bold", color: "var(--text-muted)", textTransform: "uppercase", marginTop: 4 }}>Custom Categories</div>
                        {categories.filter(c => c.type === "custom").map(cat => (
                          <button
                            key={cat._id}
                            className="w-full text-left transition-colors"
                            style={{ padding: "6px 16px", color: "var(--text-primary)" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-hover, var(--bg-hover))"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                            onClick={() => handleAssignCategory(cat._id)}
                          >
                            {cat.name}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
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
                        onRemove={() => askRemove(member._id, member.name)}
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
                        onRemove={() => askRemove(member._id, member.name)}
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