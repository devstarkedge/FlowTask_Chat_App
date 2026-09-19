import { useLiveProfileData } from '../../hooks/useLiveProfileData';
import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useDeleteConfirm } from "../../hooks/useDeleteConfirm";
import { useProfileStore } from "../../stores/profileStore";
import { useChannelStore } from "../../stores/channelStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { getDMPath } from "../../utils/chatRoutes";
import toast from "react-hot-toast";
import { ROLE_CFG } from "./WorkspaceSettingsModal";
import Avatar from "../chat/MemberAvatarGroup";
import { ChevronDown, User, MessageSquare, Crown, UserMinus, MoreVertical } from "lucide-react";
import "./custom-css/MembersTab.css";

function getMemberId(m) {
  if (!m) return "";
  if (typeof m === "string") return m;
  if (m._id) return String(m._id);
  if (m.userId) {
    if (typeof m.userId === "object" && m.userId._id) {
      return String(m.userId._id);
    }
    return String(m.userId);
  }
  return String(m.id || "");
}

/**
 * MembersTab - Redesigned member list with separate RoleSelector and ActionsMenu
 */
export default function MembersTab({
  members,
  loading,
  currentUserId,
  canManage,
  colors,
  onRemove,
  onUpdateRole,
  navigation,
  workspace,
  onCloseModal,
}) {
  members = useLiveProfileData(members);
  const [search, setSearch] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null);
  const { confirm } = useDeleteConfirm();

  const filtered = useMemo(() => {
    if (!search.trim()) return members;
    const q = search.toLowerCase();
    return members.filter((m) => {
      const name = (m.name || m.userId?.name || "").toLowerCase();
      const email = (m.email || m.userId?.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [members, search]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleRoleChange = async (memberId, newRole) => {
    try {
      await onUpdateRole(memberId, newRole);
      setOpenMenuId(null);
    } catch (error) {
      console.error("Failed to update role:", error);
    }
  };

  const handleRemoveMember = async (memberId, memberName) => {
    const ok = await confirm({
      title: "Remove member",
      message: `${memberName || "This member"} will lose access to this workspace.`,
      confirmLabel: "Remove",
    });
    if (ok) {
      await onRemove(memberId);
      setOpenMenuId(null);
    }
  };

  return (
    <div className="mt-container">
      {/* Search */}
      <div className="mt-search-bar">
        <SearchIcon />
        <input
          type="text"
          className="mt-search-input"
          placeholder="Search members..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Members List */}
      <div className="mt-members-list">
        {filtered.map((m, idx) => {
          const targetId = getMemberId(m);
          return (
            <MemberCard
              key={targetId || idx}
              member={m}
              currentUserId={currentUserId}
              canManage={canManage}
              isMenuOpen={openMenuId === targetId}
              isLast={filtered.length > 1 && idx >= filtered.length - 2}
              onMenuToggle={() =>
                setOpenMenuId(openMenuId === targetId ? null : targetId)
              }
              onRoleChange={handleRoleChange}
              onRemove={handleRemoveMember}
              menuRef={menuRef}
              workspace={workspace}
              navigation={navigation}
              onCloseModal={onCloseModal}
            />
          );
        })}
      </div>

      {filtered.length === 0 && !loading && (
        <div className="mt-empty-state">
          <UsersIcon />
          <p className="mt-empty-text">No members found</p>
          <p className="mt-empty-subtext">
            {search ? "Try a different search term" : "Members will appear here"}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * MemberCard - Individual member row with avatar, info, role selector, and actions menu
 */
function MemberCard({
  member,
  currentUserId,
  canManage,
  isMenuOpen,
  isLast,
  onMenuToggle,
  onRoleChange,
  onRemove,
  menuRef,
  workspace,
  navigation,
  onCloseModal,
}) {
  const navigate = useNavigate();
  const [isRoleOpen, setIsRoleOpen] = useState(false);
  const memberUser =
    member.userId && typeof member.userId === "object"
      ? member.userId
      : { _id: member.userId };
  const memberId = memberUser._id || member.userId;
  const isCurrentUser = memberId === currentUserId;
  const role = ROLE_CFG[member.role] || ROLE_CFG.member;

  // FlowTask synced workspace check: member is synced if the workspace is FlowTask-synced AND the member has a synced FlowTask identity/role
  const isFlowTaskWorkspace =
    workspace?.source === "flowtask" ||
    workspace?.settings?.flowtaskIntegration?.enabled === true ||
    !!workspace?.flowTaskRole;
  const isFlowTaskSyncedMember = !!(member.flowTaskAccess && member.flowTaskAccess.role);

  const canEditRole = canManage && !isCurrentUser && member.role !== "owner" && (!isFlowTaskWorkspace || !isFlowTaskSyncedMember);
  const canRemoveMember = canManage && !isCurrentUser && member.role !== "owner";

  const handleViewProfile = () => {
    onMenuToggle();
    const profileData = {
      _id: memberId,
      name: memberUser.name || member.displayName || member.name || "Unknown",
      email: memberUser.email || member.email || "",
      avatar: memberUser.avatar || member.avatar || memberUser.profilePicture,
      role: member.role,
      ...memberUser,
    };
    useProfileStore.getState().openProfile(profileData);
    if (onCloseModal) {
      onCloseModal();
    }
  };

  const handleMessageMember = async () => {
    onMenuToggle();
    try {
      const activeWsId = workspace?._id || useWorkspaceStore.getState().activeWorkspaceId;
      const channel = await useChannelStore.getState().createDM(memberId);
      if (channel?._id && activeWsId) {
        navigate(getDMPath(activeWsId, channel._id));
        if (onCloseModal) {
          onCloseModal();
        }
      }
    } catch (error) {
      console.error("Failed to start DM:", error);
      toast.error("Failed to message member");
    }
  };

  const handleRemoveClick = () => {
    onMenuToggle();
    if (isFlowTaskWorkspace || isFlowTaskSyncedMember) {
      toast.error("Cannot remove member because workspace is synced with FlowTask");
    } else {
      onRemove(memberId, memberUser.name || member.displayName || member.name);
    }
  };

  return (
    <div className={`mt-member-card ${isMenuOpen || isRoleOpen ? "is-menu-open" : ""} ${isLast ? "drop-up" : ""}`}>
      {/* Avatar */}
      <Avatar member={memberUser} size={40} />

      {/* Member Info */}
      <div className="mt-member-info">
        <div className="mt-member-name-row">
          <span className="mt-member-name">
            {memberUser.name || member.displayName || "Unknown"}
          </span>
          {isCurrentUser && <span className="mt-you-badge">you</span>}
        </div>
        <span className="mt-member-email">{memberUser.email || ""}</span>
      </div>

      {/* Role Selector */}
      <div className="mt-role-section">
        {canEditRole ? (
          <RoleSelector
            currentRole={member.role}
            roleConfig={role}
            onChange={(newRole) => onRoleChange(memberId, newRole)}
            onOpenChange={setIsRoleOpen}
          />
        ) : (
          <span
            className="mt-role-badge"
            style={{
              background: role.bg,
              color: role.color,
              border: `1.5px solid ${role.border}`,
            }}
          >
            <span className="mt-role-dot" style={{ background: role.dot }} />
            {role.label}
          </span>
        )}
      </div>

      {/* Actions Menu */}
      {canManage && !isCurrentUser && (
        <div className="mt-actions-section" ref={isMenuOpen ? menuRef : null}>
          <button
            className="mt-actions-btn"
            onClick={(e) => {
              e.stopPropagation();
              onMenuToggle();
            }}
            aria-label="Actions"
          >
            <MoreVertical size={16} />
          </button>

          {isMenuOpen && (
            <div className="mt-dropdown">
              <button
                className="mt-dropdown-item"
                onClick={handleViewProfile}
              >
                <User size={14} />
                View Profile
              </button>
              <button
                className="mt-dropdown-item"
                onClick={handleMessageMember}
              >
                <MessageSquare size={14} />
                Message Member
              </button>
              {member.role === "owner" && currentUserId !== memberId && (
                <button
                  className="mt-dropdown-item"
                  onClick={() => {
                    onMenuToggle();
                    if (
                      confirm({
                        title: "Transfer Ownership",
                        message: "Are you sure you want to transfer workspace ownership?",
                        confirmLabel: "Transfer",
                      })
                    ) {
                      onRoleChange(memberId, "owner");
                    }
                  }}
                >
                  <Crown size={14} />
                  Transfer Ownership
                </button>
              )}
              {canRemoveMember && (
                <>
                  <div className="mt-dropdown-sep" />
                  <button
                    className="mt-dropdown-item danger"
                    onClick={handleRemoveClick}
                  >
                    <UserMinus size={14} />
                    Remove Member
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * RoleSelector - Dropdown for changing member roles
 */
function RoleSelector({ currentRole, roleConfig, onChange, onOpenChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        if (onOpenChange) onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onOpenChange]);

  const availableRoles = ["admin", "member", "guest"].filter((r) => r !== currentRole);

  const toggleOpen = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (onOpenChange) onOpenChange(nextState);
  };

  return (
    <div className="mt-role-selector" ref={dropdownRef}>
      <button
        className="mt-role-btn"
        onClick={toggleOpen}
        aria-label="Change role"
      >
        <span
          className="mt-role-badge"
          style={{
            background: roleConfig.bg,
            color: roleConfig.color,
            border: `1.5px solid ${roleConfig.border}`,
          }}
        >
          <span className="mt-role-dot" style={{ background: roleConfig.dot }} />
          {roleConfig.label}
        </span>
        <ChevronDown
          size={12}
          style={{
            transition: "transform .18s",
            transform: isOpen ? "rotate(180deg)" : "none",
          }}
        />
      </button>

      {isOpen && (
        <div className="mt-role-dropdown">
          {availableRoles.map((role) => (
            <button
              key={role}
              className="mt-role-dropdown-item"
              onClick={() => {
                onChange(role);
                setIsOpen(false);
                if (onOpenChange) onOpenChange(false);
              }}
            >
              <span
                className="mt-role-dot"
                style={{ background: ROLE_CFG[role].dot }}
              />
              {ROLE_CFG[role].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Icons
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
