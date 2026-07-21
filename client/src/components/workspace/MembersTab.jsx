import { useState, useRef, useEffect, useMemo } from "react";
import { useDeleteConfirm } from "../../hooks/useDeleteConfirm";
import { ROLE_CFG } from "./WorkspaceSettingsModal";
import Avatar from "../chat/MemberAvatarGroup";
import { ChevronDown, User, MessageSquare, Crown, UserMinus, MoreVertical } from "lucide-react";
import "./custom-css/MembersTab.css";

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
}) {
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
        {filtered.map((m, idx) => (
          <MemberCard
            key={m._id || m.userId}
            member={m}
            currentUserId={currentUserId}
            canManage={canManage}
            isMenuOpen={openMenuId === (m._id || m.userId)}
            onMenuToggle={() =>
              setOpenMenuId(openMenuId === (m._id || m.userId) ? null : m._id || m.userId)
            }
            onRoleChange={handleRoleChange}
            onRemove={handleRemoveMember}
            menuRef={menuRef}
          />
        ))}
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
  onMenuToggle,
  onRoleChange,
  onRemove,
  menuRef,
}) {
  const memberUser =
    member.userId && typeof member.userId === "object"
      ? member.userId
      : { _id: member.userId };
  const memberId = memberUser._id || member.userId;
  const isCurrentUser = memberId === currentUserId;
  const role = ROLE_CFG[member.role] || ROLE_CFG.member;
  const canEditRole = canManage && !isCurrentUser && member.role !== "owner";

  return (
    <div className="mt-member-card">
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
        <div className="mt-actions-section" ref={menuRef}>
          <button
            className="mt-actions-btn"
            onClick={onMenuToggle}
            aria-label="Actions"
          >
            <MoreVertical size={16} />
          </button>

          {isMenuOpen && (
            <div className="mt-dropdown">
              <button
                className="mt-dropdown-item"
                onClick={() => {
                  onMenuToggle();
                  // Navigate to profile
                  if (navigation) {
                    navigation.navigate("UserProfile", { userId: memberId });
                  }
                }}
              >
                <User size={14} />
                View Profile
              </button>
              <button
                className="mt-dropdown-item"
                onClick={() => {
                  onMenuToggle();
                  // Open DM
                  if (navigation) {
                    navigation.navigate("Chat", { userId: memberId });
                  }
                }}
              >
                <MessageSquare size={14} />
                Message Member
              </button>
              {member.role === "owner" && currentUserId !== memberId && (
                <button
                  className="mt-dropdown-item"
                  onClick={() => {
                    onMenuToggle();
                    // Transfer ownership
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
              <div className="mt-dropdown-sep" />
              <button
                className="mt-dropdown-item danger"
                onClick={() => onRemove(memberId, memberUser.name || member.displayName)}
              >
                <UserMinus size={14} />
                Remove Member
              </button>
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
function RoleSelector({ currentRole, roleConfig, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const availableRoles = ["admin", "member", "guest"].filter((r) => r !== currentRole);

  return (
    <div className="mt-role-selector" ref={dropdownRef}>
      <button
        className="mt-role-btn"
        onClick={() => setIsOpen(!isOpen)}
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
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );


}



