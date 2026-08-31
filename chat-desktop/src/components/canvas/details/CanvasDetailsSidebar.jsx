import { X, Share2 } from "lucide-react";
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

// Extract user ID from populated or non-populated fields
function extractUserId(field) {
  if (!field) return null;
  if (typeof field === "object" && field._id) return field._id.toString();
  return field.toString();
}

/**
 * Compute the canvas role for the current user (same logic as in EnterpriseCanvasEditor).
 */
function getCanvasRole(canvas, currentUser) {
  if (!canvas || !currentUser) return null;
  const userId = currentUser._id?.toString();
  if (!userId) return null;

  // 1. Owner
  const createdById = extractUserId(canvas.createdBy);
  if (createdById === userId) return "owner";

  // 2. Editor — explicit or via accessLevel "edit"
  const users = canvas.permissions?.users || [];
  const userPerm = users.find((u) => u.userId?.toString() === userId);
  if (userPerm && userPerm.role === "editor") return "editor";
  if (canvas.permissions?.accessLevel === "edit") return "editor";

  // 3. Viewer — explicit or legacy
  if (userPerm && userPerm.role === "viewer") return "viewer";
  const legacyIds = canvas.permissions?.allowedUserIds || [];
  if (legacyIds.some((id) => id.toString() === userId)) return "viewer";
  if (canvas.permissions?.accessLevel === "view") return "viewer";

  // 4. Fallback via visibility
  const visibility = canvas.permissions?.visibility || "channel";
  if (visibility === "channel" || visibility === "workspace") return "viewer";

  return null;
}

/**
 * Get a display name and avatar for the owner.
 */
function getOwnerInfo(canvas, currentUser) {
  const createdBy = canvas?.createdBy;
  if (!createdBy) return { name: "Unknown", avatar: null };

  // Case 1: Populated object with name
  if (typeof createdBy === "object") {
    const name = createdBy.name || null;
    const avatar = createdBy.avatar || null;
    if (name) return { name, avatar };
    // If the populated object matches current user
    if (currentUser && createdBy._id?.toString() === currentUser._id?.toString()) {
      return { name: currentUser.name || "You", avatar: currentUser.avatar || null };
    }
    // If we have _id but no name, try current user
    if (currentUser && createdBy._id?.toString() === currentUser._id?.toString()) {
      return { name: currentUser.name || "You", avatar: currentUser.avatar || null };
    }
    return { name: "Unknown", avatar: null };
  }

  // Case 2: Plain ObjectId string
  const createdById = createdBy.toString();
  if (currentUser && createdById === currentUser._id?.toString()) {
    return { name: currentUser.name || "You", avatar: currentUser.avatar || null };
  }

  return { name: "Unknown", avatar: null };
}

/**
 * Get human-readable access level label.
 */
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

export default function CanvasDetailsSidebar({ canvas, onClose, onOpenShareModal }) {
  const user = useAuthStore((s) => s.user);
  const openTabsByChannel = useCanvasStore((s) => s.openTabsByChannel);

  const channelId = canvas?.channelId;
  const tabs = channelId ? openTabsByChannel[channelId] || [] : [];

  // Role for current user
  const role = getCanvasRole(canvas, user);

  // Owner info
  const ownerInfo = getOwnerInfo(canvas, user);
  const ownerName = ownerInfo.name;
  const ownerAvatar = ownerInfo.avatar;
  const isOwner = role === "owner";

  // Collaborators: users explicitly added in permissions.users
  const collaborators = canvas?.permissions?.users || [];
  const collaboratorCount = collaborators.length;

  const viewCount = canvas?.viewCount || 0;
  const accessLevelLabel = getAccessLevel(canvas);

  return (
    <aside className="canvas-sidebar canvas-details-sidebar" aria-label="Canvas details">
      <div className="canvas-sidebar-header">
        <div>
          <strong>Canvas</strong>
        </div>
        <button type="button" aria-label="Close details" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="canvas-details-content">
        {/* Title */}
        <h3 className="canvas-details-title">{canvas?.title || "Untitled canvas"}</h3>

        {/* Owner */}
        <div className="canvas-details-row">
          <span className="canvas-details-label">Owned by</span>
          <span className="canvas-details-value canvas-details-owner">
            {ownerAvatar ? (
              <img
                src={ownerAvatar}
                alt={ownerName}
                className="canvas-details-owner-avatar"
                style={{ width: 18, height: 18, borderRadius: "50%", marginRight: 6, verticalAlign: "middle" }}
              />
            ) : null}
            {ownerName}
            {isOwner && <span className="canvas-details-you">(you)</span>}
          </span>
        </div>

        {/* Created */}
        <div className="canvas-details-row">
          <span className="canvas-details-label">Created</span>
          <span className="canvas-details-value">{formatDate(canvas?.createdAt)}</span>
        </div>

        {/* Last updated */}
        <div className="canvas-details-row">
          <span className="canvas-details-label">Last updated</span>
          <span className="canvas-details-value">{formatDate(canvas?.updatedAt)}</span>
        </div>

        {/* Tabs section */}
        <div className="canvas-details-tabs">
          <h4 className="canvas-details-tabs-heading">
            Tabs {tabs.length > 0 && <span className="canvas-details-tabs-count">{tabs.length}</span>}
          </h4>
          {tabs.length === 0 ? (
            <div className="canvas-details-tabs-empty">No open tabs</div>
          ) : (
            <ul className="canvas-details-tabs-list">
              {tabs.map((tab) => (
                <li key={tab._id} className="canvas-details-tab-item">
                  <span className="canvas-details-tab-icon">📄</span>
                  <span className="canvas-details-tab-title">{tab.title || "Untitled"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Collaborators */}
        <div className="canvas-details-row">
          <span className="canvas-details-label">Collaborators</span>
          <span className="canvas-details-value">
            {collaboratorCount > 0
              ? `${collaboratorCount} ${collaboratorCount === 1 ? "person" : "people"}`
              : "None"}
          </span>
        </div>

        {/* Access Level */}
        <div className="canvas-details-row">
          <span className="canvas-details-label">Access Level</span>
          <span className="canvas-details-value">{accessLevelLabel}</span>
        </div>

        {/* View count */}
        <div className="canvas-details-row">
          <span className="canvas-details-label">Views</span>
          <span className="canvas-details-value">
            Viewed by {viewCount} {viewCount === 1 ? "person" : "people"}
          </span>
        </div>

        {/* Share button */}
        <div className="canvas-details-share">
          <button className="canvas-details-share-btn" onClick={onOpenShareModal}>
            <Share2 size={14} />
            Share canvas
          </button>
        </div>
      </div>
    </aside>
  );
}